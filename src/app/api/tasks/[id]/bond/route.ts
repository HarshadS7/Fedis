import { NextResponse } from "next/server";
import { resolveMode } from "@/lib/chain";
import { bondTask, getTask } from "@/lib/tasks";
import { jsonSafe, log } from "@/lib/log";

export const dynamic = "force-dynamic";

/** POST /api/tasks/[id]/bond - agent locks collateral, advancing Created -> Bonded. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t0 = Date.now();
  const { id } = await ctx.params;

  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) {
    return NextResponse.json({ error: "taskId must be a bytes32" }, { status: 400 });
  }

  const mode = await resolveMode();
  if (mode !== "live") {
    return NextResponse.json({ error: "no chain reachable", mode }, { status: 503 });
  }

  try {
    const before = await getTask(id);
    if (before.state !== "Created") {
      log.warn("api", `bond rejected: task is ${before.state}, expected Created`);
      return NextResponse.json(
        { error: `task is ${before.state}, can only bond from Created` },
        { status: 409 },
      );
    }

    const requiredBond = BigInt(String((before.policy as Record<string, unknown>).requiredBond));
    log.ok("api", `POST /api/tasks/${id.slice(0, 10)}…/bond requiredBond=${requiredBond}`);

    const tx = await bondTask(id, requiredBond);
    const task = await getTask(id);

    log.ok("api", `POST bond -> 200 state=${task.state} in ${Date.now() - t0}ms`);
    return NextResponse.json({ mode, tx, ...(jsonSafe(task) as object) });
  } catch (err) {
    log.fail("api", `POST /api/tasks/${id}/bond failed`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
