import { NextResponse } from "next/server";
import { resolveMode } from "@/lib/chain";
import { log } from "@/lib/log";
import { DEMO_TASK_SLASHED, mockTask } from "@/lib/mockTasks";
import { presentTask } from "@/lib/taskPresent";

export const dynamic = "force-dynamic";

/**
 * GET /api/tasks/[id] — protected task lifecycle.
 * Live: reads TaskPolicy + BondVault and reconstructs steps from chain events.
 * Mock: serves fixtures when the node is down or the task id is unknown on-chain.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const t0 = Date.now();
  const { id } = await params;
  log.ok("api", `GET /api/tasks/${id.slice(0, 10)}…`);

  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) {
    return NextResponse.json({ error: "id must be a bytes32" }, { status: 400 });
  }

  const mode = await resolveMode();

  if (mode === "live") {
    try {
      const task = await presentTask(id);
      if (task) {
        log.ok(
          "api",
          `GET /api/tasks/${id.slice(0, 10)}… -> 200 live state=${task.state} in ${Date.now() - t0}ms`,
        );
        return NextResponse.json({
          mode,
          task,
          defaultDemoId: DEMO_TASK_SLASHED,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - t0,
        });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log.warn("api", `live task read failed for ${id.slice(0, 10)}… — trying mock: ${detail}`);
    }
  }

  const task = mockTask(id);
  if (!task) {
    return NextResponse.json({ error: "unknown task id" }, { status: 404 });
  }

  log.ok("api", `GET /api/tasks/${id.slice(0, 10)}… -> 200 ${mode} fixture in ${Date.now() - t0}ms`);
  return NextResponse.json({
    mode: mode === "live" ? "mock" : mode,
    task,
    defaultDemoId: DEMO_TASK_SLASHED,
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    degraded: mode === "live",
    note:
      mode === "live"
        ? "Task not found on-chain — run npm run seed:tasks after deploy."
        : undefined,
  });
}
