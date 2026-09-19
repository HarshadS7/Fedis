#!/usr/bin/env node
/**
 * Seeds the three demo protected tasks used by the lifecycle panel.
 *
 *   node contracts/script/seed-demo-tasks.mjs [--rpc http://127.0.0.1:8545]
 *
 * Requires Deploy.s.sol + Seed.s.sol to have run first.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RPC = arg("--rpc", process.env.FIDES_RPC_URL ?? "http://127.0.0.1:8545");
const CHAIN_ID = Number(arg("--chain", process.env.FIDES_CHAIN_ID ?? "31337"));
const PK =
  process.env.FIDES_MIDDLEWARE_KEY ??
  process.env.PRIVATE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const log = (...a) => console.log("[seed-tasks]", ...a);
const fail = (...a) => {
  console.error("[seed-tasks] FAIL", ...a);
  process.exit(1);
};

const DEMO_TASK_SLASHED = keccak256(toBytes("fides.demo.task.slashed"));
const DEMO_TASK_RELEASED = keccak256(toBytes("fides.demo.task.released"));
const DEMO_TASK_INFLIGHT = keccak256(toBytes("fides.demo.task.inflight"));

const FLAKY = keccak256(toBytes("flaky-scraper-v0"));
const BUYER = privateKeyToAccount(keccak256(toBytes("fides.demo.trusted"))).address;

const PAYMENT = 100_000_000n;
const BOND = 50_000_000n;
const MAX_COMP = 40_000_000n;

const taskPolicyAbi = parseAbi([
  "function getPolicy(bytes32 taskId) view returns ((bytes32 agentId, address buyer, uint256 paymentAmount, uint256 requiredBond, uint256 maxCompensation, uint256 deadline, uint8 validationMethod, bytes32 validationDataHash, bytes32 resultHash, uint8 state))",
  "function getState(bytes32 taskId) view returns (uint8)",
  "function createTask(bytes32 taskId, bytes32 agentId, address buyer, uint256 paymentAmount, uint256 requiredBond, uint256 maxCompensation, uint256 deadline, uint8 validationMethod, bytes32 validationDataHash)",
  "function markExecuted(bytes32 taskId, bytes32 resultHash)",
]);

const bondVaultAbi = parseAbi([
  "function lockBond(bytes32 taskId)",
  "function release(bytes32 taskId)",
  "function slash(bytes32 taskId) returns (uint256)",
]);

const usdcAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const deploymentsPath = join(root, "deployments", `${CHAIN_ID}.json`);
let deployments;
try {
  deployments = JSON.parse(readFileSync(deploymentsPath, "utf8"));
} catch {
  fail(`missing ${deploymentsPath} — run Deploy.s.sol first`);
}

const { taskPolicy, bondVault, usdc } = deployments;
if (!taskPolicy || !bondVault) {
  fail("taskPolicy/bondVault missing from deployments — redeploy with updated Deploy.s.sol");
}

const transport = http(RPC);
const pub = createPublicClient({ transport });
const account = privateKeyToAccount(PK);
const wallet = createWalletClient({ account, transport });

async function stateOf(taskId) {
  // getPolicy reverts with TaskDoesNotExist for unknown ids (by design); getState is the
  // non-reverting read that returns State.None (0) so seeding a fresh chain can tell
  // "not created yet" from "created". See TaskPolicy.sol Views.
  const s = await pub.readContract({
    address: taskPolicy,
    abi: taskPolicyAbi,
    functionName: "getState",
    args: [taskId],
  });
  return Number(s);
}

async function send(label, address, abi, functionName, args) {
  const hash = await wallet.writeContract({
    address,
    abi,
    functionName,
    args,
    chain: null,
    account,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") fail(`${label} reverted`, hash);
  log(`${label} -> ${hash} block=${receipt.blockNumber}`);
  return hash;
}

async function ensureUsdc(amount) {
  const bal = await pub.readContract({
    address: usdc,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [account.address],
  });
  if (bal < amount) {
    await send("MockUSDC.mint", usdc, usdcAbi, "mint", [account.address, amount - bal]);
  }
  await send("MockUSDC.approve", usdc, usdcAbi, "approve", [bondVault, amount]);
}

async function createIfNeeded(taskId, label) {
  const state = await stateOf(taskId);
  if (state !== 0) {
    log(`${label}: already exists (state=${state}) — skipping create`);
    return state;
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 86_400);
  await send(
    `${label}.createTask`,
    taskPolicy,
    taskPolicyAbi,
    "createTask",
    [
      taskId,
      FLAKY,
      BUYER,
      PAYMENT,
      BOND,
      MAX_COMP,
      deadline,
      0,
      keccak256(toBytes("fides.demo.validation")),
    ],
  );
  return 1;
}

async function bondIfNeeded(taskId, label, minState) {
  let state = await stateOf(taskId);
  if (state >= minState) return state;
  if (state !== 1) fail(`${label}: expected Created before bond, got state=${state}`);

  await ensureUsdc(BOND);
  await send(`${label}.lockBond`, bondVault, bondVaultAbi, "lockBond", [taskId]);
  return 2;
}

async function executeIfNeeded(taskId, label, minState) {
  let state = await stateOf(taskId);
  if (state >= minState) return state;
  if (state !== 2) fail(`${label}: expected Bonded before execute, got state=${state}`);

  await send(
    `${label}.markExecuted`,
    taskPolicy,
    taskPolicyAbi,
    "markExecuted",
    [taskId, keccak256(toBytes("fides.demo.result"))],
  );
  return 3;
}

async function settle(taskId, label, passed) {
  const state = await stateOf(taskId);
  if (state >= 4) {
    log(`${label}: already terminal (state=${state})`);
    return;
  }
  if (state !== 3) fail(`${label}: expected Executed before settle, got state=${state}`);

  if (passed) {
    await send(`${label}.release`, bondVault, bondVaultAbi, "release", [taskId]);
  } else {
    await send(`${label}.slash`, bondVault, bondVaultAbi, "slash", [taskId]);
  }
}

async function main() {
  log(`rpc=${RPC} chain=${CHAIN_ID} middleware=${account.address}`);

  const block = await pub.getBlockNumber();
  log(`node reachable, block=${block}`);

  // 1. Slashed path — the demo kill shot
  await createIfNeeded(DEMO_TASK_SLASHED, "slashed");
  await bondIfNeeded(DEMO_TASK_SLASHED, "slashed", 2);
  await executeIfNeeded(DEMO_TASK_SLASHED, "slashed", 3);
  await settle(DEMO_TASK_SLASHED, "slashed", false);

  // 2. Released path
  await createIfNeeded(DEMO_TASK_RELEASED, "released");
  await bondIfNeeded(DEMO_TASK_RELEASED, "released", 2);
  await executeIfNeeded(DEMO_TASK_RELEASED, "released", 3);
  await settle(DEMO_TASK_RELEASED, "released", true);

  // 3. In-flight — awaiting verify
  await createIfNeeded(DEMO_TASK_INFLIGHT, "inflight");
  await bondIfNeeded(DEMO_TASK_INFLIGHT, "inflight", 2);
  await executeIfNeeded(DEMO_TASK_INFLIGHT, "inflight", 3);

  const manifest = {
    chainId: CHAIN_ID,
    seededAt: new Date().toISOString(),
    tasks: [
      {
        id: DEMO_TASK_SLASHED,
        label: "Failed task (slashed)",
        expectedState: "Slashed",
      },
      {
        id: DEMO_TASK_RELEASED,
        label: "Successful task (released)",
        expectedState: "Released",
      },
      {
        id: DEMO_TASK_INFLIGHT,
        label: "In-flight (awaiting verify)",
        expectedState: "Executed",
      },
    ],
  };

  const out = join(root, "deployments", `demo-tasks-${CHAIN_ID}.json`);
  writeFileSync(out, JSON.stringify(manifest, null, 2));
  log(`wrote ${out}`);

  for (const t of manifest.tasks) {
    const state = await stateOf(t.id);
    log(`  ${t.label}: state=${state} id=${t.id.slice(0, 12)}…`);
  }

  log("done — lifecycle panel can now read live tasks via GET /api/tasks/:id");
}

main().catch((err) => fail(err));
