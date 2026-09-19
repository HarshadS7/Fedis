import { NextResponse } from "next/server";
import { resolveMode } from "@/lib/chain";
import { log } from "@/lib/log";
import { MOCK_VAULTS } from "@/lib/mockData";

export const dynamic = "force-dynamic";

/**
 * POST /api/demo/fire - the parallelism benchmark.
 *
 * Two workloads, reported separately:
 *   independent - N txs across N DIFFERENT agentIds (isolated storage slots)
 *   conflicting - N txs all hitting the SAME agentId
 *
 * IMPORTANT (honesty rule): in mock mode this returns `simulated: true` and the UI
 * MUST render it as illustrative, not as a measurement. We do not put invented
 * numbers on screen as if they came from a chain.
 */
export async function POST(req: Request) {
  const t0 = Date.now();
  let n = 50;
  try {
    const body = await req.json();
    if (body && typeof body.n === "number") n = Math.max(1, Math.min(500, body.n));
  } catch {
    // no body is fine, use the default
  }

  log.ok("bench", `POST /api/demo/fire n=${n}`);
  const mode = await resolveMode();

  if (mode === "live") {
    // Blocked on two things owned by Person A - see the note in the response.
    // Returning an explicit unavailable beats inventing numbers.
    log.warn("bench", "live benchmark not wired yet - returning 503 rather than fake numbers");
    return NextResponse.json(
      {
        mode,
        available: false,
        reason:
          "Live benchmark not wired. AgentVault.bond() is onlyAuthorized, so N burner " +
          "wallets cannot call it directly - either authorize them first, or use the " +
          "permissionless deposit() path as the isolated workload (needs MockUSDC minted " +
          "to each wallet).",
      },
      { status: 503 },
    );
  }

  const agents = MOCK_VAULTS.map((v) => v.agentId);
  const payload = {
    mode,
    simulated: true,
    note: "ILLUSTRATIVE SHAPE ONLY - not a measurement. Render as simulated.",
    n,
    workloads: {
      independent: {
        label: "Independent (N agents, isolated storage)",
        agentsTouched: agents.length,
        txCount: n,
        reverts: 0,
        series: "series-1",
      },
      conflicting: {
        label: "Conflicting (N txs, same agent)",
        agentsTouched: 1,
        txCount: n,
        reverts: 0,
        series: "series-2",
      },
    },
    monadPublishedSpec: { blockTimeMs: 400, finalityMs: 800 },
    ourMeasurements: null,
  };

  log.ok("bench", `POST /api/demo/fire -> 200 simulated in ${Date.now() - t0}ms`);
  return NextResponse.json(payload);
}
