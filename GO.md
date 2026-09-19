# GO — 60 minutes left

**Read this before opening `TEAM-PROMPTS.md`.** That file assumes a multi-hour build and
is now out of date. This one replaces it for the remaining hour.

## The call: do NOT build the bonded-execution pivot

`project_plan.md`'s `TaskPolicy` / `BondVault` / `ValidationRouter` rewrite is the right
design and is not buildable in 60 minutes. Starting it means at T+60 we have half-written
contracts, nothing deployed, and no UI — a guaranteed zero.

**What we actually have:** a complete, tested insurance-pool protocol — `AgentVault.sol`,
`PremiumEngine.sol`, `UserUnderwriting.sol`, `VaultEscrow.sol` — with exported ABIs, working
deploy + seed scripts, and `slash()` already implemented and tested. `slash()` *is* an
economic enforcement primitive. We keep the contracts and change the words.

**So: ship what's built, reframe the pitch honestly.** Costs zero build time and captures
most of the pivot's credibility:

- Say "economic enforcement / bonded liability", not "insurance against hallucination".
- Say slashing is triggered by an **authorized validator**, which is true — `slash()` is
  `onlyAuthorized`. Don't claim a contract judges AI quality.
- Say out loud which parts are simulated (validator is admin-triggered, registry is mocked).
- Never say "600ms" — Monad is **400ms blocks / 800ms finality**.
- Drop "CIBIL" and don't defend the 8000/2000/80% numbers as calibrated; call them tunable.

## Two things that will bite you in the first 5 minutes

1. **Foundry is not installed on this machine.** `forge`, `anvil`, and `cast` are all
   missing. Whoever owns the chain either has it on *their* machine, or must run
   `curl -L https://foundry.paradigm.xyz | bash && foundryup` first. Budget for it.
2. **If nobody can run a chain, we still have a demo.** `contracts/README.md` records the
   exact seeded numbers (reproduced in Person C's prompt below). Serve them as fixtures,
   show the contract source and tests on screen, and be honest that the chain is local.

## Time budget

| Clock | A (chain) | B (API) | C (UI) |
|---|---|---|---|
| 0-10 | Get a chain up + seeded | Mock API from README numbers | Tokens + shell, no data yet |
| 10-30 | Concurrency script | Real reads via `getAllVaultInfo()` | Vault table + stat tiles on mocks |
| 30-45 | Run it, capture numbers | Wire `/api/demo/fire` | Swap to live API |
| 45-60 | — rehearse together, all three — | | |

Hard rule: at **T+45 everyone stops building.** A demo you haven't rehearsed is a demo
that breaks on stage.

---

## Person A — chain + the parallelism run

````text
60-minute hackathon finish. Work fast, skip anything not on this list, no refactoring.
Repo: /home/shaurya/Documents/dev/hackathons/fides

WHAT ALREADY EXISTS (don't rebuild any of it, don't read the plan docs, no time):
- contracts/src/: AgentVault.sol, PremiumEngine.sol, UserUnderwriting.sol, VaultEscrow.sol,
  plus mocks/MockUSDC.sol and mocks/MockIdentityRegistry.sol. All written and tested.
- contracts/script/Deploy.s.sol and Seed.s.sol — working deploy + seed.
- contracts/abi/*.json — exported ABIs. contracts/deployments/31337.json — local addresses.
- Foundry is NOT installed on this machine. Check `forge --version` first; if missing:
    curl -L https://foundry.paradigm.xyz | bash && foundryup

WE ARE SHIPPING THESE CONTRACTS AS-IS. We are not building TaskPolicy/BondVault/
ValidationRouter — no time. Do not start them.

MINUTE 0-10 — get a chain up
1. `forge --version`; install Foundry if missing.
2. `cd contracts && forge build` then `forge test` — report pass/fail count, don't fix
   anything cosmetic.
3. `anvil &` then:
     export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
     forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
     forge script script/Seed.s.sol   --rpc-url http://127.0.0.1:8545 --broadcast
4. Confirm contracts/deployments/31337.json has fresh addresses. Post them to the team
   IMMEDIATELY — Person B is blocked on this. Then tell me "CHAIN UP".
5. Sanity check with cast that it's real:
     cast call <agentVault> "agentCount()(uint256)" --rpc-url http://127.0.0.1:8545

MINUTE 10-30 — the parallelism script
Write contracts/script/fire.ts (or a forge script, whichever you'll finish faster) that:
- Generates N wallets (start N=50, not 500 — prove it works, then scale if time allows).
- Funds each one properly. On a local anvil this is trivial; if we end up on Monad testnet,
  note that Monad has a 10 MON reserve floor per EOA and low-balance accounts are limited
  to roughly 1 tx per 1.2s, and a freshly funded account needs ~1.2s before it can send.
  Thin-funded burners = a flat, embarrassing graph.
- Fires two workloads and MEASURES them separately:
    A) INDEPENDENT: N bond() calls across N DIFFERENT agentIds (isolated storage).
    B) CONFLICTING: N calls all hitting the SAME agentId.
- Records per tx: submit time, block number, inclusion time, success/revert.
- Prints a summary table: tx count, wall time, txs per block, reverts — for each workload.
- FIRE FROM MANY WALLETS, NOT ONE. A single EOA serializes on its own nonce regardless of
  how well contract storage is partitioned. This is the one mistake that makes the whole
  demo show nothing.
- console.log every stage with a [fire] prefix, including failures with the wallet index
  and the revert reason. We need to debug this live if it misbehaves.

Report ONLY measured numbers. Do not print or claim "600ms" — Monad's published figures
are 400ms blocks / 800ms finality, and our measurements are a separate thing from those.

MINUTE 30-45
- Run it. Capture the output to a file so we have it even if a live run fails.
- Give Person B a way to trigger it (expose it as a script B can spawn, or just hand B the
  command). Coordinate — don't build an elaborate interface.
- If testnet deploy is realistic and someone has a funded key, do it now; otherwise stay
  local and we'll say "local node" honestly. Do not burn 15 minutes fighting a faucet.

MINUTE 45 — STOP BUILDING. Rehearse with B and C.

RULES
- Never claim something passes without showing me the command output.
- If a step fails, tell me immediately with the error — don't silently work around it.
- Don't refactor, don't add tests to existing contracts, don't tidy anything.
````

---

## Person B — API over the existing contracts

````text
60-minute hackathon finish. Work fast, skip anything not on this list.
Repo: /home/shaurya/Documents/dev/hackathons/fides (Next.js 16, React 19, Tailwind v4)

WHAT EXISTS: a tested insurance-pool contract suite with exported ABIs. src/app is still
the default create-next-app scaffold — no API routes yet. You are building the API layer.
Do NOT read the plan docs and do NOT research x402 — no time. We are shipping the existing
contracts and being honest in the pitch about what's simulated.

THE CONTRACT SURFACE YOU NEED (exact names, already deployed):
AgentVault:
  getAllVaultInfo() -> VaultInfo[]      <- ONE CALL GETS EVERYTHING. Use this.
  getAllAgentIds() -> bytes32[]
  agentCount() -> uint256
  getVaultInfo(bytes32 agentId) -> VaultInfo
  bond(bytes32 agentId, uint256 premium)
  slash(bytes32 agentId, address user, uint256 amount)
VaultInfo fields, in order:
  agentId, escrow, operator, registryAgentId, identityVerified, tvl, totalShares,
  jobVolume, premiumsEarned, totalSlashed, protocolFees, utilizationBps, apyBps,
  riskBps, jobCount, slashCount
PremiumEngine:
  calculatePremium(bytes32 agentId, address user, uint256 taskCost) -> uint256
  quote(bytes32 agentId, address user, uint256 taskCost)
UserUnderwriting:
  getTrustScore(address) -> uint256   getTier(address) -> uint8
  getUserProfile(address)
ABIs: contracts/abi/*.json (and index.json as one bundle)
Addresses: contracts/deployments/31337.json — READ THIS FILE, never hardcode addresses.
USDC has 6 decimals. Trust scores are 0-10000. APY/utilization/risk are all in bps.

MINUTE 0-10 — mocked API first, so Person C is never blocked
Create these Next.js route handlers under src/app/api/ returning HARDCODED JSON in the
final shape. Use these real seeded values as the mock data:
  gpt-researcher-v2    tvl 250032e6  util 960bps   apy 415bps    risk 50bps    slashes 0
  claude-summarizer-v1 tvl  40072e6  util 7990bps  apy 1996bps   risk 50bps    slashes 0
  flaky-scraper-v0     tvl  26652e6  util 5250bps  apy 1381bps   risk 551bps   slashes 4
  new-translator-v1    tvl      0    util 10000bps apy 15000bps  risk 300bps   slashes 0
Endpoints:
  GET  /api/vaults            -> VaultInfo[] as JSON (stringify all bigints!)
  GET  /api/agents/[id]       -> one VaultInfo
  GET  /api/premium?agentId=&user=&taskCost=  -> { premium, multiplierBps }
  POST /api/demo/fire         -> triggers Person A's concurrency script, streams/returns results
Then POST the exact JSON shapes to Person C and say "SHAPES PUBLISHED". Do this before
writing any contract code — C's whole hour depends on it.

MINUTE 10-30 — make them real
- `npm i viem`
- Read addresses from contracts/deployments/31337.json, ABIs from contracts/abi/.
- Point at http://127.0.0.1:8545 (Person A will tell you when the chain is up).
- Replace the mocks one endpoint at a time, starting with GET /api/vaults — it's a single
  getAllVaultInfo() call and it powers C's main screen.
- BigInt does not survive JSON.stringify. Convert explicitly or you'll waste 10 minutes on
  a confusing 500.
- Keep the mock data as a fallback behind an env flag. If the chain dies at minute 55, we
  flip to mocks and still demo.

LOGGING — do this as you go, not after. It's our only live debugging surface:
- Log every request: [api] GET /api/vaults -> 200 in 34ms
- Log every chain call: [chain] getAllVaultInfo() -> 4 vaults, block 127
- Log every failure loudly: [api] FAIL GET /api/vaults - <full error> - falling back to mocks
- Never swallow an error into an empty array. A silent empty response looks identical to a
  working-but-empty system and will cost us the demo.

MINUTE 30-45 — wire POST /api/demo/fire to Person A's script; stream or poll, whichever is
faster to finish. Do a full run and paste me the logs.

MINUTE 45 — STOP BUILDING. Rehearse with A and C.

RULES
- Never report an endpoint working without curling it and showing me the output.
- Don't research x402, don't build a dispute flow, don't add auth. Not this hour.
````

---

## Person C — one screen, done properly

````text
60-minute hackathon finish. Work fast. Repo: /home/shaurya/Documents/dev/hackathons/fides
Next.js 16 + React 19 + Tailwind v4 (v4 configures differently from v3 — check
postcss.config.mjs and globals.css before assuming v3 patterns). src/app is still the
default create-next-app scaffold; you're starting from zero.

SCOPE: ONE screen, built well. Not three. An Agent Risk Terminal showing the vaults, their
capital, their risk, and their slash history — plus a panel for the parallelism run if time
survives. Do not read the plan docs, no time.

MINUTE 0-10 — tokens and shell, before any data
Put these EXACT tokens in globals.css as CSS custom properties. They're a validated,
colorblind-safe, contrast-checked set — don't substitute your own, don't add a gradient.
Dark mode is the primary target.
  --surface-page:  #0d0d0d      --surface-card:  #1a1a19
  --ink-primary:   #ffffff      --ink-secondary: #c3c2b7     --ink-muted: #898781
  --border:        rgba(255,255,255,0.10)
  --gridline:      #2c2c2a      --baseline:      #383835
  status:  good #0ca30c   warning #fab219   serious #ec835a   critical #d03b3b
  series:  slot1 #3987e5  slot2 #d95926     slot3 #199e70
  font: system-ui, -apple-system, "Segoe UI", sans-serif  (no display or serif face)

HARD DESIGN RULES — these are what separate this from a vibecoded dashboard:
- No gradients, no glassmorphism, no purple->blue "AI" wash, no decorative drop shadows.
  Separation comes from hairline borders and the card/page surface step, nothing else.
- Status is ALWAYS icon + label, never color alone. A slashed vault says "SLASHED" with a
  mark next to it, not just red text. This survives colorblindness and bad projectors.
- No emoji as icons.
- font-variant-numeric: tabular-nums on table columns and axis ticks ONLY — never on large
  standalone numbers.
- At most two type sizes per region. 4px spacing scale.
- Never a dual-axis chart. If you build any chart at all, two series max, legend present.
- No number on screen that didn't come from the API.

MINUTE 0-10 also — build these four primitives first, then compose everything from them:
  Card, StatTile, StatusBadge, DataTable. Consistency has to come from composition, because
  you won't have time to remember to be consistent.

MINUTE 10-30 — the screen, on mock data
Person B will publish exact JSON shapes early; until then use these real seeded values:
  gpt-researcher-v2     TVL $250,032   util 9.6%    APY 4.15%    risk 0.5%    slashes 0
  claude-summarizer-v1  TVL $40,072    util 79.9%   APY 19.96%   risk 0.5%    slashes 0
  flaky-scraper-v0      TVL $26,652    util 52.5%   APY 13.81%   risk 5.51%   slashes 4
  new-translator-v1     TVL $0         util 100%    APY 150%     risk 3.0%    slashes 0
Buyers: trusted wallet score 9100 (0.2x premium), flagged wallet 3392 (2.35x). On a $100
task against flaky-scraper-v0 they pay $1.10 and $12.95 — that contrast is a great thing to
show on screen.

Layout:
- A row of StatTiles at top: total capital underwritten, agents covered, total slashed,
  tasks insured. These are single values — stat tiles, NOT charts.
- A DataTable of agents: name, TVL, utilization, APY, risk, slashes. Right-align numbers,
  tabular-nums, status badge on any agent with slashes > 0.
- Values in bps arrive as integers: 1996 renders as 19.96%. USDC is 6 decimals.
- Design the empty state and the error state too — a blank panel during a live demo is
  indistinguishable from a hung app.

MINUTE 30-45 — go live
- Swap mocks for B's real endpoints behind a single switch so you can flip back instantly
  if the chain dies.
- Log every call: [api] MODE=live GET /api/vaults -> 200 in 34ms
- On fetch failure: log the full error AND render a visible error state. Never fail silent.
- Add a small dev status strip: API mode, chain, last successful fetch time. It has saved
  every demo I've ever run.
- If time remains: a panel for POST /api/demo/fire showing the independent vs conflicting
  run side by side with the measured numbers. Label our measurements as ours; Monad's
  published figures are 400ms blocks / 800ms finality and must be labeled separately.
  NEVER put "600ms" on screen — it's wrong and a judge may know it.

MINUTE 45 — STOP BUILDING. Open it in a browser, look at it, rehearse with A and B.

RULES
- Never say a screen is done without opening it in a browser and looking at it.
- One screen finished beats three unfinished. Resist scope.
````

---

## T+45: rehearse (all three, together)

- Decide who says what. 60 seconds, three speakers, from `project_plan.md` §6 — but with
  the honest reframing at the top of this file.
- Say the limitations before a judge finds them: admin-triggered validator, mocked registry,
  local node (if local), x402 not integrated this round.
- Have the captured benchmark output on disk as a fallback if the live run fails.
- Lead with the slash — an agent failing and a buyer getting paid out is the whole product.
