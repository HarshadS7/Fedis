import { keccak256, toBytes } from "viem";
import { abi, client, deployments, middlewareAddress, wallet } from "./chain";
import { log } from "./log";

/** TaskPolicy.State — index matches the Solidity enum order. */
export const TASK_STATES = [
  "None",
  "Created",
  "Bonded",
  "Executed",
  "Released",
  "Slashed",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

export const taskIdFor = (s: string) => keccak256(toBytes(s));

function addrs() {
  const d = deployments();
  if (!d?.taskPolicy || !d?.bondVault) {
    throw new Error(
      "taskPolicy/bondVault missing from deployments JSON - redeploy with the updated Deploy.s.sol",
    );
  }
  return {
    taskPolicy: d.taskPolicy as `0x${string}`,
    bondVault: d.bondVault as `0x${string}`,
    usdc: d.usdc as `0x${string}`,
  };
}

/** Waits for the receipt so every write logs its real tx hash, gas, and block. */
async function send(
  label: string,
  address: `0x${string}`,
  contract: Parameters<typeof abi>[0],
  functionName: string,
  args: unknown[],
) {
  const hash = await wallet().writeContract({
    address,
    abi: abi(contract),
    functionName,
    args,
    chain: null,
    account: wallet().account!,
  });
  const receipt = await client().waitForTransactionReceipt({ hash });
  log.ok(
    "chain",
    `${label} -> ${hash} gas=${receipt.gasUsed} block=${receipt.blockNumber} status=${receipt.status}`,
  );
  if (receipt.status !== "success") throw new Error(`${label} reverted (${hash})`);
  return { hash, gasUsed: receipt.gasUsed.toString(), blockNumber: receipt.blockNumber.toString() };
}

export type CreateTaskInput = {
  taskId: string;
  agentId: string;
  buyer: string;
  paymentAmount: bigint;
  requiredBond: bigint;
  maxCompensation: bigint;
  deadline: bigint;
  /** 0 = OracleThreshold, 1 = SignedAttestation (see TaskPolicy.ValidationMethod) */
  validationMethod: number;
  validationDataHash: string;
};

export async function createTask(i: CreateTaskInput) {
  const { taskPolicy } = addrs();
  return send("TaskPolicy.createTask", taskPolicy, "TaskPolicy", "createTask", [
    i.taskId,
    i.agentId,
    i.buyer,
    i.paymentAmount,
    i.requiredBond,
    i.maxCompensation,
    i.deadline,
    i.validationMethod,
    i.validationDataHash,
  ]);
}

/**
 * Locks the bond. lockBond pulls collateral via transferFrom, so the bonding account
 * must hold USDC and have approved BondVault. On a local chain MockUSDC has an open
 * faucet, so we top up and approve first rather than failing with an opaque revert.
 */
export async function bondTask(taskId: string, requiredBond: bigint) {
  const { taskPolicy, bondVault, usdc } = addrs();
  const me = middlewareAddress();

  const balance = (await client().readContract({
    address: usdc,
    abi: abi("MockUSDC"),
    functionName: "balanceOf",
    args: [me],
  })) as bigint;

  if (balance < requiredBond) {
    log.warn("chain", `bonder short ${requiredBond - balance} USDC - minting from faucet`);
    await send("MockUSDC.mint", usdc, "MockUSDC", "mint", [me, requiredBond - balance]);
  }

  await send("MockUSDC.approve", usdc, "MockUSDC", "approve", [bondVault, requiredBond]);
  void taskPolicy;
  return send("BondVault.lockBond", bondVault, "BondVault", "lockBond", [taskId]);
}

export async function markExecuted(taskId: string, resultHash: string) {
  const { taskPolicy } = addrs();
  return send("TaskPolicy.markExecuted", taskPolicy, "TaskPolicy", "markExecuted", [
    taskId,
    resultHash,
  ]);
}

/** Settlement. `passed` releases the bond; otherwise the buyer is compensated. */
export async function settleTask(taskId: string, passed: boolean) {
  const { bondVault } = addrs();
  return passed
    ? send("BondVault.release", bondVault, "BondVault", "release", [taskId])
    : send("BondVault.slash", bondVault, "BondVault", "slash", [taskId]);
}

export async function getTask(taskId: string) {
  const { taskPolicy, bondVault } = addrs();

  const policy = (await client().readContract({
    address: taskPolicy,
    abi: abi("TaskPolicy"),
    functionName: "getPolicy",
    args: [taskId],
  })) as Record<string, unknown>;

  const bond = (await client().readContract({
    address: bondVault,
    abi: abi("BondVault"),
    functionName: "getBond",
    args: [taskId],
  })) as Record<string, unknown>;

  const stateIdx = Number(policy.state ?? 0);
  return {
    taskId,
    state: TASK_STATES[stateIdx] ?? "Unknown",
    stateIndex: stateIdx,
    policy,
    bond,
  };
}
