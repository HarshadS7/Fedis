import { NextResponse } from "next/server";
import { keccak256, toBytes } from "viem";
import { resolveMode } from "@/lib/chain";
import { createTask, getTask } from "@/lib/tasks";
import { jsonSafe, log } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * POST /api/tasks - create a protected task policy.
 * Body: { taskId?, agentName|agentId, buyer, paymentAmount, requiredBond,
 *         maxCompensation, deadlineSeconds?, validationMethod? }
 * Amounts are USDC base units (6dp) as strings.
 */
export async function POST(req: Request) {
  const t0 = Date.now();

  const mode = await resolveMode();
  if (mode !== "live") {
    log.warn("api", "POST /api/tasks -> 503, no chain reachable");
    return NextResponse.json(
      { error: "no chain reachable - bonded execution needs a live node", mode },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  const agentId =
    typeof body.agentId === "string"
      ? body.agentId
      : typeof body.agentName === "string"
        ? keccak256(toBytes(body.agentName))
        : null;

  if (!agentId || !/^0x[0-9a-fA-F]{64}$/.test(agentId)) {
    return NextResponse.json({ error: "agentId (bytes32) or agentName required" }, { status: 400 });
  }
  if (typeof body.buyer !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(body.buyer)) {
    return NextResponse.json({ error: "buyer must be an address" }, { status: 400 });
  }

  const taskId =
    typeof body.taskId === "string" && /^0x[0-9a-fA-F]{64}$/.test(body.taskId)
      ? body.taskId
      : keccak256(toBytes(`task-${Date.now()}-${Math.random()}`));

  try {
    const requiredBond = BigInt((body.requiredBond as string) ?? "50000000");
    const maxCompensation = BigInt((body.maxCompensation as string) ?? "100000000");
    const paymentAmount = BigInt((body.paymentAmount as string) ?? "100000000");
    const deadline =
      BigInt(Math.floor(Date.now() / 1000)) + BigInt((body.deadlineSeconds as number) ?? 3600);

    log.ok("api", `POST /api/tasks taskId=${taskId.slice(0, 10)}… bond=${requiredBond}`);

    const tx = await createTask({
      taskId,
      agentId,
      buyer: body.buyer,
      paymentAmount,
      requiredBond,
      maxCompensation,
      deadline,
      validationMethod: Number(body.validationMethod ?? 0),
      validationDataHash: keccak256(toBytes(String(body.validationData ?? "demo"))),
    });

    const task = await getTask(taskId);
    log.ok("api", `POST /api/tasks -> 201 in ${Date.now() - t0}ms state=${task.state}`);
    return NextResponse.json({ mode, taskId, tx, ...(jsonSafe(task) as object) }, { status: 201 });
  } catch (err) {
    log.fail("api", "POST /api/tasks failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
