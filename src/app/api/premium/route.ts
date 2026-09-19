import { NextResponse } from "next/server";
import { abi, client, deployments, resolveMode } from "@/lib/chain";
import { mockQuote } from "@/lib/mockData";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * GET /api/premium?agentId=0x..&user=0x..&taskCost=100000000
 * taskCost is USDC in 6dp base units (100000000 = $100).
 * Returns the full breakdown so the UI can show WHY a quote is what it is.
 */
export async function GET(req: Request) {
  const t0 = Date.now();
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId") ?? "";
  const user = url.searchParams.get("user") ?? ZERO;
  const taskCostRaw = url.searchParams.get("taskCost") ?? "100000000";

  log.ok("api", `GET /api/premium agentId=${agentId.slice(0, 10)}… taskCost=${taskCostRaw}`);

  if (!/^0x[0-9a-fA-F]{64}$/.test(agentId)) {
    return NextResponse.json({ error: "agentId must be a bytes32" }, { status: 400 });
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(user)) {
    return NextResponse.json({ error: "user must be an address" }, { status: 400 });
  }

  let taskCost: bigint;
  try {
    taskCost = BigInt(taskCostRaw);
    if (taskCost <= 0n) throw new Error("taskCost must be positive");
  } catch {
    return NextResponse.json(
      { error: "taskCost must be a positive integer in USDC base units (6dp)" },
      { status: 400 },
    );
  }

  const mode = await resolveMode();

  if (mode === "live") {
    try {
      const d = deployments()!;
      const [premium, multiplierBps, agentRiskBps, trustScore] = (await client().readContract({
        address: d.premiumEngine as `0x${string}`,
        abi: abi("PremiumEngine"),
        functionName: "quote",
        args: [agentId as `0x${string}`, user as `0x${string}`, taskCost],
      })) as [bigint, bigint, bigint, bigint];

      log.ok("chain", `quote() -> premium=${premium} mult=${multiplierBps}bps score=${trustScore}`);
      log.ok("api", `GET /api/premium -> 200 live in ${Date.now() - t0}ms`);
      return NextResponse.json({
        mode,
        premium: premium.toString(),
        multiplierBps: multiplierBps.toString(),
        agentRiskBps: agentRiskBps.toString(),
        trustScore: trustScore.toString(),
      });
    } catch (err) {
      log.fail("api", "GET /api/premium live read failed - falling back to mock", err);
    }
  }

  const q = mockQuote(agentId, taskCost);
  log.ok("api", `GET /api/premium -> 200 mock in ${Date.now() - t0}ms`);
  return NextResponse.json({ mode: "mock", ...q });
}
