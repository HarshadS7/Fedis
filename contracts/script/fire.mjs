#!/usr/bin/env node
// Aegis parallelism benchmark.
//
//   node contracts/script/fire.mjs [--n 50] [--rpc http://127.0.0.1:8545] [--out run.json]
//
// Fires two workloads that differ in ONE variable -- whether the transactions touch the
// same contract storage -- and measures what actually happened on chain.
//
//   A) INDEPENDENT: N wallets bond against N DIFFERENT agent vaults. Disjoint storage.
//   B) CONFLICTING: N wallets bond against ONE shared agent vault. Same slots, every tx.
//
// Both workloads fire from the same number of distinct wallets, so nonce serialization is
// held constant and the only thing that varies is contract-level contention. That control
// is the whole point: firing everything from one EOA would serialize on that account's
// nonce regardless of how well vault storage is partitioned, and the run would prove
// nothing. See contracts/README.md and test_aSharedRelayerWalletReintroducesContention.
//
// Promise.all() is client-side concurrency and is NOT itself evidence of anything. What is
// reported below is measured: inclusion block, wall time, reverts, txs per block.
// Monad's published figures (400ms blocks / 800ms finality) are a separate thing and are
// never mixed into these numbers.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  keccak256,
  toHex,
  formatUnits,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const root = dirname(dirname(fileURLToPath(import.meta.url))); // contracts/

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const N = Number(arg("--n", "50"));
const RPC = arg("--rpc", "http://127.0.0.1:8547");
const OUT = arg("--out", join(root, "bench-latest.json"));

// anvil account 0 -- funds the burner wallets and owns the protocol locally.
const FUNDER_PK = process.env.PRIVATE_KEY
  || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const log = (...a) => console.log("[fire]", ...a);
const fail = (...a) => console.log("[fire] FAIL", ...a);

// ---------------------------------------------------------------------------
// ABIs -- only the fragments this script calls.
// ---------------------------------------------------------------------------

const vaultAbi = parseAbi([
  "function registerAgent(bytes32 agentId, address operator, uint256 registryAgentId) returns (address)",
  "function setAuthorizedBatch(address[] accounts, bool allowed)",
  "function bond(bytes32 agentId, uint256 premium)",
  "function deposit(bytes32 agentId, uint256 assets) returns (uint256)",
  "function getVaultStats(bytes32 agentId) view returns (uint256 tvl, uint256 apy, uint256 jobVolume)",
  "function agentCount() view returns (uint256)",
]);

const usdcAbi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const chainId = Number(arg("--chain", "31337"));
const deploymentsPath = join(root, "deployments", `${chainId}.json`);

let deployments;
try {
  deployments = JSON.parse(readFileSync(deploymentsPath, "utf8"));
} catch (e) {
  fail(`could not read ${deploymentsPath} -- deploy first:`);
  fail("  forge script script/Deploy.s.sol --rpc-url <rpc> --broadcast");
  process.exit(1);
}

const AGENT_VAULT = deployments.agentVault;
const USDC = deployments.usdc;

const transport = http(RPC);
const pub = createPublicClient({ transport });
const funder = privateKeyToAccount(FUNDER_PK);
const funderWallet = createWalletClient({ account: funder, transport });

const USDC_UNIT = 1_000_000n; // 6 decimals
const PREMIUM = 1n * USDC_UNIT; // 1 USDC per bond
const SEED_USDC = 1_000n * USDC_UNIT;
const SEED_GAS = 10n ** 18n; // 1 native token per burner

/** Wait for a receipt, tolerating a revert (we want to COUNT reverts, not crash on them). */
async function settle(hash, submittedAt) {
  try {
    const r = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
    return {
      ok: r.status === "success",
      block: Number(r.blockNumber),
      gasUsed: Number(r.gasUsed),
      includedAt: Date.now(),
      submittedAt,
      hash,
    };
  } catch (e) {
    return { ok: false, block: null, gasUsed: 0, includedAt: Date.now(), submittedAt, hash, error: String(e).slice(0, 200) };
  }
}

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

async function preflight() {
  // This script registers N agent vaults to bond against, and those vaults show up in
  // getAllVaultInfo() -- the exact call powering the UI's agent table. Pointed at the demo
  // chain it would fill that table with bench-* rows mid-demo. Ids are deterministic so
  // repeat runs reuse vaults rather than growing without bound, but keep it off the chain
  // the UI reads unless you explicitly mean to.
  if (/:8545(\/|$)/.test(RPC) && !process.argv.includes("--allow-demo-chain")) {
    fail(`refusing to run against ${RPC}`);
    fail("that is the demo chain the UI reads; this would add bench-* agents to it.");
    fail("use a separate node:  anvil --port 8547 --block-time 1   (then Deploy + Seed)");
    fail("or pass --allow-demo-chain if you really mean it.");
    process.exit(1);
  }

  log(`rpc          : ${RPC}`);
  log(`chain id     : ${chainId}`);
  log(`AgentVault   : ${AGENT_VAULT}`);
  log(`MockUSDC     : ${USDC}`);
  log(`funder       : ${funder.address}`);
  log(`wallets (N)  : ${N}`);

  const [block, agents] = await Promise.all([
    pub.getBlockNumber(),
    pub.readContract({ address: AGENT_VAULT, abi: vaultAbi, functionName: "agentCount" }),
  ]);
  log(`head block   : ${block}`);
  log(`agents known : ${agents}`);
  if (Number(agents) === 0) {
    fail("no agents registered -- run script/Seed.s.sol first");
    process.exit(1);
  }
}

/**
 * Create N burner wallets and make each one able to bond on its own behalf:
 * native gas, USDC, an approval, and authorization on the vault.
 *
 * Every one of these is a DIFFERENT wallet on purpose. One shared wallet would serialize
 * on its own nonce and flatten both workloads identically, hiding the very effect we are
 * trying to measure.
 */
async function provision() {
  log("");
  log(`provisioning ${N} wallets...`);
  const t0 = Date.now();

  const wallets = Array.from({ length: N }, () => {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    return { account, client: createWalletClient({ account, transport }) };
  });

  // Fund gas + USDC sequentially from the funder (one account, so it serializes anyway --
  // this is setup, not the measured workload).
  let nonce = await pub.getTransactionCount({ address: funder.address });
  const setupHashes = [];
  for (const w of wallets) {
    setupHashes.push(
      await funderWallet.sendTransaction({ to: w.account.address, value: SEED_GAS, nonce: nonce++, chain: null }),
    );
    setupHashes.push(
      await funderWallet.writeContract({
        address: USDC, abi: usdcAbi, functionName: "mint",
        args: [w.account.address, SEED_USDC], nonce: nonce++, chain: null,
      }),
    );
  }
  await pub.waitForTransactionReceipt({ hash: setupHashes[setupHashes.length - 1] });
  log(`  funded ${N} wallets with gas + USDC`);

  // Authorize all N in ONE transaction -- setAuthorizedBatch exists precisely for this.
  const authHash = await funderWallet.writeContract({
    address: AGENT_VAULT, abi: vaultAbi, functionName: "setAuthorizedBatch",
    args: [wallets.map((w) => w.account.address), true], nonce: nonce++, chain: null,
  });
  await pub.waitForTransactionReceipt({ hash: authHash });
  log(`  authorized ${N} wallets on AgentVault (1 tx)`);

  // Each burner approves the vault to pull its premium.
  const approvals = await Promise.all(
    wallets.map((w) =>
      w.client.writeContract({
        address: USDC, abi: usdcAbi, functionName: "approve",
        args: [AGENT_VAULT, SEED_USDC], chain: null,
      }).catch((e) => { fail("approve failed:", String(e).slice(0, 120)); return null; }),
    ),
  );
  await pub.waitForTransactionReceipt({ hash: approvals.filter(Boolean).pop() });
  log(`  approved AgentVault from ${approvals.filter(Boolean).length} wallets`);
  log(`provisioned in ${Date.now() - t0}ms`);
  return wallets;
}

/**
 * Register the agent vaults the workloads bond against, and seed each with LP capital so
 * the vault is a realistic target rather than an empty one.
 */
async function registerAgents(tag, count) {
  const ids = Array.from({ length: count }, (_, i) => keccak256(toHex(`${tag}-${i}`)));
  let nonce = await pub.getTransactionCount({ address: funder.address });
  let last;
  for (const id of ids) {
    try {
      last = await funderWallet.writeContract({
        address: AGENT_VAULT, abi: vaultAbi, functionName: "registerAgent",
        args: [id, funder.address, 0n], nonce: nonce++, chain: null,
      });
    } catch (e) {
      // Already registered from a previous run -- fine, reuse it.
      nonce = await pub.getTransactionCount({ address: funder.address });
    }
  }
  if (last) await pub.waitForTransactionReceipt({ hash: last });
  log(`  ${count} agent vault(s) ready for "${tag}"`);
  return ids;
}

// ---------------------------------------------------------------------------
// The measured workloads
// ---------------------------------------------------------------------------

/**
 * Fire one bond() per wallet and measure each transaction independently.
 * `agentFor(i)` decides which vault wallet i hits -- that single function is the ONLY
 * difference between the independent and conflicting runs.
 */
async function runWorkload(name, wallets, agentFor) {
  log("");
  log(`=== ${name} ===`);
  const t0 = Date.now();

  const sent = await Promise.all(
    wallets.map(async (w, i) => {
      const submittedAt = Date.now();
      try {
        const hash = await w.client.writeContract({
          address: AGENT_VAULT, abi: vaultAbi, functionName: "bond",
          args: [agentFor(i), PREMIUM], chain: null,
        });
        return { hash, submittedAt, i };
      } catch (e) {
        fail(`wallet ${i} submit rejected: ${String(e.shortMessage ?? e).slice(0, 140)}`);
        return { hash: null, submittedAt, i, error: String(e.shortMessage ?? e).slice(0, 200) };
      }
    }),
  );

  const submittedMs = Date.now() - t0;
  const accepted = sent.filter((s) => s.hash);
  log(`submitted ${accepted.length}/${wallets.length} in ${submittedMs}ms`);

  const results = await Promise.all(accepted.map((s) => settle(s.hash, s.submittedAt)));
  const wallMs = Date.now() - t0;

  const ok = results.filter((r) => r.ok);
  const reverted = results.filter((r) => !r.ok);
  const rejected = sent.filter((s) => !s.hash);
  const blocks = [...new Set(ok.map((r) => r.block))].sort((a, b) => a - b);
  const latencies = ok.map((r) => r.includedAt - r.submittedAt).sort((a, b) => a - b);
  const pct = (p) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] : 0);
  const gas = ok.reduce((s, r) => s + r.gasUsed, 0);

  for (const r of reverted) fail(`tx ${r.hash?.slice(0, 12)}... reverted: ${r.error ?? "execution reverted"}`);

  const summary = {
    workload: name,
    txCount: wallets.length,
    submitted: accepted.length,
    settled: ok.length,
    reverted: reverted.length + rejected.length,
    wallMs,
    submittedMs,
    blocksUsed: blocks.length,
    blockRange: blocks.length ? `${blocks[0]}..${blocks[blocks.length - 1]}` : "-",
    txPerBlock: blocks.length ? +(ok.length / blocks.length).toFixed(2) : 0,
    p50InclusionMs: pct(0.5),
    p95InclusionMs: pct(0.95),
    totalGas: gas,
    blocks,
  };

  log(`settled ${ok.length}/${wallets.length}, reverts ${summary.reverted}, wall ${wallMs}ms`);
  log(`blocks used ${summary.blocksUsed} (${summary.blockRange}), ${summary.txPerBlock} tx/block`);
  log(`inclusion p50 ${summary.p50InclusionMs}ms  p95 ${summary.p95InclusionMs}ms`);
  return summary;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await preflight();
  const wallets = await provision();

  log("");
  log("registering target vaults...");
  // Deterministic ids: repeat runs REUSE these vaults instead of registering new ones
  // every time, so the agent list the UI reads stays bounded.
  const independentAgents = await registerAgents("bench-independent", N);
  const [sharedAgent] = await registerAgents("bench-shared", 1);

  const independent = await runWorkload(
    "A) INDEPENDENT — N wallets, N different vaults (disjoint storage)",
    wallets,
    (i) => independentAgents[i],
  );

  const conflicting = await runWorkload(
    "B) CONFLICTING — N wallets, ONE shared vault (same slots every tx)",
    wallets,
    () => sharedAgent,
  );

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------
  const row = (label, a, b) => `${label.padEnd(26)} ${String(a).padStart(16)} ${String(b).padStart(16)}`;
  console.log("");
  console.log("  MEASURED — this run, on this node".padEnd(26), "     INDEPENDENT", "     CONFLICTING");
  console.log("  " + "-".repeat(60));
  console.log("  " + row("transactions", independent.txCount, conflicting.txCount));
  console.log("  " + row("settled", independent.settled, conflicting.settled));
  console.log("  " + row("reverts", independent.reverted, conflicting.reverted));
  console.log("  " + row("wall time (ms)", independent.wallMs, conflicting.wallMs));
  console.log("  " + row("blocks used", independent.blocksUsed, conflicting.blocksUsed));
  console.log("  " + row("tx per block", independent.txPerBlock, conflicting.txPerBlock));
  console.log("  " + row("inclusion p50 (ms)", independent.p50InclusionMs, conflicting.p50InclusionMs));
  console.log("  " + row("inclusion p95 (ms)", independent.p95InclusionMs, conflicting.p95InclusionMs));
  console.log("  " + row("total gas", independent.totalGas, conflicting.totalGas));
  console.log("");
  console.log("  Both workloads fired from the same N distinct wallets, so nonce");
  console.log("  serialization is held constant. The only variable is whether the");
  console.log("  transactions touch the same contract storage.");
  console.log("");

  const isLocal = /127\.0\.0\.1|localhost/.test(RPC);
  if (isLocal) {
    console.log("  READ THIS BEFORE QUOTING THE TWO COLUMNS AGAINST EACH OTHER:");
    console.log("  this is a local anvil node, which executes transactions SEQUENTIALLY.");
    console.log("  It has no parallel execution, so INDEPENDENT and CONFLICTING are");
    console.log("  EXPECTED to measure the same here. A gap between them is a Monad");
    console.log("  property and cannot be demonstrated on this node -- do not claim it.");
    console.log("");
    console.log("  What this run DOES establish: " + independent.settled + " concurrent liability events");
    console.log("  settled in " + independent.blocksUsed + " block with " + independent.reverted + " reverts. That the workload is");
    console.log("  contention-free BY CONSTRUCTION is proven separately and");
    console.log("  deterministically by the storage-access tests:");
    console.log("    forge test --match-test test_policyWritesAreDisjointAcrossAgents -vv");
    console.log("    forge test --match-test test_agentsDoNotShareCustody -vv");
    console.log("    forge test --match-test test_gasPerPolicyIsFlatAsTheProtocolGrows -vv");
    console.log("");
  }

  console.log("  Monad's PUBLISHED figures are 400ms blocks / 800ms finality. Those are");
  console.log("  the network's specs, not our measurements, and are not mixed into the");
  console.log("  table above. This run was against " + RPC + ".");
  console.log("");

  const payload = {
    measuredAt: new Date().toISOString(),
    rpc: RPC,
    chainId,
    walletCount: N,
    agentVault: AGENT_VAULT,
    note: "Measured on this node. Monad published specs (400ms blocks / 800ms finality) are separate and not included here.",
    independent,
    conflicting,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n");
  log(`wrote ${OUT}`);
}

main().catch((e) => {
  fail(e?.stack ?? String(e));
  process.exit(1);
});
