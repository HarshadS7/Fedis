import { formatUnits } from "viem";
import { abi, client, deployments } from "./chain";
import { labelFor, DEMO_TRUSTED, agentId } from "./mockData";
import { getTask, type TaskState } from "./tasks";
import type {
  MoneyMovement,
  TaskInfo,
  TaskLifecycleState,
  TaskStep,
  TaskStepStatus,
} from "./types";

export type TaskTxHashes = {
  create?: string;
  bond?: string;
  execute?: string;
  release?: string;
  slash?: string;
};

const FLAKY = agentId("flaky-scraper-v0");

function policyField(policy: Record<string, unknown>, key: string): bigint {
  const v = policy[key];
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  if (typeof v === "string") return BigInt(v);
  return 0n;
}

function policyAddress(policy: Record<string, unknown>, key: string): string {
  const v = policy[key];
  return typeof v === "string" ? v : "";
}

function toLifecycleState(state: TaskState): TaskLifecycleState {
  switch (state) {
    case "Created":
      return "created";
    case "Bonded":
      return "bonded";
    case "Executed":
      return "executed";
    case "Released":
      return "released";
    case "Slashed":
      return "slashed";
    default:
      return "intent";
  }
}

function stepStatus(
  stepId: string,
  stateIdx: number,
): TaskStepStatus {
  const order: Record<string, number> = {
    intent: 0,
    created: 1,
    bonded: 2,
    executed: 3,
    verify: 4,
    release: 5,
    slash: 5,
  };
  const current =
    stateIdx <= 0
      ? 0
      : stateIdx === 1
        ? 1
        : stateIdx === 2
          ? 2
          : stateIdx === 3
            ? 3
            : stateIdx === 4
              ? 5
              : 6;

  const stepOrder = order[stepId] ?? 0;

  if (stepId === "verify") {
    if (stateIdx === 3) return "active";
    if (stateIdx >= 4) return "complete";
    return "pending";
  }
  if (stepId === "release") {
    return stateIdx === 4 ? "complete" : "pending";
  }
  if (stepId === "slash") {
    return stateIdx === 5 ? "complete" : "pending";
  }

  if (current > stepOrder) return "complete";
  if (current === stepOrder) return "active";
  return "pending";
}

function buildSteps(stateIdx: number, txs: TaskTxHashes): TaskStep[] {
  const defs = [
    { id: "intent", label: "INTENT" },
    { id: "created", label: "POLICY CREATED" },
    { id: "bonded", label: "AGENT BONDS" },
    { id: "executed", label: "EXECUTE" },
    { id: "verify", label: "VERIFY" },
    { id: "release", label: "PASS: RELEASE → PAY" },
    { id: "slash", label: "FAIL: SLASH → COMPENSATE" },
  ] as const;

  const txByStep: Record<string, string | undefined> = {
    created: txs.create,
    bonded: txs.bond,
    executed: txs.execute,
    release: txs.release,
    slash: txs.slash,
  };

  return defs.map((d) => ({
    id: d.id,
    label: d.label,
    status: stepStatus(d.id, stateIdx),
    txHash: txByStep[d.id],
  }));
}

async function fetchPremiumUsdc(agentIdHex: string, buyer: string, taskCost: bigint) {
  const d = deployments();
  if (!d?.premiumEngine) return null;
  try {
    const premium = (await client().readContract({
      address: d.premiumEngine as `0x${string}`,
      abi: abi("PremiumEngine"),
      functionName: "calculatePremium",
      args: [agentIdHex as `0x${string}`, buyer as `0x${string}`, taskCost],
    })) as bigint;
    return premium.toString();
  } catch {
    return null;
  }
}

async function slashPayout(taskId: string): Promise<string | null> {
  const d = deployments();
  if (!d?.bondVault) return null;
  try {
    const logs = await client().getContractEvents({
      address: d.bondVault as `0x${string}`,
      abi: abi("BondVault"),
      eventName: "BondSlashed",
      args: { taskId: taskId as `0x${string}` },
      fromBlock: 0n,
      toBlock: "latest",
    });
    const last = logs[logs.length - 1];
    if (!last) return null;
    const paid = (last.args as { paidToBuyer?: bigint }).paidToBuyer;
    return paid?.toString() ?? null;
  } catch {
    return null;
  }
}

function buildMovements(
  stateIdx: number,
  policy: Record<string, unknown>,
  premium: string | null,
  slashPaid: string | null,
): MoneyMovement[] {
  const payment = policyField(policy, "paymentAmount");
  const bond = policyField(policy, "requiredBond");
  const maxComp = policyField(policy, "maxCompensation");

  const movements: MoneyMovement[] = [
    {
      from: "Buyer",
      to: "Premium pool",
      amount: premium ?? "1100000",
      label: "Task premium",
    },
    {
      from: "Agent",
      to: "Bond vault",
      amount: bond.toString(),
      label: "Collateral bond",
    },
  ];

  if (stateIdx === 4) {
    movements.push(
      {
        from: "Escrow",
        to: "Agent",
        amount: payment.toString(),
        label: "Task payment",
      },
      {
        from: "Bond vault",
        to: "Agent",
        amount: bond.toString(),
        label: "Bond released",
      },
    );
  }

  if (stateIdx === 5) {
    movements.push({
      from: "Bond vault",
      to: "Buyer",
      amount: slashPaid ?? maxComp.toString(),
      label: "Slash payout to buyer",
    });
  }

  return movements;
}

export async function fetchTaskTxHashes(taskId: string): Promise<TaskTxHashes> {
  const d = deployments();
  if (!d?.taskPolicy || !d?.bondVault) return {};

  const taskIdHex = taskId as `0x${string}`;
  const policyAddr = d.taskPolicy as `0x${string}`;
  const vaultAddr = d.bondVault as `0x${string}`;

  const [created, bonded, executed, released, slashed, bondLocked, bondReleased, bondSlashed] =
    await Promise.all([
      client().getContractEvents({
        address: policyAddr,
        abi: abi("TaskPolicy"),
        eventName: "TaskCreated",
        args: { taskId: taskIdHex },
        fromBlock: 0n,
        toBlock: "latest",
      }),
      client().getContractEvents({
        address: policyAddr,
        abi: abi("TaskPolicy"),
        eventName: "TaskBonded",
        args: { taskId: taskIdHex },
        fromBlock: 0n,
        toBlock: "latest",
      }),
      client().getContractEvents({
        address: policyAddr,
        abi: abi("TaskPolicy"),
        eventName: "TaskExecuted",
        args: { taskId: taskIdHex },
        fromBlock: 0n,
        toBlock: "latest",
      }),
      client().getContractEvents({
        address: policyAddr,
        abi: abi("TaskPolicy"),
        eventName: "TaskReleased",
        args: { taskId: taskIdHex },
        fromBlock: 0n,
        toBlock: "latest",
      }),
      client().getContractEvents({
        address: policyAddr,
        abi: abi("TaskPolicy"),
        eventName: "TaskSlashed",
        args: { taskId: taskIdHex },
        fromBlock: 0n,
        toBlock: "latest",
      }),
      client().getContractEvents({
        address: vaultAddr,
        abi: abi("BondVault"),
        eventName: "BondLocked",
        args: { taskId: taskIdHex },
        fromBlock: 0n,
        toBlock: "latest",
      }),
      client().getContractEvents({
        address: vaultAddr,
        abi: abi("BondVault"),
        eventName: "BondReleased",
        args: { taskId: taskIdHex },
        fromBlock: 0n,
        toBlock: "latest",
      }),
      client().getContractEvents({
        address: vaultAddr,
        abi: abi("BondVault"),
        eventName: "BondSlashed",
        args: { taskId: taskIdHex },
        fromBlock: 0n,
        toBlock: "latest",
      }),
    ]);

  const tx = (logs: { transactionHash: string }[]) =>
    logs.length ? logs[logs.length - 1].transactionHash : undefined;

  return {
    create: tx(created),
    bond: tx(bonded) ?? tx(bondLocked),
    execute: tx(executed),
    release: tx(released) ?? tx(bondReleased),
    slash: tx(slashed) ?? tx(bondSlashed),
  };
}

export async function presentTask(taskId: string): Promise<TaskInfo | null> {
  const raw = await getTask(taskId);
  if (raw.stateIndex === 0) return null;

  const policy = raw.policy as Record<string, unknown>;
  const agentIdRaw = policy.agentId;
  const agentIdStr =
    typeof agentIdRaw === "string"
      ? agentIdRaw
      : `0x${policyField(policy, "agentId").toString(16).padStart(64, "0")}`;
  const buyer = policyAddress(policy, "buyer");
  const payment = policyField(policy, "paymentAmount");
  const bond = policyField(policy, "requiredBond");
  const maxComp = policyField(policy, "maxCompensation");

  const [txs, premium, slashPaid] = await Promise.all([
    fetchTaskTxHashes(taskId),
    fetchPremiumUsdc(agentIdStr, buyer, payment),
    raw.stateIndex === 5 ? slashPayout(taskId) : Promise.resolve(null),
  ]);

  const outcome =
    raw.stateIndex === 4 ? "pass" : raw.stateIndex === 5 ? "fail" : "pending";

  return {
    taskId,
    agentId: agentIdStr,
    agentName: labelFor(agentIdStr),
    buyer,
    state: toLifecycleState(raw.state as TaskState),
    paymentAmount: payment.toString(),
    requiredBond: bond.toString(),
    maxCompensation: maxComp.toString(),
    steps: buildSteps(raw.stateIndex, txs),
    movements: buildMovements(raw.stateIndex, policy, premium, slashPaid),
    outcome,
  };
}

/** Demo constants shared with the seed script and mock fixtures. */
export const DEMO_TASK_PARAMS = {
  agentId: FLAKY,
  buyer: DEMO_TRUSTED,
  paymentAmount: 100_000_000n,
  requiredBond: 50_000_000n,
  maxCompensation: 40_000_000n,
  deadlineSeconds: 86_400,
  validationMethod: 0,
} as const;

export function formatTaskSummary(task: TaskInfo): string {
  return `${task.agentName} · ${task.state} · payment ${formatUnits(BigInt(task.paymentAmount), 6)} USDC`;
}
