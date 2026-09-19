import { NextResponse } from "next/server";
import {
  benchNodeReachable,
  benchRpcUrl,
  demoFireFromBench,
  readBenchFile,
} from "@/lib/bench";
import { runFireScript } from "./run-script";
import { resolveMode } from "@/lib/chain";
import { log } from "@/lib/log";
import { MOCK_VAULTS } from "@/lib/mockData";

export const dynamic = "force-dynamic";

/**
 * POST /api/demo/fire - the parallelism benchmark.
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
  const benchUp = await benchNodeReachable();

  if (mode === "live" && benchUp) {
    log.ok("bench", `live bench node reachable at ${benchRpcUrl()}`);
    const events: Array<{ type: string }> = [];
    const result = await runFireScript(n, (event) => {
      events.push(event);
    });

    if (result) {
      log.ok("bench", `POST /api/demo/fire -> 200 live in ${Date.now() - t0}ms`);
      return NextResponse.json({
        ...result,
        durationMs: Date.now() - t0,
      });
    }

    const cached = readBenchFile();
    if (cached) {
      const fromFile = demoFireFromBench(cached, "live");
      log.ok("bench", `POST /api/demo/fire -> 200 live (cached file) in ${Date.now() - t0}ms`);
      return NextResponse.json({
        ...fromFile,
        durationMs: Date.now() - t0,
      });
    }
  }

  if (mode === "live" && !benchUp) {
    const cached = readBenchFile();
    if (cached) {
      log.warn("bench", "bench node down — serving last measured run from disk");
      return NextResponse.json({
        ...demoFireFromBench(cached, "live"),
        durationMs: Date.now() - t0,
        note: "Serving last measured run from contracts/bench-latest.json (bench node unreachable).",
      });
    }

    log.warn("bench", "live benchmark unavailable — no bench node and no cached file");
    return NextResponse.json(
      {
        mode,
        available: false,
        reason:
          `Bench node unreachable at ${benchRpcUrl()}. Start a separate anvil on :8547, ` +
          "deploy + seed, then run: node contracts/script/fire.mjs --n 50",
      },
      { status: 503 },
    );
  }

  const agents = MOCK_VAULTS.map((v) => v.agentId);
  const payload = {
    mode,
    simulated: true,
    note: "ILLUSTRATIVE SHAPE ONLY - not a measurement. Use /api/demo/fire/stream for live UI.",
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
