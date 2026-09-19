# Fedis: Economic Liability & Bonded Execution for the Agentic Web

## 1. Executive Summary
The Agentic Web is expanding through standards and protocols such as **x402** for machine-native payments and **ERC-8004** for agent identity, reputation, and validation. The missing piece Fedis targets is a native **economic enforcement layer**: when an autonomous agent accepts a paid task, there needs to be collateral and an enforceable consequence if it fails a predefined obligation.

Fedis does not try to make a smart contract decide whether an AI “hallucinated.” Instead, each protected task declares a **machine-checkable success predicate** and a settlement policy before execution. An agent locks a bond to accept the task; objective validation releases the bond on success or can trigger compensation/slashing on failure. This makes liability enforceable at protocol level rather than relying on subjective post-hoc judgments.

**Fedis** is designed natively for **Monad**. Its task, bond, and policy state are partitioned so unrelated agent tasks can operate on independent storage. This creates a workload that is naturally compatible with Monad's optimistic parallel execution, allowing large numbers of independent liability events to be processed concurrently.

The long-term product is not merely “AI insurance.” Fedis is an **economic enforcement layer for autonomous agents**. Insurance and pooled underwriting can later be built on top of the bonded execution primitive.

---

## 2. The Core Protocol Mechanics
Fedis operates around a protected autonomous task:

### A. Agent Side — Bonded Execution
Agents must provide economic skin in the game before accepting a protected task.

* The agent locks a configurable **bond** against the task.
* The task specifies the maximum compensation, expiry, and validation method before execution.
* On a successful result, the agent receives the task payment and its bond is released.
* On a verified failure, the protocol can slash the required amount and compensate the buyer according to the policy.
* Each task gets isolated state so activity for Agent A / Task 1 does not require touching the accounting state of unrelated tasks.

The hackathon MVP should use **bonded execution**, not full capital-pool insurance. This dramatically reduces protocol complexity while preserving the key liability primitive.

### B. Task Policy & Deterministic Validation
Fedis must define what “failure” means before money is at risk.

Each protected task stores:

* `taskId`
* `agentId`
* `paymentAmount`
* `requiredBond`
* `maxCompensation`
* `deadline`
* `validationMethod`
* `validationDataHash` / policy parameters
* current settlement state

Implemented in `contracts/src/TaskPolicy.sol` as `Created -> Bonded -> Executed -> Released | Slashed`.
The terminal "Settled" stage is split into two states rather than one because the two outcomes pay
different parties, and because splitting them makes a repeat settlement *unrepresentable*: each
transition requires one specific predecessor state, so a settled task satisfies no guard and a second
settlement reverts rather than relying on a boolean flag being checked correctly.

Examples of machine-checkable success predicates:

* returned value is within a tolerance of an oracle value;
* signed API response satisfies an expected schema or SLA;
* output hash matches an expected artifact;
* a measurable latency / availability condition is satisfied;
* an authorized validator attests that a predefined objective condition passed.

**Important constraint:** Fedis does not claim that an LLM can be an objective truth oracle. Subjective AI-quality disputes are a later validation market problem. The hackathon demo should use deterministic or cryptographically verifiable predicates.

### C. Reputation / Risk Layer — Lightweight MVP
Fedis can maintain an on-chain risk profile from observable economic outcomes rather than arbitrary “CIBIL” thresholds.

Track signals such as:

* successful task volume;
* failed task volume;
* dispute frequency;
* bond history;
* recent failures;
* completed-task count.

A simple transparent risk score can influence required bond or premium. Avoid pretending that values such as `8000`, `2000`, or an `80%` wipeout are empirically calibrated; they should be parameters that can be tuned and explained.

Sybil resistance comes from **economic cost and historical track record**: a fresh identity has little useful history and may need a larger bond or less favorable terms until it builds credible execution history.

### D. Future Insurance Layer
Once bonded execution works, Fedis can introduce the original underwriting concept as a second layer.

* Liquidity Providers deposit USDC into **isolated Agent Risk Vaults**.
* LPs can underwrite an agent's residual liability instead of requiring the agent to supply the full bond.
* Premiums compensate LPs for taking the risk.
* Vaults can be capped by exposure and task volume.
* Diversified underwriting pools and utilization-based pricing can be added after the core protocol is proven.

This preserves the original insurance thesis without making the 7-hour MVP depend on complex insurance mathematics.

---

## 3. Why Monad? (The Architectural Moat)
Fedis is not using Monad merely because transactions are fast. The protocol is deliberately structured as a **low-contention workload**.

The main state is partitioned by task / agent rather than forcing every transaction through one global treasury counter.

**Monad-Native Architecture:**

* `mapping(bytes32 => TaskPolicy)` and per-agent / per-task accounting isolate unrelated state.
* Independent tasks can create independent reads and writes, giving Monad's optimistic scheduler an opportunity to execute them concurrently.
* Shared aggregate variables are minimized and updated through carefully designed accounting rather than being written by every task transaction.
* Hot state is treated as a potential contention point instead of assuming that every mapping write is automatically parallel.

The application should explicitly benchmark the difference between:

1. **Independent workload:** many transactions touching unrelated task policies.
2. **Conflicting workload:** many transactions intentionally touching the same task / account state.

The demo reports **measured inclusion / confirmation / finality times and transaction counts**, rather than hard-coding an expected number such as “600ms.” Monad's documented network characteristics and the application's observed timings should be kept separate.

The key claim is therefore:

> **Fedis designs machine-commerce liability events so that the workload is naturally parallelizable on Monad.**

---

## 4. Revenue & Monetization Model
The long-term business can evolve in layers instead of depending on LP capital from day one.

1. **Execution / Origination Fee:** Fedis takes a small percentage of protected task premiums or transaction value. For example, a configurable protocol fee can be charged when a policy is created or settled.
2. **Underwriting Marketplace:** In the future, LPs can underwrite agent liability through isolated vaults and earn premiums for capital actually exposed to risk.
3. **Risk & Enforcement API:** x402 facilitators and agent platforms can query Fedis for an agent's observed failure history, current collateral, active exposure, and enforcement status.
4. **Enterprise Agent Controls:** A future B2B product can provide policy templates, spending limits, task-level guarantees, audit trails, and enforcement for fleets of autonomous agents.

The business thesis is:

> **As agents transact more autonomously, economic guarantees become infrastructure.**

Fedis can monetize the creation, enforcement, and underwriting of those guarantees.

---

## 5. What Needs to be Built (Hackathon Roadmap)

### Phase 1: Smart Contracts — Core Primitive
Build only the components needed to demonstrate enforceable liability.

* **`AgentRegistryAdapter.sol`**
  * Reference ERC-8004 agent identities where practical.
  * Store the agent ID associated with protected tasks.

* **`TaskPolicy.sol`**
  * Creates an isolated policy for each task.
  * Stores payment, required bond, compensation cap, deadline, and validation parameters.
  * Prevents invalid state transitions such as double settlement.

* **`BondVault.sol`**
  * Locks agent collateral for the lifetime of a protected task.
  * Releases the bond after successful validation.
  * Slashes the configured amount after a verified failure.

* **`ValidationRouter.sol`**
  * Implements one or two deterministic validation mechanisms for the demo.
  * Example: oracle threshold or signed validator result.
  * Emits a canonical `ValidationPassed` / `ValidationFailed` event.

* **`RiskScore.sol`** *(optional if time permits)*
  * Tracks observable success/failure history.
  * Produces a transparent risk signal that can change required collateral.

Do **not** spend hackathon time implementing sophisticated Bayesian underwriting, kinked LP curves, or multi-asset yield routing before the core task lifecycle works end-to-end.

### Phase 2: Middleware & x402 Integration (TypeScript/Node.js)
Build a thin middleware layer around the payment flow.

**The Flow:**

1. Buyer Agent creates a protected task request through the middleware.
2. Fedis converts the request into a structured task policy.
3. The selected Agent accepts the task and locks the required bond.
4. x402 handles the underlying payment authorization / settlement flow.
5. The Agent executes the task off-chain.
6. The result and validation evidence are submitted.
7. Fedis releases the bond on success or executes the predefined compensation/slashing path on failure.

The key separation is:

* **x402:** moves value / handles machine-native payment.
* **ERC-8004:** supplies the agent identity / reputation ecosystem.
* **Fedis:** adds collateral, liability, and economic enforcement.

### Phase 3: Frontend & Hackathon Visualizer (React + Tailwind)

#### Dashboard 1 — Agent Risk Terminal
Show:

* agent ID;
* bond available;
* successful / failed tasks;
* current active exposure;
* required collateral;
* recent validation events.

#### Dashboard 2 — Protected Task Lifecycle
Make one task visually obvious:

```text
INTENT
  ↓
TASK POLICY CREATED
  ↓
AGENT BONDS COLLATERAL
  ↓
EXECUTE
  ↓
VERIFY
 ┌───────┴────────┐
PASS              FAIL
 ↓                  ↓
RELEASE            SLASH
 ↓                  ↓
PAY AGENT          COMPENSATE USER
```

#### Dashboard 3 — Monad Parallelism Kill Shot
Run a controlled benchmark with many independent tasks.

* Generate a set of independent task policies.
* Fire transactions concurrently from the client.
* Separately run a conflicting workload against the same state.
* Display transaction inclusion, confirmation / finality observations, and successful settlement counts.
* Visually group the independent transactions to show that Fedis's state partitioning is designed for parallel execution.

The benchmark must measure what actually happened. `Promise.all()` is only a client-side concurrency mechanism; it is not itself evidence of blockchain parallel execution.

---

## 6. The Pitch (60-Second TL;DR for Judges)
> “AI agents can identify each other and pay each other, but autonomous commerce still has a missing primitive: **who bears the loss when an agent fails a paid task?** x402 moves the payment. ERC-8004 helps establish agent identity and reputation. Fedis adds the economic enforcement layer. Before a protected task executes, the agent locks collateral against a machine-checkable success policy. If the task passes, the bond is released. If the predefined condition fails, Fedis can automatically slash collateral and compensate the buyer. We designed task and bond state to minimize contention, so high-frequency agent commerce can map naturally onto Monad’s parallel execution. The long-term protocol is an underwriting marketplace for autonomous agents; the hackathon MVP proves the underlying liability primitive.”

---

## 7. Post-Hackathon Expansion
Once the bonded execution primitive is proven, expand into the original IsoVault vision:

### Phase 4 — Underwriting
LPs fund isolated agent-risk vaults and underwrite bonds for agents with insufficient capital.

### Phase 5 — Advanced Risk Pricing
Introduce utilization-aware pricing, exposure caps, historical task-quality signals, and dynamic premiums.

### Phase 6 — Dispute / Validator Market
Add a formal validation market for tasks that cannot be reduced to deterministic predicates. Ambiguous claims can be escalated to validators with incentives and penalties.

### Phase 7 — Agent Liability Network
Expose standardized risk / collateral / enforcement information to agent marketplaces, x402 facilitators, and enterprise agent platforms.

The long-term thesis remains:

> **Identity tells you who an agent is. Payments move the money. Reputation tells you what happened before. Fedis makes future obligations economically enforceable.**
