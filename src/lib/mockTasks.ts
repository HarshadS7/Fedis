import { keccak256, toBytes } from "viem";
import {
  DEMO_TRUSTED,
  FLAKY_AGENT_ID,
  labelFor,
} from "./mockData";
import type { TaskInfo, TaskStep } from "./types";

const usdc = (usd: number) => Math.round(usd * 1e6).toString();

export const DEMO_TASK_SLASHED = keccak256(toBytes("fedis.demo.task.slashed"));
export const DEMO_TASK_RELEASED = keccak256(toBytes("fedis.demo.task.released"));
export const DEMO_TASK_INFLIGHT = keccak256(toBytes("fedis.demo.task.inflight"));

export const DEMO_TASK_OPTIONS = [
  { id: DEMO_TASK_SLASHED, label: "Failed task (slashed)" },
  { id: DEMO_TASK_RELEASED, label: "Successful task (released)" },
  { id: DEMO_TASK_INFLIGHT, label: "In-flight (awaiting verify)" },
] as const;

const TX = {
  create: "0xabc1010000000000000000000000000000000000000000000000000000000001",
  bond: "0xabc1020000000000000000000000000000000000000000000000000000000002",
  execute: "0xabc1030000000000000000000000000000000000000000000000000000000003",
  verify: "0xabc1040000000000000000000000000000000000000000000000000000000004",
  release: "0xabc1050000000000000000000000000000000000000000000000000000000005",
  slash: "0xabc1060000000000000000000000000000000000000000000000000000000006",
} as const;

function step(
  id: string,
  label: string,
  status: TaskStep["status"],
  txHash?: string,
): TaskStep {
  return { id, label, status, txHash };
}

function baseTask(
  taskId: string,
  state: TaskInfo["state"],
  outcome: TaskInfo["outcome"],
  steps: TaskStep[],
  movements: TaskInfo["movements"],
): TaskInfo {
  return {
    taskId,
    agentId: FLAKY_AGENT_ID,
    agentName: labelFor(FLAKY_AGENT_ID),
    buyer: DEMO_TRUSTED,
    state,
    paymentAmount: usdc(100),
    requiredBond: usdc(50),
    maxCompensation: usdc(40),
    steps,
    movements,
    outcome,
  };
}

const MAINLINE = [
  step("intent", "INTENT", "complete"),
  step("created", "POLICY CREATED", "complete", TX.create),
  step("bonded", "AGENT BONDS", "complete", TX.bond),
  step("executed", "EXECUTE", "complete", TX.execute),
  step("verify", "VERIFY", "complete", TX.verify),
] as const;

export const MOCK_TASKS: Record<string, TaskInfo> = {
  [DEMO_TASK_SLASHED.toLowerCase()]: baseTask(
    DEMO_TASK_SLASHED,
    "slashed",
    "fail",
    [
      ...MAINLINE.map((s) => ({ ...s, status: "complete" as const })),
      step("slash", "FAIL: SLASH → COMPENSATE", "complete", TX.slash),
      step("release", "PASS: RELEASE → PAY", "pending"),
    ],
    [
      {
        from: "Buyer",
        to: "Premium pool",
        amount: usdc(1.1),
        label: "Task premium",
      },
      {
        from: "Agent",
        to: "Bond vault",
        amount: usdc(50),
        label: "Collateral bond",
      },
      {
        from: "Bond vault",
        to: "Buyer",
        amount: usdc(40),
        label: "Slash payout to buyer",
      },
    ],
  ),
  [DEMO_TASK_RELEASED.toLowerCase()]: baseTask(
    DEMO_TASK_RELEASED,
    "released",
    "pass",
    [
      ...MAINLINE.map((s) => ({ ...s, status: "complete" as const })),
      step("release", "PASS: RELEASE → PAY", "complete", TX.release),
      step("slash", "FAIL: SLASH → COMPENSATE", "pending"),
    ],
    [
      {
        from: "Buyer",
        to: "Premium pool",
        amount: usdc(1.1),
        label: "Task premium",
      },
      {
        from: "Agent",
        to: "Bond vault",
        amount: usdc(50),
        label: "Collateral bond",
      },
      {
        from: "Escrow",
        to: "Agent",
        amount: usdc(100),
        label: "Task payment",
      },
      {
        from: "Bond vault",
        to: "Agent",
        amount: usdc(50),
        label: "Bond released",
      },
    ],
  ),
  [DEMO_TASK_INFLIGHT.toLowerCase()]: baseTask(
    DEMO_TASK_INFLIGHT,
    "executed",
    "pending",
    [
      step("intent", "INTENT", "complete"),
      step("created", "POLICY CREATED", "complete", TX.create),
      step("bonded", "AGENT BONDS", "complete", TX.bond),
      step("executed", "EXECUTE", "complete", TX.execute),
      step("verify", "VERIFY", "active"),
      step("release", "PASS: RELEASE → PAY", "pending"),
      step("slash", "FAIL: SLASH → COMPENSATE", "pending"),
    ],
    [
      {
        from: "Buyer",
        to: "Premium pool",
        amount: usdc(1.1),
        label: "Task premium",
      },
      {
        from: "Agent",
        to: "Bond vault",
        amount: usdc(50),
        label: "Collateral bond",
      },
    ],
  ),
};

export function mockTask(taskId: string): TaskInfo | null {
  return MOCK_TASKS[taskId.toLowerCase()] ?? null;
}
