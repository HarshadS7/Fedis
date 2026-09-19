# Fedis — 3-Person Hackathon Build Plan

*2026-09-19*

## Overview

Fedis is a decentralized bilateral underwriting and insurance clearinghouse for the agentic web, built on Monad. It insures users against AI agent failure (hallucination, unauthorized calls, missed tasks) by pooling LP capital into isolated per-agent vaults, pricing premiums off a dynamic user trust score, and settling disputes on-chain via Monad's parallel EVM.

The build splits into three tracks that touch different layers of the stack and can be developed almost entirely in parallel, provided the interfaces in the **Integration Contract** section below are locked first (ideally in the first 30-60 minutes).

| Person | Track | Core deliverable |
| --- | --- | --- |
| A | Smart Contracts (Solidity) | `AgentVault.sol`, `UserUnderwriting.sol`, `PremiumEngine.sol` deployed to a Monad testnet |
| B | Middleware / x402 Integration (TypeScript/Node.js) | The interceptor between agents that calls the contracts and exposes a clean API |
| C | Frontend & Visualizer (React + Tailwind) | LP Terminal dashboard + the "500 simultaneous transactions in 600ms" kill-shot demo |

Person A is the critical path — B and C both build against A's contract interfaces (ABIs), so A should publish a mock ABI and a local Hardhat/Foundry node within the first hour so B and C are never blocked waiting for real contracts.

## Person A — Smart Contracts (Solidity)

Owns everything that lives on-chain. This is the critical path: B's middleware and C's frontend both call these contracts, so getting the ABIs stable early matters more than gold-plating the logic.

**Files to build:**

1. `AgentVault.sol`
   - Isolated storage per agent: `mapping(bytes32 agentId => AgentVault) vaults` — never a single shared treasury variable (this is the whole point of the Monad-native design).
   - LP deposit / withdraw functions (USDC in, LP shares out).
   - `slash(bytes32 agentId, address user, uint256 amount)` — pays the user out of that agent's vault on a verified failed task.
   - `bond(bytes32 agentId, uint256 premium)` — records a premium payment into the vault.
   - Kinked utilization curve: LP yield rate drops once a vault's TVL exceeds a threshold relative to its job volume — this is what pushes capital toward newer agents.
   - Reads agent identity from the ERC-8004 Registry (can stub this with a simple owned mapping for the hackathon if the real registry isn't available on Monad testnet).

2. `UserUnderwriting.sol`
   - Tracks `totalGoodVolume`, `totalDisputedVolume`, `maliciousStrikes` per user address.
   - `getTrustScore(address user) returns (uint256)` — the Value-Weighted Exponential Trust Model. New wallets default under 2000; score climbs as good volume accrues; crossing 8000 = High-Trust.
   - `flagMaliciousDispute(address user)` — the Nuclear Penalty: instantly slashes 80% of historical trust volume.

3. `PremiumEngine.sol`
   - `calculatePremium(bytes32 agentId, address user, uint256 taskCost) returns (uint256)` — multiplies the agent's base risk (from `AgentVault`) by the user's CIBIL risk multiplier (from `UserUnderwriting`): 0.2x for High-Trust, up to 3.0x for new/risky users.
   - This is the single function B's middleware calls before approving any task.

**Timeline priority:** deploy a stub version of all three contracts with fixed/mock return values in hour 1 so B and C can integrate immediately, then fill in real logic over the rest of the hackathon. Ship the ABI JSON to the team the moment it's stable — B and C should never have to guess a function signature.

**Stretch (if time allows):** actual on-chain read from a deployed ERC-8004 registry instead of the stub; more granular kink parameters.

## Person B — Middleware & x402 Integration (TypeScript/Node.js)

Owns the layer that sits between agents and turns "an agent pays another agent" into "an agent pays another agent, insured." This track depends on Person A's ABIs but can be fully built and tested against a local Hardhat/Foundry node or mocked contract calls while A's real logic is still being written.

**What to build:**

1. **The x402 interceptor** — a lightweight middleware/proxy for the Agent-to-Agent (A2A) payment flow:
   - Agent B sends an x402 payment request to Agent A.
   - Interceptor pauses the request and calls `PremiumEngine.calculatePremium()`.
   - The task cost + Fedis premium is collected from the paying user/agent.
   - Interceptor calls `AgentVault.bond()` to route the premium into the right vault, then approves the task to proceed.

2. **The claims/dispute API** — when a task fails or is disputed:
   - Endpoint to submit a claim (task ID, agent ID, evidence).
   - Calls `AgentVault.slash()` to pay out the user, or `UserUnderwriting.flagMaliciousDispute()` if the claim is found fraudulent.
   - For the hackathon, claim verification can be manual/mocked (a simple oracle or admin-triggered function) — building a real dispute-resolution mechanism is out of scope for a demo.

3. **A clean REST/JSON API layer** wrapping all contract reads — this is what Person C's frontend actually talks to, so it should never require C to know Solidity or handle raw contract calls:
   - `GET /vaults` — list all agent vaults, current APY, utilization.
   - `GET /users/:address/trust-score`
   - `POST /tasks/:id/dispute`
   - `GET /premium?agentId=&taskCost=`

**Timeline priority:** build the API layer against Person A's mock/stub contracts from hour 1 so Person C is never blocked. Swap in real contract addresses as A ships them — this should be a config change, not a rewrite, if the ABI stays stable.

**Stretch (if time allows):** real x402 protocol compliance rather than a simplified mock of it; webhook/event listener so the frontend gets live updates instead of polling.

## Person C — Frontend & Visualizer (React + Tailwind)

Owns everything judges actually look at. Builds entirely against Person B's REST API (never touches the contracts directly), so this track can start immediately with mocked JSON responses shaped like B's planned endpoints, then swap to live calls once B's API is up.

**What to build:**

1. **Dashboard 1 — The LP Terminal**
   - List of live Agent Vaults with current APY (from the kinked utilization curve), TVL, and job volume.
   - One-click "stake USDC" flow into a selected vault.
   - Simple visual of the utilization curve so LPs can see why yield drops as a vault fills up.

2. **Dashboard 2 — The Kill-Shot Visualizer (this is the demo moment)**
   - Split-screen live feed.
   - Left side: a counter/log of 500 simultaneous `slash()`/`bond()` transactions firing (the actual firing script is Person B's `Promise.all()` Node script — C just needs to consume its output, e.g. via WebSocket or polling a status endpoint).
   - Right side: visual proof they all clear inside one 600ms Monad block — a timer, a block counter, or an animated confirmation feed that makes the parallel-execution claim tangible rather than just asserted.
   - This is the single visual that makes or breaks the "why Monad" pitch — treat it as the top priority once the LP Terminal is functional.

**Timeline priority:** build both dashboards against hardcoded/mocked data first so the demo has something to show even in a worst-case scenario where B's API isn't fully live yet. Wire up real API calls once B's endpoints are stable.

**Stretch (if time allows):** a small "submit a dispute" UI for the user side of the journey; a live trust-score lookup widget.

## Integration Contract

This is what actually lets three people build in parallel. Lock these shapes in the first 30-60 minutes, even as stubs — nobody should be blocked waiting on someone else's real implementation.

**A → B: contract ABIs**

| Function | Contract | Called by |
| --- | --- | --- |
| `bond(bytes32 agentId, uint256 premium)` | `AgentVault.sol` | B, on every approved task |
| `slash(bytes32 agentId, address user, uint256 amount)` | `AgentVault.sol` | B, on a verified claim |
| `getVaultStats(bytes32 agentId) returns (uint256 tvl, uint256 apy, uint256 jobVolume)` | `AgentVault.sol` | B, for the `/vaults` endpoint |
| `getTrustScore(address user) returns (uint256)` | `UserUnderwriting.sol` | B, for the `/trust-score` endpoint |
| `flagMaliciousDispute(address user)` | `UserUnderwriting.sol` | B, on a rejected claim |
| `calculatePremium(bytes32 agentId, address user, uint256 taskCost) returns (uint256)` | `PremiumEngine.sol` | B, before approving any task |

A ships this as a checked-in ABI JSON + a local Hardhat/Foundry node with stub values (e.g. `getTrustScore` always returns 5000) the moment the function signatures are decided — before the real logic is finished.

**B → C: REST API contract**

| Endpoint | Method | Returns |
| --- | --- | --- |
| `/vaults` | GET | `[{ agentId, tvl, apy, jobVolume }]` |
| `/users/:address/trust-score` | GET | `{ score, tier: "high-trust" \| "standard" \| "risky" }` |
| `/premium` | GET (query: `agentId`, `taskCost`) | `{ premium, multiplier }` |
| `/tasks/:id/dispute` | POST | `{ status, payout? }` |
| `/demo/fire` | POST | Triggers the 500 simultaneous `slash()`/`bond()` script; streams progress |

B ships a mocked version of this API (hardcoded JSON, no real contract calls) in hour 1 so C can start wiring the UI immediately.

**Shared conventions:** agree once, up front, and don't revisit — USDC decimals (6), trust score range (0-10000), agent IDs as `bytes32` (probably `keccak256` of a string name for the demo), and which Monad testnet/RPC everyone points at.

## Timeline

Assuming a typical ~24-hour hackathon. Adjust proportionally for shorter formats.

| Time | A (Contracts) | B (Middleware) | C (Frontend) |
| --- | --- | --- | --- |
| Hour 0-1 | Scaffold all 3 contracts, agree on ABI shapes with B | Scaffold API server, agree on ABI shapes with A | Scaffold both dashboards with hardcoded mock data |
| Hour 1-4 | Deploy stub contracts with fixed return values | Build API layer against A's stubs; build the `Promise.all()` 500-tx script | Build LP Terminal UI against B's mocked API |
| Hour 4-8 | Implement real `AgentVault` logic (bond/slash/kink curve) | Wire real contract calls into the interceptor and API | Build the kill-shot visualizer; wire it to B's `/demo/fire` |
| Hour 8-12 | Implement `UserUnderwriting` trust scoring | Implement claims/dispute endpoint | Polish visuals, add the utilization curve chart |
| Hour 12-16 | Implement `PremiumEngine`; integration test with B | Integration test full flow end-to-end with A + C | Full integration test with live B API |
| Hour 16-20 | **Merge point 1:** full contract suite deployed to testnet, ABI frozen | **Merge point 1:** API fully live against real contracts | Swap all mocked data for live API calls |
| Hour 20-22 | Bug fixes, gas/perf check on the 500-tx demo | Bug fixes, stress-test the 500-tx script for reliability | Bug fixes, rehearse the demo flow |
| Hour 22-24 | **Merge point 2:** freeze | **Merge point 2:** freeze | Final polish, prep pitch deck alongside the live demo |

The two hard merge points: **ABI freeze** (contracts stop changing shape — everything after that is internal logic, not interface) and **full integration test** (all three pieces talking to each other end-to-end, with buffer time before the deadline to fix what breaks).

## Demo Script (60 seconds, three speakers)

Map the pitch to the people who built each piece — it reads as a real team, not one person presenting someone else's work.

1. **Person B or whoever frames the problem (15s):** "Visa covers fraud, not AI hallucinations, and their flat fees kill x402 micro-payments. Agents have identity via ERC-8004, but no liability layer."
2. **Person A walks through the contracts on-screen (15s):** show the deployed `AgentVault`, `UserUnderwriting`, and `PremiumEngine` on a block explorer — real addresses, real transactions, not slides.
3. **Person C runs the kill-shot demo live (20s):** trigger the 500 simultaneous `slash()`/`bond()` transactions and let the split-screen visualizer show them clearing inside one 600ms Monad block. This is the moment that proves the Monad-native architecture claim instead of just asserting it.
4. **Whoever closes (10s):** "We built the missing financial infrastructure for the autonomous economy — bilateral underwriting, priced dynamically, settled in 600ms."

Rehearse the handoffs, not just the individual parts — judges notice when a team clearly built this together versus one person carrying the pitch.
