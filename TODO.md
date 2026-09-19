# TODO

Plan: [`project_plan.md`](./project_plan.md) (source of truth) · [`fedis-build-plan-v2.md`](./fedis-build-plan-v2.md) (build plan) · [`TEAM-PROMPTS.md`](./TEAM-PROMPTS.md) (per-person agent prompts)

**Definition of "working app":** a buyer creates a protected task → an agent locks a bond → the task executes → a deterministic validator passes or fails it → the bond is released or slashed and the buyer compensated → all of it visible in the UI, on a real chain, **both** paths. Everything below serves that sentence.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## 0. Environment & prerequisites (anyone, do first)

- [x] `forge --version` works; install Foundry if not
- [x] `anvil` starts on :8545
- [ ] `npm install` clean; `npm run dev` serves without errors
- [ ] Fix `monskills` plugin load (see Blockers) or confirm direct-path reads work
- [x] Confirm current Monad testnet RPC + chain id from a live source (don't trust `foundry.toml`)
- [ ] Get a funded testnet key; confirm faucet works and the 10 MON reserve floor is cleared
- [ ] Agree shared conventions once: USDC 6 decimals, `taskId`/`agentId` as `bytes32`, bond as bps of `maxCompensation`

---

## 1. Person A — Contracts (bonded execution)

### 1.1 Verify inherited state
- [x] `cd contracts && forge test` — confirm the claimed 60/60 actually pass
- [x] Confirm `contracts/abi/*.json` matches current source (`node export-abi.mjs`)
- [x] Confirm `Deploy.s.sol` + `Seed.s.sol` still run clean against anvil
- [x] Report any claim in `contracts/README.md` that doesn't hold

### 1.2 `TaskPolicy.sol`
- [x] `mapping(bytes32 taskId => Policy)`, isolated per task
- [x] Fields: taskId, agentId, paymentAmount, requiredBond, maxCompensation, deadline, validationMethod, validationDataHash, state
- [x] State machine: Created → Bonded → Executed → Settled (`Settled` implemented as two terminal states, `Released` / `Slashed`)
- [x] Reject invalid transitions; reject double settlement
- [x] Reject expired tasks past `deadline`
- [x] Event on every transition, `taskId` indexed
- [x] Custom errors with args (match `AgentVault.sol` style)
- [x] Tests: happy path, each invalid transition, double-settle, expiry — 26 tests
- [x] `forge test` green → tick, then move on (86/86)

### 1.3 `BondVault.sol`
- [ ] Lock agent collateral for task lifetime
- [ ] `release(taskId)` on verified success
- [ ] `slash(taskId)` on verified failure → pay buyer, capped at `maxCompensation`
- [ ] Per-task accounting isolated (no shared treasury counter)
- [ ] Only `ValidationRouter` / authorized caller can release or slash
- [ ] Reentrancy-safe on payout path
- [ ] Tests: release, slash, cap enforcement, unauthorized caller, double-release
- [ ] `forge test` green → tick

### 1.4 `ValidationRouter.sol`
- [ ] Mechanism 1: oracle value within tolerance
- [ ] Mechanism 2: signed validator attestation (ecrecover, authorized key set)
- [ ] Emits `ValidationPassed(taskId)` / `ValidationFailed(taskId)`
- [ ] Rejects replayed / stale attestations
- [ ] **No** LLM-as-judge, no subjective scoring (this is what judges attacked)
- [ ] Tests: pass, fail, bad signature, replay, unauthorized validator
- [ ] `forge test` green → tick

### 1.5 `AgentRegistryAdapter.sol`
- [ ] Wrap ERC-8004 identity via existing `IIdentityRegistry` / `MockIdentityRegistry`
- [ ] Verify on-chain whether `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` has bytecode on testnet (README claims no)
- [ ] Graceful fallback to mock registry when absent
- [ ] Tests: linked identity, unlinked, mismatched operator

### 1.6 `RiskScore.sol` — optional, only if 1.2–1.5 are done and tested
- [ ] Plain counters: successes, failures, disputes, bond history
- [ ] Every threshold a named constant with a comment justifying it
- [ ] Do **not** reproduce the unexplained 8000 / 2000 / 80% numbers from `UserUnderwriting.sol`

### 1.7 Freeze & deploy
- [ ] `node contracts/export-abi.mjs`, commit ABIs
- [ ] Post exact signatures to team → announce **"ABI FROZEN"**
- [ ] Extend `Deploy.s.sol` + `Seed.s.sol` for new contracts, `console2.log` every step
- [ ] Seed realistic demo fixtures: ≥1 agent with clean history, ≥1 with failures, ≥1 unbonded
- [ ] Deploy to anvil; verify full lifecycle with `cast` — pass path **and** slash path
- [ ] Write addresses to `contracts/deployments/<chainId>.json` (same shape as existing)
- [ ] Deploy to Monad testnet; re-verify both paths on-chain
- [ ] Review B's benchmark script for shared-state contention before it runs

---

## 2. Person B — Middleware & x402

### 2.1 Research (blocking — do before writing code)
- [ ] x402: current spec, wire format, libraries, Monad support → report feasibility, cite sources
- [ ] ERC-8004: registry interface, what's deployed where → verify A's notes
- [ ] Read `concepts/references/`: block-states, async-execution, reserve-balance, realtime-data
- [ ] Decide and announce: real x402 vs honest subset (and say which, out loud, to judges)

### 2.2 API skeleton with mocked data (unblocks C — do early)
- [ ] `POST /api/tasks` → `{ taskId, state }`
- [ ] `POST /api/tasks/:id/bond` → `{ state, bondedAmount }`
- [ ] `POST /api/tasks/:id/submit` → `{ state }`
- [ ] `GET /api/tasks/:id` → full policy + state
- [ ] `GET /api/agents/:id/risk` → success/fail counts, active exposure
- [ ] `POST /api/demo/benchmark` → streams measurements
- [ ] Publish exact response shapes to C → announce **"API SHAPES PUBLISHED"**

### 2.3 Logging harness (build before wiring contracts, not after)
- [ ] Entry log per handler: method, path, params
- [ ] Exit log per handler: status, duration ms
- [ ] Chain call log: fn name, args, tx hash, gas used, block number
- [ ] Revert log: decoded custom error + the args that caused it
- [ ] Greppable prefixes `[api]` `[chain]` `[bench]`; visually distinct `OK` / `WARN` / `FAIL`
- [ ] No swallowed errors — every catch logs full context and returns a machine-readable code

### 2.4 Wire real contracts (one endpoint at a time, prove each)
- [ ] Install viem (confirm Monad support first); read addresses from deployments JSON, ABIs from `contracts/abi/` — never hardcode
- [ ] `POST /api/tasks` against real `TaskPolicy` → show logs
- [ ] `POST /api/tasks/:id/bond` against real `BondVault` → show logs
- [ ] `POST /api/tasks/:id/submit` + `ValidationRouter` call → show logs
- [ ] Settlement: release on pass → verify agent paid
- [ ] Settlement: slash on fail → **verify buyer actually received funds**
- [ ] `GET` endpoints reading real chain state
- [ ] x402 payment leg per 2.1 decision; document precisely what's real vs simulated

### 2.5 Parallelism benchmark
- [ ] Generate + fund N wallets — clear the 10 MON floor, don't thin-fund
- [ ] Wait ~1.2s after funding before first send (async execution)
- [ ] Workload A: independent — N tasks, N distinct policies, no shared state
- [ ] Workload B: conflicting — N txs deliberately hitting the same state
- [ ] Measure per workload: submission, inclusion (block + time), `latest`/`safe`/`finalized` observations, success/revert counts, gas
- [ ] Report measured numbers only; label our measurements vs Monad's published specs separately
- [ ] Never emit "600ms" — Monad is 400ms blocks / 800ms finality
- [ ] Stream progress via SSE or WebSocket (pick one, tell C)
- [ ] `[bench]` log per wallet per stage so a live failure is diagnosable in seconds
- [ ] Full dry run; paste logs

---

## 3. Person C — Frontend

### 3.1 Design system — lock before building screens (see §3.2 for why these values)
- [x] Define tokens as CSS custom properties in `globals.css` — dark-first, both modes declared
- [x] Surfaces: page `#0d0d0d`, card/chart `#1a1a19` (light: `#f9f9f7` / `#fcfcfb`)
- [x] Ink: primary `#ffffff`, secondary `#c3c2b7`, muted `#898781` (light: `#0b0b0b` / `#52514e` / `#898781`)
- [x] Hairlines: border `rgba(255,255,255,0.10)`, gridline `#2c2c2a`, baseline `#383835`
- [x] Status (fixed, never themed): good `#0ca30c`, warning `#fab219`, serious `#ec835a`, critical `#d03b3b`
- [x] Series (dark steps): slot 1 blue `#3987e5`, slot 2 orange `#d95926`, slot 3 aqua `#199e70`
- [x] Typeface: system sans only (`system-ui, -apple-system, "Segoe UI", sans-serif`) — no display or serif face
- [x] `font-variant-numeric: tabular-nums` **only** on aligned columns (tx tables, axis ticks) — not on hero numbers
- [x] 4px spacing scale; at most 2 type sizes per screen region
- [x] Build a tiny primitives set first: `Card`, `StatTile`, `StatusBadge`, `DataTable`, `AddressChip` — every screen composes these

### 3.2 Anti-vibecode rules (bake into review, not taste)
- [x] No gradients, glassmorphism, or purple→blue "AI" wash
- [x] No decorative drop shadows; separation is hairlines + surface steps
- [x] No emoji as icons; status = icon **+ label**, never color alone
- [x] Never a dual-axis chart (two y-scales) — the single most common chart error
- [x] Sequential = one hue light→dark; diverging = two hues + neutral gray midpoint; never rainbow
- [x] Color follows the entity, never its rank — filtering must not repaint survivors
- [x] Text wears ink tokens, never the series color
- [ ] Thin marks: 2px lines, ≥8px markers, 4px rounded data-ends, 2px surface gap between adjacent fills, recessive grid
- [ ] ≥2 series → legend always present; ≤4 series → also direct-labeled
- [ ] Every chart has a table view (doubles as our receipts: real tx hashes)
- [x] No number on screen that isn't in B's API response (premium contrast card still seeded copy — wire `/api/premium`)

### 3.3 Data contract
- [x] `src/lib/types.ts` — B's actual response shapes, typed
- [x] `src/lib/api.ts` — one switch between mock and live; log `[api] MODE=mock GET /api/vaults → 200 in 4ms`
- [x] Mock fixtures covering: clean agent, failing agent, in-flight task, slashed task

### 3.4 Dashboard 1 — Agent Risk Terminal (GO.md: one screen)
- [x] Stat tiles (not charts — these are single values): total capital, agents covered, total slashed, tasks insured
- [x] Agent vault DataTable: name, TVL, utilization, APY, risk, slashes
- [x] Status badge on agents with slashes > 0 (icon + label)
- [x] Empty state and error state both designed, not blank
- [ ] Open in browser and actually look at it before ticking

### 3.5 Dashboard 2 — Protected Task Lifecycle
- [ ] Render the `project_plan.md` flow literally as a state machine (inline SVG or CSS — not a chart library)
- [ ] `INTENT → POLICY CREATED → AGENT BONDS → EXECUTE → VERIFY → PASS:RELEASE→PAY | FAIL:SLASH→COMPENSATE`
- [ ] Current state highlighted; both branches visible at all times
- [ ] Money movement explicit: who paid what to whom, with amounts
- [ ] Each completed step links to its tx on the explorer
- [ ] Drive it from a real task via `GET /api/tasks/:id`
- [ ] This screen explains the whole product — prioritise it over polish elsewhere

### 3.6 Dashboard 3 — Monad parallelism
- [ ] Two series only (independent vs conflicting) — slots 1 and 2, well inside the 3-series all-pairs cap
- [ ] Per-tx dot/strip plot over time, one row per workload
- [ ] Stat tiles: tx count, p50 / p95 inclusion, settled count, reverts
- [ ] `latest` / `safe` / `finalized` reported separately — never collapsed into one "confirmed"
- [ ] On-screen labels distinguishing **our measurements** from **Monad's published specs**
- [ ] Live-updating from B's stream; visible connection state
- [ ] Table view with real tx hashes

### 3.7 Logging & demo-safety
- [x] `[api]` log per call: endpoint, mode, status, duration
- [ ] `[bench]` log per stream event
- [x] Fetch failure → full error logged **and** a visible UI error state (a blank panel is indistinguishable from a hung demo)
- [x] Dev status strip: API mode, chain, last successful fetch time

---

## 4. Integration milestones

- [ ] **Sync 1 — interfaces locked.** A: ABI frozen. B: API shapes published. C: both typed into `src/lib/types.ts`. Nobody proceeds on guessed interfaces.
- [ ] **Sync 2 — real chain behind the API.** A deployed + addresses JSON published; B's endpoints hit real contracts; C still on mocks but shapes verified identical.
- [ ] **Sync 3 — full lifecycle green.** Pass path *and* slash path, on a real chain, visible in C's lifecycle dashboard.
- [ ] **Sync 4 — benchmark + rehearsal.** Defensible measured numbers; demo click-path rehearsed and timed.

---

## 5. Demo prep

- [ ] Pre-seeded demo state so nothing is created live that could fail
- [ ] Rehearse the slash path specifically — it's the one judges care about and the one most likely untested
- [ ] Written list of what is real vs simulated (x402 subset, mock registry) — say it before they ask
- [ ] Pitch copy purged of: "600ms", "insurance", "CIBIL", LP vaults, and any uncalibrated magic number
- [ ] Fallback: recorded run of the benchmark in case testnet misbehaves live
- [ ] 60-second script from `project_plan.md` §6, assigned across three speakers, handoffs rehearsed

---

## 6. Blockers / environment

- [ ] `monskills` plugin doesn't load — installed under old dir name `Fides`, dir is now `fides`, so its registered `projectPath` is dead. Fix via `/plugin` reinstall, or read skills directly from `~/.claude/plugins/cache/monskills/monskills/0.7.2/skills/`
- [ ] Old plan's "600ms block" claim is wrong — Monad is 400ms blocks / 800ms finality. Purge from code comments, UI copy, and pitch
- [ ] 10 MON reserve floor per EOA + ~1 tx/1.2s for low-balance accounts — thin-funded burner wallets will flatten the benchmark
- [x] ERC-8004 registry has no bytecode on Monad testnet — **re-verified 2026-09-19**: `cast code 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` returns `0x` on chain 10143. Mock registry fallback stays necessary

---

## Done log

- 2026-09-19: Person A shipped the old insurance-pool contracts (`AgentVault`, `PremiumEngine`, `UserUnderwriting`, `VaultEscrow`) — README claims 60/60 tests, ABIs frozen, deployed+seeded locally. Superseded by the bonded-execution pivot; frozen as a Phase 4 stretch goal, not deleted.
- 2026-09-19: Plan pivoted from `project.md` (insurance pool) to `project_plan.md` (bonded execution) after judging feedback. Wrote `fedis-build-plan-v2.md`, created this file.
- 2026-09-19: Wrote `TEAM-PROMPTS.md` — per-person agent prompts with verify-first, research-don't-guess, logging, and checkpoint rules. Found the monskills load bug and the 600ms/400ms error while writing it.
- 2026-09-19: Expanded this file to a granular working-app checklist; added a locked design-token set and anti-vibecode rules for the frontend, grounded in the dataviz skill's validated palette and form rules rather than taste.
- 2026-09-19: Verified the inherited contracts track before building on it (TODO 1.1). All claims in `contracts/README.md` hold: 60/60 tests pass, `node export-abi.mjs` reproduces the committed ABIs with zero drift, and `Deploy.s.sol` + `Seed.s.sol` run clean against a fresh anvil producing byte-identical addresses to `deployments/31337.json`. Confirmed Monad testnet is chain 10143 and the canonical ERC-8004 registry still has no bytecode there. Nothing inherited is broken; the bonded-execution build starts from a green base.
- 2026-09-19: Person C refactored frontend per GO.md — single Agent Risk Terminal, locked design tokens, VaultInfo types, mock/live `/api/vaults` client with fallback fixtures, StatTiles + DataTable + StatusBadge primitives. Removed `/lp`, `/demo`, old vibecode styling.
