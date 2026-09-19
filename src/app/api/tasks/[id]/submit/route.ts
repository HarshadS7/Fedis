import { NextResponse } from "next/server";
import { keccak256, toBytes } from "viem";
import { resolveMode } from "@/lib/chain";
import { getTask, markExecuted, settleTask } from "@/lib/tasks";
import { jsonSafe, log } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * POST /api/tasks/[id]/submit - submit the result and settle.
 * Body: { result?: string, passed: boolean }
 *
 * `passed` stands in for the ValidationRouter, which is not built yet. This is the
 * honest boundary to state out loud: validation is currently an authorized call, not
 * an on-chain deterministic predicate.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t0 = Date.now();
  const { id } = await ctx.params;

  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) {
    return NextResponse.json({ error: "taskId must be a bytes32" }, { status: 400 });
  }

  const mode = await resolveMode();
  if (mode !== "live") {
    return NextResponse.json({ error: "no chain reachable", mode }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // an empty body defaults to a passing task
  }
  const passed = body.passed !== false;

  try {
    const before = await getTask(id);
    if (before.state !== "Bonded") {
      log.warn("api", `submit rejected: task is ${before.state}, expected Bonded`);
      return NextResponse.json(
        { error: `task is ${before.state}, can only submit from Bonded` },
        { status: 409 },
      );
    }

    const resultHash = keccak256(toBytes(String(body.result ?? "demo-result")));
    log.ok("api", `POST /api/tasks/${id.slice(0, 10)}…/submit passed=${passed}`);

    const execTx = await markExecuted(id, resultHash);
    const settleTx = await settleTask(id, passed);
    const task = await getTask(id);

    log.ok(
      "api",
      `POST submit -> 200 final=${task.state} (${passed ? "RELEASED" : "SLASHED"}) in ${Date.now() - t0}ms`,
    );
    return NextResponse.json({
      mode,
      validation: { passed, method: "authorized-call (ValidationRouter not yet built)" },
      tx: { executed: execTx, settled: settleTx },
      ...(jsonSafe(task) as object),
    });
  } catch (err) {
    log.fail("api", `POST /api/tasks/${id}/submit failed`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
