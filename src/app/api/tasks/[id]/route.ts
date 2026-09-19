import { NextResponse } from "next/server";
import { resolveMode } from "@/lib/chain";
import { log } from "@/lib/log";
import { DEMO_TASK_SLASHED, mockTask } from "@/lib/mockTasks";

export const dynamic = "force-dynamic";

/**
 * GET /api/tasks/[id] — protected task lifecycle.
 * id must be a bytes32. Returns mock fixtures until Person B wires TaskPolicy reads.
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
  const task = mockTask(id);

  if (!task) {
    return NextResponse.json({ error: "unknown task id" }, { status: 404 });
  }

  log.ok("api", `GET /api/tasks/${id.slice(0, 10)}… -> 200 ${mode} in ${Date.now() - t0}ms`);
  return NextResponse.json({
    mode,
    task,
    defaultDemoId: DEMO_TASK_SLASHED,
  });
}
