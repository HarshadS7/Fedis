import { NextResponse } from "next/server";
import { abi, client, deployments, resolveMode } from "@/lib/chain";
import { MOCK_VAULTS, labelFor } from "@/lib/mockData";
import { jsonSafe, log } from "@/lib/log";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown> & { agentId: string };

export async function GET() {
  const t0 = Date.now();
  log.ok("api", "GET /api/vaults");

  const mode = await resolveMode();

  if (mode === "live") {
    try {
      const d = deployments()!;
      const vaults = await client().readContract({
        address: d.agentVault as `0x${string}`,
        abi: abi("AgentVault"),
        functionName: "getAllVaultInfo",
      });
      // agentId is keccak256(name) on-chain, so the readable name has to be attached here.
      const rows = (jsonSafe(vaults) as Row[]).map((v) => ({
        ...v,
        agentName: labelFor(v.agentId),
      }));
      log.ok("chain", `getAllVaultInfo() -> ${rows.length} vaults`);
      log.ok("api", `GET /api/vaults -> 200 live in ${Date.now() - t0}ms`);
      return NextResponse.json({ mode, vaults: rows });
    } catch (err) {
      // Never swallow into an empty array: an empty list is indistinguishable from
      // a working-but-empty protocol and would silently break the demo.
      log.fail("api", "GET /api/vaults live read failed - falling back to mocks", err);
      return NextResponse.json({
        mode: "mock",
        degraded: true,
        error: String(err).slice(0, 200),
        vaults: MOCK_VAULTS,
      });
    }
  }

  log.ok("api", `GET /api/vaults -> 200 mock in ${Date.now() - t0}ms`);
  return NextResponse.json({ mode, vaults: MOCK_VAULTS });
}
