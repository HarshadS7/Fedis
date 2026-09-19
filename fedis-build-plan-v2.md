# Fedis — 3-Person Build Plan v2 (Bonded Execution Pivot)

*2026-09-19*

## Why this replaces `fedis-build-plan.md`

The original plan built against `project.md`'s model: LP insurance vaults, kinked
utilization curves, a CIBIL-style trust score with an 80% "nuclear penalty." After
research and harsher judging simulation, the team wrote `project_plan.md`, which
demotes all of that to **Phase 4, post-hackathon** and replaces the MVP with a
**bonded execution** primitive: an agent locks collateral against a
machine-checkable success predicate before it works, and a deterministic validator
releases or slashes the bond. No claim that a contract can judge "hallucination."

## Current state (read before starting)

- **Contracts track already shipped one full protocol** — `AgentVault.sol`,
  `PremiumEngine.sol`, `UserUnderwriting.sol`, `VaultEscrow.sol`. 60/60 tests passing,
  ABIs frozen (`contracts/abi/`), deployed + seeded on local anvil. This is real,
  tested work — but it implements the *old* insurance-pool model, which
  `project_plan.md` now treats as future Phase 4, not the MVP.
- **Decision: freeze it, don't delete it.** Don't spend more contract time on it.
  If there's slack time after the bonded-execution MVP is demo-ready, wire it in as
  the optional "Phase 4 LP underwriting layer" — it's a bonus act 2, not the opener.
- **Middleware and frontend tracks (B, C) haven't started.** `src/app` is still the
  default `create-next-app` scaffold — no API routes, no x402 code, no dashboards.
- **`TODO.md` didn't exist** — created alongside this plan per `AGENTS.md`.

## The new split

| Person | Track | Core deliverable |
| --- | --- | --- |
| A | Smart Contracts (Solidity) | `TaskPolicy.sol`, `BondVault.sol`, `ValidationRouter.sol` (+ `RiskScore.sol` if time allows) deployed to Monad testnet |
| B | Middleware / x402 Integration (TypeScript/Node.js) | Task lifecycle API (create → bond → execute → validate → settle) + the parallelism benchmark script |
| C | Frontend & Visualizer (React + Tailwind) | Agent Risk Terminal + Protected Task Lifecycle view + the Monad parallelism kill-shot dashboard |

As before: lock the interfaces first (30-60 min), then build in parallel against
stubs. A is still the critical path for B and C.

---

## Person A — Smart Contracts

**Files to build** (new; the old AgentVault/PremiumEngine/UserUnderwriting stay
frozen and untouched):

1. `AgentRegistryAdapter.sol`
   - Thin wrapper reusing the identity-check pattern already proven in
     `AgentVault.sol` (`IIdentityRegistry`, `MockIdentityRegistry` for testnet where
     the real ERC-8004 registry has no bytecode — same caveat as before).
   - Stores the agent ID associated with a task.

2. `TaskPolicy.sol`
   - `mapping(bytes32 taskId => Policy)` — isolated per task, never a shared
     counter. Reuse the storage-partitioning discipline from `AgentVault.sol`.
   - Fields: `taskId`, `agentId`, `paymentAmount`, `requiredBond`,
     `maxCompensation`, `deadline`, `validationMethod`, `validationDataHash`,
     `state` (Created → Bonded → Executed → Settled).
   - Guards against double-settlement / invalid state transitions.

3. `BondVault.sol`
   - Locks agent collateral for the lifetime of a task (can reuse the
     `VaultEscrow` clone-per-entity pattern for isolated custody, or a simpler
     `mapping(bytes32 taskId => uint256 bonded)` if time is short — this is a
     bond, not a pooled vault, so it doesn't need LP shares).
   - `release(taskId)` on verified success.
   - `slash(taskId)` on verified failure, pays configured compensation to buyer.

4. `ValidationRouter.sol`
   - One or two **deterministic** mechanisms only — e.g. oracle-value tolerance
     check, or a signed validator attestation (ecrecover against an authorized
     validator key). No LLM-as-judge, no subjective quality calls.
   - Emits canonical `ValidationPassed(taskId)` / `ValidationFailed(taskId)`.

5. `RiskScore.sol` *(optional, do last)*
   - Success/fail counts, dispute frequency, bond history — plain counters, no
     Bayesian formula. Every threshold must be a named, tunable constant (learn
     from the old `UserUnderwriting.sol`: judges pushed back on unexplained
     magic numbers like 8000/2000/80%).

**Priority order:** `TaskPolicy` → `BondVault` → `ValidationRouter` end-to-end with
stub values first (freeze the ABI the moment signatures are decided, same
discipline as last time — export via `export-abi.mjs`), then `RiskScore` only if
there's slack.

---

## Person B — Middleware & x402 Integration

Owns the task lifecycle API. Build against A's stub contracts from hour 1.

**Flow to implement:**

1. Buyer creates a protected task → middleware writes a `TaskPolicy`.
2. Agent accepts → locks bond via `BondVault`.
3. x402 handles the payment authorization for the task cost.
4. Agent executes off-chain; result + validation evidence submitted back.
5. Middleware calls `ValidationRouter`; on pass, `BondVault.release()`; on fail,
   `BondVault.slash()`.

**REST API for C:**

| Endpoint | Method | Returns |
| --- | --- | --- |
| `POST /tasks` | create task policy | `{ taskId, state }` |
| `POST /tasks/:id/bond` | agent locks collateral | `{ state, bondedAmount }` |
| `POST /tasks/:id/submit` | submit result + evidence | `{ state }` |
| `GET /tasks/:id` | lifecycle state | full policy + state |
| `GET /agents/:id/risk` | risk profile | success/fail counts, active exposure |
| `POST /demo/benchmark` | fires N independent task policies concurrently, **and** a separate conflicting-workload run against shared state | streamed inclusion/confirmation/finality timings — measured, not hardcoded |

**Carries over from the old plan's lessons learned (still true here):** fire the
benchmark from many wallets, not one relayer — a single EOA paying for every
transaction serializes on that account's nonce/balance regardless of how isolated
the contract state is. This is documented in `contracts/README.md` from the last
build and applies identically to the bonded-execution benchmark.

---

## Person C — Frontend & Visualizer

Builds against B's API with mocked JSON first.

1. **Agent Risk Terminal** — agent ID, available bond, success/fail counts, active
   exposure, required collateral, recent validation events feed.

2. **Protected Task Lifecycle view** — make the `project_plan.md` diagram literal
   and live for one real task:
   `INTENT → POLICY CREATED → AGENT BONDS → EXECUTE → VERIFY → (PASS→RELEASE→PAY | FAIL→SLASH→COMPENSATE)`

3. **Monad Parallelism Kill Shot** — this is still the demo moment, but the bar
   moved: show **independent workload vs. conflicting workload side by side**
   with real measured numbers from B's `/demo/benchmark`, not an asserted "600ms."
   Label clearly what's measured vs. what's Monad's documented spec, per
   `project_plan.md`'s explicit instruction not to conflate the two.

---

## Integration Contract (lock first)

Same discipline as before — A ships ABI JSON + local node with stub values, B
ships mocked REST responses, nobody blocks on someone else's real logic.
Shared conventions to fix once: USDC decimals (6), `taskId`/`agentId` as
`bytes32`, bond expressed as bps of `maxCompensation`, which Monad testnet/RPC
everyone points at.

## Bookkeeping

- `TODO.md` now exists — tick tasks there as you go, mark `[~]` when starting.
- `project.md` now carries a pointer to `project_plan.md` as the live plan;
  `project_plan.md` is the source of truth going forward. Update it (not this
  build plan) if the architecture changes again.
