#!/usr/bin/env node
/** Quick pre-demo health check. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, http } from "viem";

const RPC = process.env.FIDES_RPC_URL ?? "http://127.0.0.1:8545";
const CHAIN_ID = Number(process.env.FIDES_CHAIN_ID ?? "31337");
const APP = process.env.FIDES_APP_URL ?? "http://localhost:3000";

const pub = createPublicClient({ transport: http(RPC) });

async function check(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`✗ ${name}: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

let ok = 0;
let total = 0;

async function run(name, fn) {
  total += 1;
  if (await check(name, fn)) ok += 1;
}

const deployments = JSON.parse(
  readFileSync(join("contracts", "deployments", `${CHAIN_ID}.json`), "utf8"),
);

await run("anvil reachable", async () => {
  const block = await pub.getBlockNumber();
  if (block === 0n) throw new Error("block 0");
});

await run("agentVault deployed", async () => {
  const code = await pub.getBytecode({ address: deployments.agentVault });
  if (!code || code === "0x") throw new Error("no bytecode");
});

await run("taskPolicy deployed", async () => {
  const code = await pub.getBytecode({ address: deployments.taskPolicy });
  if (!code || code === "0x") throw new Error("no bytecode");
});

await run("demo tasks manifest", async () => {
  readFileSync(join("contracts", "deployments", `demo-tasks-${CHAIN_ID}.json`), "utf8");
});

await run("GET /api/vaults", async () => {
  const res = await fetch(`${APP}/api/vaults`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!body.vaults?.length) throw new Error("empty vaults");
  if (body.mode !== "live") throw new Error(`mode=${body.mode}, expected live`);
});

await run("GET /api/tasks (slashed)", async () => {
  const manifest = JSON.parse(
    readFileSync(join("contracts", "deployments", `demo-tasks-${CHAIN_ID}.json`), "utf8"),
  );
  const id = manifest.tasks[0].id;
  const res = await fetch(`${APP}/api/tasks/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.mode !== "live") throw new Error(`mode=${body.mode}`);
  if (body.task?.state !== "slashed") throw new Error(`state=${body.task?.state}`);
});

console.log(`\n${ok}/${total} checks passed`);
process.exit(ok === total ? 0 : 1);
