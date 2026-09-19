> **Superseded by [`project_plan.md`](./project_plan.md).** This doc describes the
> original insurance-pool model; the pivoted plan replaces the MVP with bonded
> execution and demotes this model to a post-hackathon Phase 4. Kept for history.
> Build plan: [`fedis-build-plan-v2.md`](./fedis-build-plan-v2.md).

# Aegis (IsoVault): Bilateral Underwriting & Insurance for the Agentic Web

## 1. Executive Summary
The Agentic Web is expanding rapidly via the **x402 payment protocol** and the **ERC-8004 Agent Identity Standard**. Agents can now discover each other, prove their identity, and process micro-payments. However, the ecosystem lacks a native **Liability and Slashing Layer**. 

Currently, if an autonomous AI agent hallucinates, fails a task, or makes an unauthorized API call, there is no financial recourse for the human or agent who hired it. Visa and Mastercard cannot solve this because they require KYC, charge high flat fees that kill micro-commerce, and only cover *fraud*, not AI *hallucinations*.

**Aegis** is a decentralized, bilateral underwriting and insurance clearinghouse built natively for **Monad**. By leveraging Monad's optimistic parallel execution and MonadDB, Aegis creates isolated insurance vaults and dynamic credit scores that scale to thousands of simultaneous agent-to-agent transactions without state contention. 

---

## 2. The Core Protocol Mechanics
Aegis operates on two sides of the autonomous transaction:

### A. The Agent Side (Isolated LP Vaults)
Agents do not post their own collateral. Instead, Liquidity Providers (LPs) deposit USDC into **Isolated Agent Vaults** to underwrite specific agents they believe are reliable. 
* LPs earn the insurance premiums paid on that agent's tasks.
* If the agent fails or hallucinates, the vault is slashed to make the buyer whole. 
* **Kinked Utilization Curves:** To prevent all capital from crowding into a single "safe" agent, LP yield drops algorithmically if a vault is over-capitalized relative to its job volume. This forces the free market to fund new, upcoming agents.

### B. The User Side (Bilateral Trust / CIBIL Score)
To prevent malicious users from farming fake disputes to steal LP capital, users are scored via an on-chain **Value-Weighted Exponential Trust Model** (`UserUnderwriting.sol`).
* **High-Trust Users (Score > 8000):** Pay a fraction of the base insurance premium (e.g., 0.2x multiplier).
* **New/Risky Users (Score < 2000):** Must pay a high premium (e.g., 3.0x multiplier) and over-collateralize tasks to protect the LPs from Sybil attacks.
* **The Nuclear Penalty:** If a user is caught triggering a fraudulent dispute, 80% of their historical "Trust Volume" is instantly slashed, permanently degrading their CIBIL score.

---

## 3. Why Monad? (The Architectural Moat)
If this protocol were built on Ethereum, Base, or Arbitrum, it would fail at scale. Standard DeFi insurance protocols use a single shared `totalTreasury` variable. If 500 agents execute a transaction simultaneously, all 500 write to the same storage slot, causing massive state contention, gas spikes, and sequential execution bottlenecks.

**The Monad-Native Architecture:**
Aegis is explicitly designed to exploit Monad’s parallel EVM. 
* We use **strictly isolated storage slots** via `mapping(bytes32 => AgentVault)`. 
* Because Agent A's insurance premium and Agent B's slashing event touch completely different storage slots, Monad's optimistic scheduler processes them simultaneously. 
* This allows Aegis to clear thousands of policies, payments, and disputes in a single **600ms finality block**, creating the high-frequency liability layer required for machine-to-machine commerce.

---

## 4. Revenue & Monetization Model
Aegis does not rely on taking the LP's capital. The protocol generates revenue via a three-pillar model:

1. **The Origination Fee (The Stripe Model):** Aegis automatically sweeps a 10% take-rate on all insurance premiums paid by the user. LPs keep the other 90%.
2. **Idle Yield (The Bank Model):** Millions in USDC sit in Agent Vaults waiting for claims. Aegis routes this idle capital into blue-chip Monad lending markets, generating a baseline APY. The protocol takes a 20% performance fee on this generated yield.
3. **The Risk Oracle (The B2B Model):** Because Aegis manages the user CIBIL scores and Agent failure rates, it holds the most valuable proprietary data in the agent economy. Other dApps and x402 facilitators pay micro-fees to query the Aegis API for risk assessments before authorizing transactions.

---

## 5. What Needs to be Built (Hackathon Roadmap)

### Phase 1: Smart Contracts (Solidity)
* **`AgentVault.sol`:** 
  * Isolated mapping for LP USDC deposits.
  * Integration with the ERC-8004 Registry to read agent IDs.
  * Slashing function that pays the user upon a verified failed task.
  * Kinked utilization curve math for LP yield.
* **`UserUnderwriting.sol`:** 
  * Tracks `totalGoodVolume`, `totalDisputedVolume`, and `maliciousStrikes`.
  * Implements the Bayesian-style trust formula and the 80% geometric wipeout penalty.
* **`PremiumEngine.sol`:** 
  * Calculates the real-time fee by multiplying the Agent's Base Risk by the User's CIBIL Risk Multiplier.

### Phase 2: Middleware & x402 Integration (TypeScript/Node.js)
* Build a lightweight interceptor for the **x402 A2A (Agent-to-Agent) protocol**.
* **The Flow:** 
  1. Agent B sends an x402 payment request to Agent A.
  2. The middleware pauses the request, queries `PremiumEngine.sol`.
  3. The user/Agent A pays the task cost + the Aegis premium.
  4. The middleware routes the premium to the correct `AgentVault` and approves the task execution.

### Phase 3: The Frontend & Visualizer (React + Tailwind)
* **Dashboard 1 (The LP Terminal):** A clean interface showing live Agent Vaults, their current APY based on the kinked utilization curve, and one-click USDC staking.
* **Dashboard 2 (The Hackathon "Kill Shot" Visualizer):** A split-screen live data feed. 
  * *The Script:* Write a Node.js script using `Promise.all()` to fire 500 simultaneous `slash()` and `bond()` transactions.
  * *The UI:* Visually demonstrate the transactions clearing instantly in a single 600ms Monad block due to the isolated state architecture. 

---

## 6. The Pitch (60-Second TL;DR for Judges)
> "Visa covers fraud, but they don't cover AI hallucinations, and their 30-cent flat fees destroy the x402 micro-payment economy. The Agentic Web has identity via ERC-8004, but it lacks a liability layer. We built Aegis: the bilateral underwriting clearinghouse for machine commerce. We price risk dynamically based on an agent's historical accuracy and the user's on-chain CIBIL score. By strictly isolating agent vaults, we leverage Monad’s parallel EVM to settle thousands of micro-insurance policies and slashes simultaneously in 600ms. We didn't just build DeFi; we built the missing financial infrastructure for the autonomous economy."