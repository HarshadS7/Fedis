# Fides — Smart Contracts (Person A)

Bilateral underwriting for the agentic web, on Monad. LPs underwrite individual AI agents;
buyers are priced by an on-chain trust score; failed tasks are settled by slashing the
failing agent's isolated vault.

**Status: contracts complete, 60/60 tests passing, ABIs frozen and exported.**
Deployed and seeded on a local node. Monad testnet deploy is one command away and needs
only a funded key — see [Deploying to Monad testnet](#deploying-to-monad-testnet).

---

## Quick start (B and C — you need nothing from me but this)

```bash
cd contracts
anvil &                                                   # local node on :8545
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
forge script script/Seed.s.sol   --rpc-url http://127.0.0.1:8545 --broadcast
```

That gives you a live chain with four agent vaults and two scored buyers already on it.

- **Addresses** → `contracts/deployments/<chainId>.json`
- **ABIs** → `contracts/abi/*.json`, plus `contracts/abi/index.json` as one bundle
- Re-export after any contract change: `node export-abi.mjs` (it fails loudly if a frozen
  signature disappears)

The seed puts every branch of the model on screen at once:

| Agent | TVL | Utilization | LP APY | Agent risk | Slashes |
|---|---|---|---|---|---|
| `gpt-researcher-v2` (blue chip, over-capitalized) | $250,032 | 9.6% | **4.15%** | 0.5% | 0 |
| `claude-summarizer-v1` (workhorse, at the kink) | $40,072 | 79.9% | **19.96%** | 0.5% | 0 |
| `flaky-scraper-v0` (hallucinates) | $26,652 | 52.5% | **13.81%** | 5.51% | 4 |
| `new-translator-v1` (no capital yet) | $0 | 100% | **150%** | 3.0% | 0 |

Buyers: a trusted wallet at score **9100** (0.2x) and a caught fraudster at **3392** (2.35x).
On a $100 task against `flaky-scraper-v0` they pay **$1.10** and **$12.95** respectively.

---

## Read this before you write the demo script (Person B)

Four things I found while building that change what you should do:

**1. The ERC-8004 registry does not exist on Monad testnet.**
The canonical `IdentityRegistry` (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`) is live on
Monad *mainnet* — it's an ERC-721 named `AgentIdentity`/`AGENT`, and I confirmed `ownerOf`
works there. On testnet that address has **zero bytecode**. `Deploy.s.sol` detects this and
substitutes `MockIdentityRegistry` automatically, so nothing breaks; just don't promise
judges a live ERC-8004 read on testnet. Pointing at the real registry on mainnet is a
constructor argument, not a code change.

**2. Fire the 500-transaction demo from many wallets, not one.**
This is the one that can quietly sink the kill-shot demo. Isolating vault state is not
enough: if a single relayer wallet pays all 500 premiums, every transaction
read-modify-writes `USDC.balanceOf(relayer)`, Monad's scheduler detects the conflict and
re-executes them **serially** — and 500 transactions from one EOA serialize on that
account's nonce anyway. `test_aSharedRelayerWalletReintroducesContention` pins this down.

Two things in the contract exist for you because of it:
- `bondFor(agentId, payer, premium, coverage)` charges the **buyer's** wallet while keeping
  authorization on your relayer, so the token ledger stays partitioned.
- `setAuthorizedBatch(address[], bool)` authorizes many demo signers in one transaction.

**3. Monad charges gas on the limit you set, not the gas you use.**
Measured costs, so you can set tight limits instead of letting a wallet guess:

| Call | Gas used | Suggested limit |
|---|---|---|
| `bondFor` / `bondWithCoverage` | ~99,000 | 130,000 |
| `slash` | ~33,000 | 60,000 |
| `deposit` | ~100,000 | 130,000 |

A reverting `eth_estimateGas` makes some wallets fall back to a huge limit, and on Monad
the user pays for all of it.

**4. The "one block" claim holds, with real numbers.**
500 bonds + 500 slashes = **66M gas**. I measured Monad testnet's block gas limit at
**150M** and block time at **~300ms** (50 blocks in 15s). So the whole workload fits in one
block with room to spare, and the real block time is *faster* than the 600ms in our pitch —
we can say 600ms and be safely conservative, or measure it live on stage.

---

## Frozen integration ABI

These signatures will not change. Build against them.

| Function | Contract | Notes |
|---|---|---|
| `bond(bytes32 agentId, uint256 premium)` | `AgentVault` | Frozen. Charges `msg.sender`; no coverage notional, so it does not move the APY curve. Prefer `bondFor`. |
| `slash(bytes32 agentId, address user, uint256 amount)` | `AgentVault` | Returns `paid`. Caps at available capital instead of reverting, so one underfunded vault can't kill your batch. Emits the shortfall. |
| `getVaultStats(bytes32 agentId) → (tvl, apy, jobVolume)` | `AgentVault` | `apy` is in bps off the live curve. |
| `getTrustScore(address user) → uint256` | `UserUnderwriting` | 0–10000. |
| `flagMaliciousDispute(address user)` | `UserUnderwriting` | The Nuclear Penalty. |
| `calculatePremium(bytes32 agentId, address user, uint256 taskCost) → uint256` | `PremiumEngine` | The one call before approving a task. |

### Additions that will make your life easier

| Function | Contract | Why you want it |
|---|---|---|
| `bondFor(bytes32, address payer, uint256 premium, uint256 coverage)` | `AgentVault` | **Use this in the interceptor.** Charges the buyer, keeps auth on you, keeps the token ledger parallel. |
| `bondWithCoverage(bytes32, uint256, uint256)` | `AgentVault` | Same but charges `msg.sender`. |
| `getAllVaultInfo() → VaultInfo[]` | `AgentVault` | Your whole `GET /vaults` response in **one** RPC call. |
| `getVaultInfo(bytes32) → VaultInfo` | `AgentVault` | TVL, utilization, APY, risk, job/slash counts, escrow address. |
| `getAllAgentIds() → bytes32[]` | `AgentVault` | Enumerate registered agents. |
| `previewApyAt(uint256 utilizationBps) → uint256` | `AgentVault` | **Person C:** plot the whole kinked curve client-side, no RPC per point. |
| `assetsOf(bytes32, address lp) → uint256` | `AgentVault` | An LP's position value, for the LP Terminal. |
| `getUserProfile(address) → (score, tier, multiplierBps, collateralBps, …)` | `UserUnderwriting` | Your entire `/trust-score` response in one call. `tier`: 2 high-trust, 1 standard, 0 risky. |
| `quote(bytes32, address, uint256) → (premium, multiplierBps, agentRiskBps, trustScore)` | `PremiumEngine` | Your `/premium` response, with the breakdown so C can show *why*. |
| `quoteTotalCost(...) → (total, premium, requiredCollateral)` | `PremiumEngine` | Includes the over-collateralization a risky buyer must post. |
| `registerAgent(bytes32 agentId, address operator, uint256 registryAgentId)` | `AgentVault` | Permissionless. Pass `0` for the registry id to skip the identity link. |
| `setAuthorizedBatch(address[], bool)` | `AgentVault` | Authorize your demo signers in one transaction. |

### Events to index (for the live feed)

`Bonded`, `Slashed`, `Deposited`, `Withdrawn`, `AgentRegistered`, `ProtocolFeesSwept` on
`AgentVault`; `GoodVolumeRecorded`, `DisputeRecorded`, `MaliciousDisputeFlagged` on
`UserUnderwriting`. `Bonded` and `Slashed` carry everything the kill-shot visualizer needs.

---

## Shared conventions

| Thing | Value |
|---|---|
| USDC decimals | 6 |
| Trust score range | 0–10000 |
| Agent id | `bytes32`, `keccak256(agentName)` — e.g. `keccak256("gpt-researcher-v2")` |
| All rates/multipliers | basis points (10000 = 100% = 1.0x) |
| Monad testnet | chain id **10143**, RPC `https://testnet-rpc.monad.xyz`, explorer `testnet.monadscan.com` |
| Faucet | https://faucet.monad.xyz |

⚠️ APY is returned in **bps** — `2000` means 20%, not 2000%. Divide by 100 for a percentage.

---

## The model

### Kinked utilization curve (`AgentVault`)

Utilization is insured job volume over TVL, so an over-capitalized vault sits at *low*
utilization and earns almost nothing. That is the mechanism that stops every LP from
crowding into one "safe" agent.

| Utilization | LP APY |
|---|---|
| 0% | 2% |
| 40% | 11% |
| 80% (the kink) | 20% |
| 90% | 85% |
| 100% | 150% |

An unfunded vault reads as 100% utilized on purpose: maximum advertised yield is exactly the
signal that should pull capital toward an agent with no coverage.

### Trust model (`UserUnderwriting`)

`score = 1000 + 9000 × volumeFactor × quality`, then halved once per malicious strike.

- `volumeFactor = good / (good + 5000 USDC)` — the rational form of `1 − e^(−good/k)`:
  same shape, saturating, cheap enough for the hot path of every quote.
- `quality = good / (good + 5 × disputed)` — the value-weighted half. A deep clean history
  absorbs one dispute; a thin one doesn't.

| Good volume | Score | Tier | Multiplier |
|---|---|---|---|
| $0 | 1000 | risky | 3.0x |
| $5,000 | 5500 | standard | ~1.75x |
| $45,000 | 9100 | high-trust | 0.2x |
| $45,000, then caught | 3392 | standard | 2.35x |

**The Nuclear Penalty** wipes 80% of historical good volume *and* adds a permanent
halving strike. Verified in tests: after one strike, pushing total volume past $145,000
still doesn't get the wallet back into high-trust.

### Agent risk (`AgentVault`)

0.5% for a flawless veteran, up to 20% for a serial failure, with a 3% floor for any agent
under 10 completed jobs — ten clean jobs is not evidence of reliability.

### Premium

```
premium = taskCost × agentRiskBps × userMultiplierBps,  floored at 0.001 USDC
```

The floor matters: without it, bps rounding takes the premium on a sub-cent x402 call to
exactly zero. At $0.001 it is ~300x below the ~$0.30 flat card fee that makes micro-commerce
impossible in the first place — that's the pitch, and it's enforced in code.

---

## Why this is Monad-native (Person A's 15 seconds on stage)

A conventional insurance pool keeps one `totalTreasury` variable. 500 agents transacting at
once means 500 writes to one slot: the optimistic scheduler detects the conflict, re-executes
serially, and throughput collapses to Ethereum's.

Fides has no such variable. State is partitioned at **three** layers:

1. **Accounting** — `_vaults[agentId]` and `sharesOf[agentId][lp]`, slots derived from the
   agent id.
2. **Custody** — each agent gets its own `VaultEscrow` clone, so `USDC.balanceOf(escrow)` is
   a distinct slot too. This layer is the one everybody forgets: isolate the vault mapping
   but share one custody address, and the *token contract* silently re-serializes every
   transaction you just worked to parallelize.
3. **Fees and guards** — the 10% take-rate accrues per agent (`v.protocolFees`) and is swept
   per agent, rather than transferring to one treasury balance on every bond. Reentrancy
   protection uses EIP-1153 transient storage, because a classic `ReentrancyGuard` writes one
   persistent slot on *every call* — a global write barrier across the whole contract.

This isn't asserted, it's tested. `test_policyWritesAreDisjointAcrossAgents` records the
actual storage slots written by a bond+slash against two different agents and asserts the
sets don't intersect — in `AgentVault` **and** in the USDC ledger.
`test_gasPerPolicyIsFlatAsTheProtocolGrows` shows per-policy cost unchanged from the 2nd
agent to the 200th (99,083 → 99,090 gas).

---

## Deploying to Monad testnet

Blocked on one thing only: a deployer key funded with testnet MON.

```bash
cp .env.example .env          # add PRIVATE_KEY, and MIDDLEWARE = B's signer
# fund the address at https://faucet.monad.xyz

source .env
forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
forge script script/Seed.s.sol   --rpc-url monad_testnet --broadcast
node export-abi.mjs
```

Addresses land in `deployments/10143.json`. Then verify on all three explorers at once:

```bash
forge verify-contract <ADDR> src/AgentVault.sol:AgentVault \
  --chain 10143 --show-standard-json-input > /tmp/standard-input.json
# POST to https://agents.devnads.com/v1/verify — see the monskills scaffold skill
```

---

## Layout

```
src/
  AgentVault.sol           isolated per-agent vaults, LP shares, kinked curve, slashing
  UserUnderwriting.sol     value-weighted trust score, Nuclear Penalty
  PremiumEngine.sol        bilateral quote: agent risk x user multiplier
  VaultEscrow.sol          per-agent USDC custody (the parallelism layer)
  interfaces/              IIdentityRegistry (ERC-8004 read surface)
  mocks/                   MockUSDC (6dp, open faucet), MockIdentityRegistry
script/
  Deploy.s.sol             full stack -> deployments/<chainId>.json
  Seed.s.sol               demo agents + scored buyers
test/                      60 tests: unit, fuzz, integration, storage-isolation proofs
abi/                       exported ABIs for B and C
```

```bash
forge test          # 60 tests
forge test -vv      # with the gas + storage-slot logs
node export-abi.mjs # re-export ABIs after any change
```
