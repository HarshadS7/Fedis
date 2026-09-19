#!/usr/bin/env node
// Export ABIs for the middleware (Person B) and frontend (Person C).
// Run after any contract change:  node export-abi.mjs
//
// Writes abi/<Contract>.json per contract plus abi/index.json (one bundle to import),
// and prints every external signature so an ABI change is obvious in review.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "abi");

const CONTRACTS = [
  "AgentVault",
  "UserUnderwriting",
  "PremiumEngine",
  "VaultEscrow",
  "MockUSDC",
  "MockIdentityRegistry",
  // Bonded execution (project_plan.md). Without these the middleware cannot see them.
  "TaskPolicy",
  "BondVault",
];

// Signatures the middleware and frontend are built against. If one of these stops
// existing, the ABI is no longer frozen and B and C need to hear about it before
// they find out at integration time.
const FROZEN = {
  AgentVault: [
    "bond(bytes32,uint256)",
    "slash(bytes32,address,uint256)",
    "getVaultStats(bytes32)",
  ],
  UserUnderwriting: ["getTrustScore(address)", "flagMaliciousDispute(address)"],
  PremiumEngine: ["calculatePremium(bytes32,address,uint256)"],
};

execFileSync("forge", ["build"], { cwd: root, stdio: "ignore" });
mkdirSync(outDir, { recursive: true });

const bundle = {};
const signatures = {};

for (const name of CONTRACTS) {
  const raw = execFileSync("forge", ["inspect", name, "abi", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const abi = JSON.parse(raw);
  bundle[name] = abi;
  signatures[name] = abi
    .filter((e) => e.type === "function")
    .map((e) => `${e.name}(${e.inputs.map((i) => i.type).join(",")})`)
    .sort();

  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(abi, null, 2) + "\n");
  console.log(`abi/${name}.json  (${signatures[name].length} functions)`);
}

writeFileSync(join(outDir, "index.json"), JSON.stringify(bundle, null, 2) + "\n");
console.log("abi/index.json");

let broken = false;
for (const [contract, sigs] of Object.entries(FROZEN)) {
  for (const sig of sigs) {
    if (!signatures[contract].includes(sig)) {
      console.error(`  ABI BREAK: ${contract}.${sig} is gone -- tell B and C`);
      broken = true;
    }
  }
}

if (broken) process.exit(1);
console.log("\nfrozen integration signatures: all present");
