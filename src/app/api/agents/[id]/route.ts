import { NextResponse } from "next/server";
import { abi, client, deployments, resolveMode } from "@/lib/chain";
import { MOCK_VAULTS } from "@/lib/mockData";
import { jsonSafe, log } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  log.ok("api", `GET /api/agents/${id}`);

  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) {
    log.warn("api", `GET /api/agents/${id} -> 400 not a bytes32 agentId`);
    return NextResponse.json(
      { error: "agentId must be a 0x-prefixed bytes32 (keccak256 of the agent name)" },
      { status: 400 },
    );
  }

  const mode = await resolveMode();

  if (mode === "live") {
    try {
      const d = deployments()!;
      const vault = await client().readContract({
        address: d.agentVault as `0x${string}`,
        abi: abi("AgentVault"),
        functionName: "getVaultInfo",
        args: [id as `0x${string}`],
      });
      log.ok("chain", `getVaultInfo(${id.slice(0, 10)}…) -> ok`);
      log.ok("api", `GET /api/agents/${id.slice(0, 10)}… -> 200 live in ${Date.now() - t0}ms`);
      return NextResponse.json({ mode, vault: jsonSafe(vault) });
    } catch (err) {
      log.fail("api", `GET /api/agents/${id} live read failed - falling back to mock`, err);
    }
  }

  const found = MOCK_VAULTS.find((v) => v.agentId.toLowerCase() === id.toLowerCase());
  if (!found) {
    log.warn("api", `GET /api/agents/${id.slice(0, 10)}… -> 404 unknown agent`);
    return NextResponse.json({ error: "unknown agentId" }, { status: 404 });
  }

  log.ok("api", `GET /api/agents/${id.slice(0, 10)}… -> 200 mock in ${Date.now() - t0}ms`);
  return NextResponse.json({ mode: "mock", vault: found });
}
