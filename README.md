# Fides

A **bonded-execution liability layer for AI agents on Monad**. Buyers create protected tasks; agents lock a bond; a deterministic validator passes or fails the result; the bond is released or slashed and the buyer compensated. All of it is visible in the UI, on a real chain.

> Built in a hackathon. Parts are deliberately simulated and every simulated number is **labelled as such in the UI** — see [What is real vs simulated](#what-is-real-vs-simulated).

---

## Table of contents

1. [Stack](#stack)
2. [Prerequisites](#prerequisites)
3. [Quick start — app in mock mode (no chain needed)](#quick-start--app-in-mock-mode-no-chain-needed)
4. [Full demo — local chain with Anvil](#full-demo--local-chain-with-anvil)
5. [Deployed contracts](#deployed-contracts)
6. [Environment variables](#environment-variables)
7. [Deploying to Monad testnet](#deploying-to-monad-testnet)
8. [Deploying to Vercel](#deploying-to-vercel)
9. [API](#api)
10. [Project layout](#project-layout)
11. [What is real vs simulated](#what-is-real-vs-simulated)
12. [Troubleshooting](#troubleshooting)

---

## Stack

| Layer | What |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| Chain reads/writes | [viem](https://viem.sh) |
| Smart contracts | Solidity (Foundry) — `contracts/` |
| Target chain | Monad testnet (`10143`) for live/deployed, local Anvil (`31337`) for dev |

---

## Prerequisites

- **Node.js 20+** and npm
- **Foundry** (`forge`, `anvil`, `cast`) — **only** needed for the local-chain demo and for deploying contracts. Check: `forge --version`. If missing: `curl -L https://foundry.paradigm.xyz | bash && foundryup`

That's it for mock mode — no chain, no wallet, no keys.

---

## Quick start — app in mock mode (no chain needed)

The app runs **standalone with zero config** and serves realistic fixtures. Every API response carries `"mode": "mock"` and the UI shows that label, so nothing is misrepresented.

```bash
npm install
npm run dev
```

Open **http://localhost:3000/terminal** — the Agent Risk Terminal shows:

- vault table (4 seeded agents: TVL, utilization, APY, risk, slashes)
- premium contrast ($1.10 trusted buyer vs $12.95 flagged buyer on the same $100 task)
- protected-task lifecycle panel
- Monad parallelism benchmark (simulated stream)

Production build check: `npm run build && npm run start` (lint: `npm run lint`).

---

## Full demo — local chain with Anvil

A real local Ethereum node with your contracts deployed and seeded, so every read is `"mode": "live"` and task writes land on-chain.

```bash
# 1. Terminal A — local chain (blockchain node) on :8545
anvil

# 2. Terminal B — deploy + seed the demo data
cd contracts
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil account 0
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
forge script script/Seed.s.sol   --rpc-url http://127.0.0.1:8545 --broadcast
cd ..

# 3. Seed the three demo protected tasks (drives the lifecycle panel)
npm run seed:tasks

# 4. Terminal C — the app (auto-detects the chain within ~5s and switches to live)
npm run dev
```

Addresses land in `contracts/deployments/31337.json` and are loaded automatically — nothing is hardcoded.

### Benchmark (the "many wallets" parallelism demo)

```bash
# optional: a separate anvil on :8547, then fire the two workloads and measure them
anvil --port 8547
node contracts/script/fire.mjs --n 50 --rpc http://127.0.0.1:8547
```

Writes results to `contracts/bench-latest.json`, which the app uses as the "last measured run" fallback.

---

## Deployed contracts

Source of truth: `contracts/deployments/<chainId>.json` — the app reads addresses off disk at runtime, never hardcodes them. The table below is the committed **local (Anvil, chain 31337)** deployment. These addresses are deterministic: running `Deploy.s.sol` against a fresh Anvil reproduces them byte-for-byte.

| Contract | Address (Anvil / 31337) | Role |
|---|---|---|
| `AgentVault` | `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9` | per-agent vaults, LP shares, kinked curve, slashing |
| `BondVault` | `0x0165878A594ca255338adfa4d48449f69242Eb8F` | task bond lock / release / slash |
| `TaskPolicy` | `0x5FC8d32690cc91D4c39d9d3abcBD16989F875707` | protected-task state machine |
| `PremiumEngine` | `0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9` | bilateral premium quotes |
| `UserUnderwriting` | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` | buyer trust scores |
| `MockUSDC` | `0x5FbDB2315678afecb367f032d93F642f64180aa3` | 6-decimal settlement token (open faucet) |
| `IdentityRegistry` | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` | ERC-8004 read surface (mock — testnet has no registry bytecode) |
| Middleware signer | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | anvil account 0 = default `FIDES_MIDDLEWARE_KEY` |

**Monad testnet:** after a testnet deploy, the addresses land in `contracts/deployments/10143.json` — they will differ from the table. Commit that file and the app picks them up automatically; the table here stays the local reference (see [Deploying to Monad testnet](#deploying-to-monad-testnet)).

---

## Environment variables

**None are required.** Every variable has a default. The app auto-detects: live only if contract addresses exist **and** the node answers (re-probed every 5s → a local chain coming up mid-demo is picked up without a restart).

| Variable | Default | Effect |
|---|---|---|
| `FIDES_API_MODE` | `auto` | `mock` forces fixtures even when a chain is up |
| `FIDES_RPC_URL` | `http://127.0.0.1:8545` | chain node to read from |
| `FIDES_CHAIN_ID` | `31337` | picks `contracts/deployments/<chainId>.json` |
| `FIDES_MIDDLEWARE_KEY` | anvil account-0 key | private key that signs task-lifecycle writes (must be a wallet authorized on the deployed contracts) |
| `FIDES_BENCH_RPC` | `http://127.0.0.1:8547` | node for the benchmark script |
| `PRIVATE_KEY` (contracts only) | anvil account-0 key | used by Foundry scripts and `fire.mjs` |

`contracts/.env.example` documents the deploy-time vars (`PRIVATE_KEY`, `MIDDLEWARE`, `USDC`). Note it is gitignored — recreate it from that template on each machine.

---

## Deploying to Monad testnet

One-time setup. Prerequisite: a wallet funded with testnet MON ([faucet.monad.xyz](https://faucet.monad.xyz)).

```bash
cd contracts
cp .env.example .env        # fill in PRIVATE_KEY (funded deployer) and MIDDLEWARE (= the signer wallet that
                            # FIDES_MIDDLEWARE_KEY controls — it is what gets authorized on the contracts)
forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
forge script script/Seed.s.sol   --rpc-url monad_testnet --broadcast
cd ..
npm run seed:tasks           # needs FIDES_RPC_URL/FIDES_CHAIN_ID/FIDES_MIDDLEWARE_KEY set, or use --rpc/--chain flags
```

**Crucial:** commit the resulting `contracts/deployments/10143.json`. The deployed app reads that file off disk to find its contracts — without it, even `FIDES_API_MODE=live` serves mock data. (ABIs in `contracts/abi/` are already committed.)

---

## Deploying to Vercel

Prerequisites, in order:

1. [Contracts deployed to Monad testnet](#deploying-to-monad-testnet) **and** `contracts/deployments/10143.json` committed.
2. A `.env.vercel` file at the repo root with the Vercel variables (template already exists — next step).

Steps:

```bash
# 1. Import the repo on Vercel (it auto-detects Next.js). No build settings to change.

# 2. Add environment variables — paste the contents of .env.vercel into:
#    Vercel → Project Settings → Environment Variables (Production / Preview / Development)
```

`.env.vercel` is gitignored and is **not** auto-loaded by Next.js, so it cannot affect local dev. It contains:

```dotenv
FIDES_RPC_URL=https://testnet-rpc.monad.xyz
FIDES_CHAIN_ID=10143
FIDES_API_MODE=live
FIDES_MIDDLEWARE_KEY=<PRIVATE_TESTNET_MIDDLEWARE_PRIVATE_KEY>   # replace in Vercel's encrypted field
```

Security rules:

- `FIDES_MIDDLEWARE_KEY` is a **secret** — enter it via Vercel's encrypted field; never paste it in chat, GitHub, or commits.
- It must be the private key of the **same wallet** set as `MIDDLEWARE` during the contract deploy.
- Do **not** put `http://127.0.0.1:8545` in Vercel — serverless functions cannot reach your local Anvil. If the testnet RPC is flaky, set `FIDES_API_MODE=mock` instead of reverting to localhost.

```bash
# 3. Deploy / redeploy. The site works immediately and auto-serves mock fixtures
#    if the testnet RPC happens to be unreachable at request time.
```

---

## API

Base `http://localhost:3000`. Every response carries `"mode": "mock" | "live"`; mock and live shapes are identical. Integers are decimal strings; USDC is 6 decimals; percents are basis points.

| Endpoint | Purpose |
|---|---|
| `GET /api/vaults` | all agent vaults |
| `GET /api/agents/[id]` | one vault (`id` = bytes32) |
| `GET /api/premium?agentId=&user=&taskCost=` | bilateral premium quote |
| `POST /api/tasks` | create a protected task |
| `GET /api/tasks/[id]` | task lifecycle state (Created → Bonded → Executed → Released/Slashed) |
| `POST /api/tasks/[id]/bond` | agent locks its bond |
| `POST /api/tasks/[id]/submit` | submit result + settle (pass → release, fail → slash) |
| `POST /api/demo/fire` | parallelism benchmark (n = 1–500) |
| `GET /api/demo/fire/stream` | benchmark progress as server-sent events |

Full request/response shapes: [`API.md`](./API.md).

---

## Project layout

```
src/app/            Next.js pages + API routes (/terminal = the Agent Risk Terminal)
src/lib/            chain client, task lifecycle, mocks, benchmarking
contracts/          Solidity (src/), Foundry scripts (script/), tests, ABIs, deployments/
contracts/abi/      exported ABIs (committed, frozen)
contracts/deployments/  <chainId>.json addresses per chain (31337 = local, 10143 = testnet)
API.md              full API contract
TODO.md / GO.md     team status and last-minute runbook
```

---

## What is real vs simulated

**Real:** all on-chain contract logic and tests, live chain reads when a node is reachable, task lifecycle writes (create / bond / submit / settle) that log real tx hashes and gas, and the measured benchmark in `contracts/bench-latest.json`.

**Simulated (labelled in the UI):** the benchmark's illustrative stream when no bench node is running, and everything in mock mode when no chain is reachable. The validator is admin/middleware-triggered — no LLM judges anything, and we say so on stage.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Every panel says `mock` | No node reachable. Start `anvil` (or a testnet RPC) and wait ~5s — the app re-probes automatically. |
| `Task not found on-chain` | Run `npm run seed:tasks` after deploy. |
| `Bench node unreachable … 503` | Benchmark panel: start anvil on `:8547` + run `fire.mjs`, or commit `contracts/bench-latest.json` for the cached fallback. |
| Task writes fail "insufficient funds" / "unauthorized" | `FIDES_MIDDLEWARE_KEY` wallet has no testnet MON, or isn't the wallet authorized as `MIDDLEWARE` during deploy. |
| `forge` / `anvil` not found | Install Foundry: `curl -L https://foundry.paradigm.xyz | bash && foundryup` |

---

## Project docs

- `API.md` — exact request/response shapes
- `TODO.md` — status checklist (tick items when you finish them — it's the team's shared source of truth, see `AGENTS.md`)
- `GO.md` — the 60-minute hackathon runbook
- `contracts/README.md` — contracts deep-dive, test list, Monad-deploy details
