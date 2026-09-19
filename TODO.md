# TODO

> ⚠️ **Under an hour left → work from [`GO.md`](./GO.md), not this file.** The list below
> is the full multi-hour build. `GO.md` is the triaged 60-minute version: ship the existing
> contracts, reframe the pitch, skip the bonded-execution rewrite.

Plan: [`project_plan.md`](./project_plan.md) (source of truth) · [`fedis-build-plan-v2.md`](./fedis-build-plan-v2.md) (build plan) · [`TEAM-PROMPTS.md`](./TEAM-PROMPTS.md) (per-person agent prompts)

**Definition of "working app":** a buyer creates a protected task → an agent locks a bond → the task executes → a deterministic validator passes or fails it → the bond is released or slashed and the buyer compensated → all of it visible in the UI, on a real chain, **both** paths. Everything below serves that sentence.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

## ✅ Verified state (all re-checked 2026-09-19 on THIS machine, end to end)

| Area | Status |
| --- | --- |
| Contract tests | ✅ **111/111 passing, 0 failed** — Foundry 1.8.3 now installed, A's claims confirmed |
| Frontend | `build` ✅ · `tsc` ✅ clean · `lint` ✅ 0 errors (was 24 errors / 313 warnings) |
| Chain | ✅ anvil on `:8545`, full stack deployed **and seeded**. Bench chain on `:8547` |
| ABIs | ✅ all 8 exported incl. `TaskPolicy` (15 fns) + `BondVault` (14 fns) |
| Read API | ✅ `/api/vaults` `/api/agents/[id]` `/api/premium` — all returning **`mode: "live"`** off the chain |
| Task lifecycle API | ✅ `/api/tasks` + `/bond` + `/submit` + `GET` — **both paths verified on-chain** |
| Pass path | ✅ `Created → Bonded → Executed → Released` |
| **Slash path** | ✅ buyer received **exactly $40** of a $50 bond (`maxCompensation` cap enforced, $10 refunded) |
| Premium contrast | ✅ live: trusted **$1.10** vs fraudster **$12.95** on the same $100 task |
| Benchmark | ✅ 20 txs, 1 block, 0 reverts; `/api/demo/fire` serves the measured JSON |

**Honest boundaries to say out loud:** `ValidationRouter` is not built, so validation is an
authorized call rather than an on-chain predicate. A local anvil executes sequentially, so
independent-vs-conflicting **cannot** demonstrate parallelism here — contention-freedom is
proven instead by the storage-access tests in `Integration.t.sol`.

---

## 0. Environment & prerequisites (anyone, do first)

- [x] Foundry installed (1.8.3) — `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- [x] `anvil` on :8545 (demo chain, deployed + seeded) and :8547 (bench chain)
- [x] `npm install` clean; `npm run dev` serves without errors
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

### 1.3 `BondVault.sol` — ✅ written + **111/111 suite passing, deployed, lifecycle verified on-chain**
- [x] Lock agent collateral for task lifetime
- [x] `release(taskId)` on verified success
- [x] `slash(taskId)` on verified failure → pay buyer, capped at `maxCompensation`
- [x] Per-task accounting isolated (no shared treasury counter)
- [x] Only `ValidationRouter` / authorized caller can release or slash
- [x] Reentrancy-safe on payout path
- [x] Tests written: release, slash, cap enforcement, unauthorized caller, double-release
- [x] `forge test` green — **111/111 passing, verified on this machine**

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
- [x] ✅ `node contracts/export-abi.mjs` — added `TaskPolicy`/`BondVault` to its CONTRACTS list; all 8 ABIs exported, frozen signatures intact
- [x] ✅ `Deploy.s.sol` extended to deploy `TaskPolicy` + `BondVault`, wire authorizations, and write both addresses to the deployments JSON
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

### 2.2 API — built against the LEGACY contracts (per GO.md triage), all curl-verified
- [x] `GET /api/vaults` → `{ mode, vaults[] }` — one `getAllVaultInfo()` call, `agentName` attached server-side
- [x] `GET /api/agents/[id]` → `{ mode, vault }` — 400 on non-bytes32, 404 on unknown
- [x] `GET /api/premium?agentId=&user=&taskCost=` → premium + multiplier + risk + trust score
- [x] `POST /api/demo/fire` → mock returns `simulated: true`; live returns 503 rather than fake numbers
- [x] Publish exact response shapes to C → **"API SHAPES PUBLISHED"** ([`API.md`](./API.md))
- [x] Auto mode switch: live only if addresses exist AND node answers; re-probed every 5s
- [x] ✅ Bonded-execution endpoints: `POST /api/tasks`, `POST /api/tasks/[id]/bond`, `POST /api/tasks/[id]/submit`, `GET /api/tasks/[id]`
- [x] ✅ Write client (`wallet()` in `chain.ts`) — middleware key drives the lifecycle; every write logs tx hash, gas, block
- [x] ✅ State guards: 409 with the actual state when bonding a non-`Created` or submitting a non-`Bonded` task

### 2.3 Logging harness — done (`src/lib/log.ts`)
- [x] Entry log per handler: method, path, params
- [x] Exit log per handler: status, duration ms
- [x] Chain call log: fn name + result (tx hash / gas pending a write path)
- [x] Greppable prefixes `[api]` `[chain]` `[bench]`; visually distinct `OK` / `WARN` / `FAIL`
- [x] No swallowed errors — live-read failure returns fixtures with `degraded: true`, never an empty array

### 2.4 Wire real contracts (one endpoint at a time, prove each)
- [x] Install viem; read addresses from deployments JSON, ABIs from `contracts/abi/` — never hardcoded
- [x] ✅ **Live read path executed and verified** — all read endpoints return `mode: "live"` off the seeded chain
- [x] ✅ Settlement release verified (agent's bond returned) and slash verified (**buyer paid $40, cap enforced**)
- [ ] x402 payment leg — still not integrated; say so out loud in the pitch
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
- [x] Thin marks: 2px lines, ≥8px markers, 4px rounded data-ends, 2px surface gap between adjacent fills, recessive grid
- [x] ≥2 series → legend always present; ≤4 series → also direct-labeled (parallelism panel)
- [x] Every chart has a table view (parallelism table present; real tx hashes await live benchmark)
- [x] No number on screen that isn't in B's API response — premium contrast wired to `GET /api/premium`

### 3.3 Data contract
- [x] `src/lib/types.ts` — B's actual response shapes, typed
- [x] `src/lib/api.ts` — one switch between mock and live; log `[api] MODE=mock GET /api/vaults → 200 in 4ms`
- [x] Mock fixtures covering: clean agent, failing agent, in-flight task, slashed task

### 3.4 Dashboard 1 — Agent Risk Terminal (GO.md: one screen)
[~] Reframe the frontend as a public Fedis editorial landing page with the risk terminal as the flagship proof surface.
- [x] Stat tiles (not charts — these are single values): total capital, agents covered, total slashed, tasks insured
- [x] Agent vault DataTable: name, TVL, utilization, APY, risk, slashes
- [x] Status badge on agents with slashes > 0 (icon + label)
- [x] Empty state and error state both designed, not blank
- [x] Opened in browser and eyeballed
- [x] Serves over HTTP; `/api/vaults` returns all 4 agents with names

### 3.5 Dashboard 2 — Protected Task Lifecycle
- [x] Render the `project_plan.md` flow literally as a state machine (inline SVG or CSS — not a chart library)
- [x] `INTENT → POLICY CREATED → AGENT BONDS → EXECUTE → VERIFY → PASS:RELEASE→PAY | FAIL:SLASH→COMPENSATE`
- [x] Current state highlighted; both branches visible at all times
- [x] Money movement explicit: who paid what to whom, with amounts
- [x] Each completed step links to its tx on the explorer
- [x] Drive it from a real task via `GET /api/tasks/:id` (mock route + fixtures until B wires TaskPolicy)
- [x] This screen explains the whole product — prioritise it over polish elsewhere

### 3.6 Dashboard 3 — Monad parallelism (GO.md: panel only if time; full chart deferred)
- [x] Two series only (independent vs conflicting) — slots 1 and 2, well inside the 3-series all-pairs cap
- [x] Per-tx dot/strip plot over time, one row per workload (illustrative until live `fire.mjs` tx points)
- [x] Stat tiles: tx count, p50 / p95 inclusion, settled count, reverts (table + tiles; tx hashes await live run)
- [x] `latest` / `safe` / `finalized` reported separately — never collapsed into one "confirmed"
- [x] On-screen labels distinguishing **our measurements** from **Monad's published specs**
- [x] Live-updating from B's stream; visible connection state
- [x] Table view with real tx hashes (mock `0xsim…` in dev; live hashes when bench node on :8547)

### 3.7 Logging & demo-safety
- [x] `[api]` log per call: endpoint, mode, status, duration
- [x] `[bench]` log per stream event (client `fetchDemoFire` + server route)
- [x] Fetch failure → full error logged **and** a visible UI error state (a blank panel is indistinguishable from a hung demo)
- [x] Dev status strip: API mode, chain, last successful fetch time

---

## 4. Integration milestones

- [x] ✅ **Sync 1 — interfaces locked.** All 8 ABIs exported, shapes published (`API.md`), typed in `src/lib/types.ts`.
- [x] ✅ **Sync 2 — real chain behind the API.** Deployed + seeded on :8545; every read endpoint returns `mode: "live"`.
- [~] **Sync 3 — full lifecycle green.** Pass **and** slash paths verified on-chain via the API. Remaining: surface it in C's lifecycle dashboard (§3.5, not built).
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

- 2026-09-19 — Reframed the frontend as a premium Fedis landing page with a code-native risk terminal showcase, responsive editorial sections, and generated hero texture.
- 2026-09-19: Renamed all "Aegis" references to "Fedis" across src, contracts, and docs; renamed `public/images/aegis-hero-texture.png` → `fedis-hero-texture.png`.


- 2026-09-19: Person A shipped the old insurance-pool contracts (`AgentVault`, `PremiumEngine`, `UserUnderwriting`, `VaultEscrow`) — README claims 60/60 tests, ABIs frozen, deployed+seeded locally. Superseded by the bonded-execution pivot; frozen as a Phase 4 stretch goal, not deleted.
- 2026-09-19: Plan pivoted from `project.md` (insurance pool) to `project_plan.md` (bonded execution) after judging feedback. Wrote `fedis-build-plan-v2.md`, created this file.
- 2026-09-19: Wrote `TEAM-PROMPTS.md` — per-person agent prompts with verify-first, research-don't-guess, logging, and checkpoint rules. Found the monskills load bug and the 600ms/400ms error while writing it.
- 2026-09-19: Expanded this file to a granular working-app checklist; added a locked design-token set and anti-vibecode rules for the frontend, grounded in the dataviz skill's validated palette and form rules rather than taste.
- 2026-09-19: Person B shipped 4 API endpoints over the legacy contracts (mock-first, auto live-switch, `API.md` published). Resolved a git both-added conflict in `vaults/route.ts`.
- 2026-09-19: Test-and-fix pass. Lint went 24 errors/313 warnings → **0**: ignored vendored `contracts/lib/**` (21 of the errors were OpenZeppelin's), renamed `use*`-prefixed helpers in `api.ts` that tripped rules-of-hooks, fixed a setState-in-effect cascade, scoped the `fs` read in `chain.ts` so Turbopack stops tracing the whole project into the server bundle. `tsc` clean, `build` clean. Also bumped tsconfig target ES2017→ES2020 for BigInt literals.
- 2026-09-19: Audited claims vs reality — Foundry is not installed on this machine, so no contract test result here is verified; `TaskPolicy`/`BondVault` exist but their ABIs were never exported, leaving them invisible to the middleware.
- 2026-09-19: **Person B unblocked the whole stack.** Installed Foundry 1.8.3 → **111/111 contract tests pass** (A's claims confirmed). Added `TaskPolicy`/`BondVault` to `export-abi.mjs` and extended `Deploy.s.sol` to deploy + authorize them. Stood up anvil, deployed, seeded. The live read path — written but never once executed — now works: every read endpoint returns `mode: "live"`.
- 2026-09-19: Built the bonded-execution lifecycle API (`/api/tasks` + `/bond` + `/submit` + `GET`) on a viem write client. **Verified both paths on-chain**: pass path releases the bond; slash path paid the buyer exactly $40 of a $50 bond with `maxCompensation` $40 enforced and $10 refunded. Live premium contrast confirmed: $1.10 trusted vs $12.95 fraudster.
- 2026-09-19: Ran A's `fire.mjs` on a separate bench chain (:8547 — it refuses to pollute the demo chain). 20 txs, 1 block, 0 reverts. `/api/demo/fire` now serves that measured JSON with the sequential-anvil caveat attached instead of returning 503.
- 2026-09-19: Verified the inherited contracts track before building on it (TODO 1.1). All claims in `contracts/README.md` hold: 60/60 tests pass, `node export-abi.mjs` reproduces the committed ABIs with zero drift, and `Deploy.s.sol` + `Seed.s.sol` run clean against a fresh anvil producing byte-identical addresses to `deployments/31337.json`. Confirmed Monad testnet is chain 10143 and the canonical ERC-8004 registry still has no bytecode there. Nothing inherited is broken; the bonded-execution build starts from a green base.
- 2026-09-19: Person C refactored frontend per GO.md — single Agent Risk Terminal, locked design tokens, VaultInfo types, mock/live `/api/vaults` client with fallback fixtures, StatTiles + DataTable + StatusBadge primitives. Removed `/lp`, `/demo`, old vibecode styling.
- 2026-09-19: Person C wired `GET /api/premium` contrast card ($1.10 vs $12.95 on flaky-scraper-v0) and `POST /api/demo/fire` parallelism panel (simulated shape, Monad 400ms/800ms labeled separately). Browser-verified on `:3001`.
- 2026-09-19: Person C polish pass — `AddressChip`, light-mode tokens, series legend, benchmark stat tiles (tx/reverts/p50), refresh control, `OurMeasurements` types ready for live `fire.mjs` output.
- 2026-09-19: Person C shipped Protected Task Lifecycle panel (`GET /api/tasks/:id` mock), workload strip plot, latest/safe/finalized labels on benchmark panel.
- 2026-09-19: Person C finished benchmark SSE stream (`GET /api/demo/fire/stream`), tx receipts table, connection-state badges, Turbopack-safe `run-script.ts` spawn; `npm run build` green.
- 2026-09-19: Person C shipped premium editorial landing page at `/`, moved Agent Risk Terminal to `/terminal` with static product mockups and warm off-white aesthetic.
- 2026-09-19: Person C unified terminal with landing design system — light editorial tokens, pill buttons, restrained badges, dark inset chart panel, shared CSS variables.
