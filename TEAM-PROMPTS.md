# Team Prompts — Fedis (bonded execution pivot)

> ⚠️ **With under an hour left, use [`GO.md`](./GO.md) instead.** This file assumes a
> multi-hour build and its bonded-execution rewrite is not finishable in that time.
> Come back here after the deadline.

Three self-contained prompts, one per person. Copy the whole block for your track into a
fresh Claude Code session opened in the repo root. Each prompt assumes the agent knows
nothing about this project, so it re-reads the plan files itself.

**Before anyone starts:** read [Shared ground rules](#shared-ground-rules) — every prompt
references it, and it contains the Monad facts that can silently sink the demo.

---

## Shared ground rules

These are baked into each prompt below; repeated here so humans can read them once.

### Canonical docs (in priority order)

| File | Status |
| --- | --- |
| [`project_plan.md`](./project_plan.md) | **Source of truth.** The pivoted bonded-execution design. |
| [`fedis-build-plan-v2.md`](./fedis-build-plan-v2.md) | The 3-person build plan for that design. |
| [`TODO.md`](./TODO.md) | Live task board. Tick as you go. |
| [`AGENTS.md`](./AGENTS.md) | Repo bookkeeping rules. Non-negotiable. |
| [`contracts/README.md`](./contracts/README.md) | What Person A already shipped + lessons learned. |
| [`project.md`](./project.md) | **Superseded.** Original insurance-pool design. History only. |
| [`fedis-build-plan.md`](./fedis-build-plan.md) | **Superseded.** Build plan for the old design. |

### Monad skills plugin — there's a bug, here's the workaround

`.claude/settings.json` enables the `monskills` plugin, but it was installed while this
directory was named `fedis` and it's now `fedis`. The registered `projectPath` in
`~/.claude/plugins/installed_plugins.json` points at a directory that no longer exists, so
**the skills do not load in this repo.** Two fixes:

1. Re-install the plugin for this path (run `/plugin` in Claude Code), **or**
2. Read the skill files directly — they're on disk and complete:
   `~/.claude/plugins/cache/monskills/monskills/0.7.2/skills/`

Available skills: `monskill` (router — start here), `scaffold`, `concepts`, `addresses`,
`gas`, `wallet`, `wallet-integration`, `indexer`, `tooling-and-infra`, `why-monad`.

### Monad facts that change what we build

From the `concepts` skill (verify against the reference files before relying on any of it):

- **Block time 400ms, finality 800ms.** The old plan's "600ms block" claim is wrong —
  don't repeat it in code comments, UI copy, or the pitch.
- **Block states:** Proposed → Voted → Finalized → Verified, exposed as the
  `latest` / `safe` / `finalized` block tags. The benchmark should report all three
  separately rather than inventing a single "confirmation" number.
- **Async execution:** consensus and execution are decoupled; there's a ~3-block delayed
  state view, and a newly funded account needs ~1.2s before it can send.
- **Reserve balance:** 10 MON floor per EOA, and low-balance accounts are limited to
  roughly **1 transaction per 1.2s**. ⚠️ This is the one that can quietly kill the
  parallelism demo: firing from 500 thinly-funded wallets means 500 rate-limited wallets.
  Fund them properly, or the "kill shot" shows nothing.
- **Parallel execution** is optimistic concurrency with results identical to Ethereum —
  no contract changes needed to opt in. Our design choice is about *avoiding contention*,
  not about enabling parallelism.

Relevant reference files live under
`~/.claude/plugins/cache/monskills/monskills/0.7.2/skills/concepts/references/`
(`parallel-execution.md`, `block-states.md`, `async-execution.md`, `reserve-balance.md`,
`realtime-data.md`).

### Rules every prompt enforces

- **Verify before building.** Check whether a thing already exists before writing it.
- **Research, don't guess.** x402 and ERC-8004 details must come from the live spec via
  web search, not memory. Say "I don't know, looking it up" rather than inventing an API.
- **Log both paths.** Every step prints on success *and* on failure, with enough context
  to debug at 3am.
- **Check in.** Stop and ask the human at each marked checkpoint instead of making a
  judgment call that affects the other two people.
- **Bookkeep.** Update `TODO.md` when starting (`[~]`) and finishing (`[x]`) anything.

---

## Person A — Smart Contracts

````text
You are working in /home/shaurya/Documents/dev/hackathons/fedis on a Monad hackathon
project called Fedis. You own the SMART CONTRACTS track. Work
through this one step at a time, stopping at each CHECKPOINT to report to me before
continuing.

## Step 0 — Orient yourself (do not write any code yet)

Read these files in this order and tell me in 5 bullets what you understood:
- project_plan.md          <- SOURCE OF TRUTH. The pivoted "bonded execution" design.
- fedis-build-plan-v2.md   <- the 3-person build plan; your track is "Person A".
- contracts/README.md      <- what was already built and the lessons learned.
- AGENTS.md                <- repo bookkeeping rules you must follow.
- TODO.md                  <- the live task board.
Treat project.md and fedis-build-plan.md as SUPERSEDED history. Do not build from them.

Context you need: a previous session already built a complete INSURANCE-POOL protocol
(contracts/src/AgentVault.sol, PremiumEngine.sol, UserUnderwriting.sol, VaultEscrow.sol).
project_plan.md demoted that entire model to "Phase 4, post-hackathon" and replaced the
MVP with BONDED EXECUTION. Decision already made: FREEZE those contracts, do not delete
them, do not extend them. You are building new contracts alongside them.

## Step 1 — Verify what actually exists

Do not trust contracts/README.md's claims. Verify each one and report a table of
claim vs. reality:
- Is foundry installed? (`forge --version`) If not, install it and tell me.
- Do the 60 tests actually pass? (`cd contracts && forge test`)
- Do contracts/abi/*.json and contracts/deployments/31337.json match the current source?
- Does `anvil` + the Deploy/Seed scripts in contracts/script/ still run clean end to end?
Report anything broken BEFORE you build on top of it.

## Step 2 — Load the Monad knowledge you're missing

The repo has a `monskills` plugin enabled but it does NOT load — it was installed when
this directory was named `fedis` (capital F) and the directory is now `fedis`, so the
registered projectPath is dead. Either re-install it via /plugin, or just read the skill
files directly from:
  ~/.claude/plugins/cache/monskills/monskills/0.7.2/skills/
Start with monskill/SKILL.md (it's a router), then read at minimum:
  - concepts/references/parallel-execution.md
  - concepts/references/block-states.md
  - concepts/references/reserve-balance.md
  - addresses/  (for writing contracts on Monad)
Tell me anything in those files that contradicts what's written in project_plan.md or
fedis-build-plan-v2.md. I would rather find out now than during the demo.

If a skill does not cover something you need (ERC-8004 details, x402 payment flow,
current Monad testnet chain id / RPC / faucet), SEARCH THE WEB and cite the URL. Do not
answer from memory — your training data is likely stale on all three. If you find a
better skill or plugin for the job, tell me and I'll approve installing it.

CHECKPOINT 1 — report Steps 0-2 findings. Wait for my go-ahead.

## Step 3 — Build the bonded-execution contracts, ONE AT A TIME

Order matters. After each contract: write its tests, run `forge test`, show me the
output, tick TODO.md, then move on. Do not write all four then test at the end.

  1. contracts/src/TaskPolicy.sol
     - mapping(bytes32 taskId => Policy), isolated per task. Reuse the storage
       partitioning discipline from AgentVault.sol — read it first, it's good.
     - Fields per project_plan.md section 2B: taskId, agentId, paymentAmount,
       requiredBond, maxCompensation, deadline, validationMethod, validationDataHash,
       state (Created -> Bonded -> Executed -> Settled).
     - Must reject invalid transitions and double settlement. Test those explicitly.

  2. contracts/src/BondVault.sol
     - Locks agent collateral for a task's lifetime.
     - release(taskId) on verified success; slash(taskId) on verified failure, paying
       compensation (capped at maxCompensation) to the buyer.
     - This is a BOND, not a pooled vault — it does not need LP shares. Prefer the
       simplest thing that is safe. Reuse VaultEscrow.sol's clone pattern only if you
       can justify it; otherwise a plain per-task accounting mapping is fine.

  3. contracts/src/ValidationRouter.sol
     - ONE or TWO deterministic mechanisms only. Suggested: (a) oracle value within
       tolerance, (b) signed validator attestation verified with ecrecover.
     - Emits canonical ValidationPassed(taskId) / ValidationFailed(taskId).
     - Explicitly NO LLM-as-judge and no subjective quality scoring. project_plan.md
       section 2B is emphatic about this and it is the thing judges attacked last time.

  4. contracts/src/AgentRegistryAdapter.sol
     - Thin wrapper over ERC-8004 identity. Reuse the IIdentityRegistry interface and
       MockIdentityRegistry already in contracts/src/. Note from the last session: the
       canonical registry 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 exists on Monad
       MAINNET but has zero bytecode on testnet. VERIFY that's still true with an
       on-chain call before repeating it to anyone.

  5. contracts/src/RiskScore.sol  — OPTIONAL, only if everything above is done and
     tested. Plain counters (successes, failures, disputes). Every threshold must be a
     named constant with a comment explaining the choice. Do NOT reproduce the
     unexplained magic numbers (8000 / 2000 / 80%) from UserUnderwriting.sol — those are
     exactly what got criticised.

Logging/debuggability requirements for this track:
- Emit an event on EVERY state transition and every failure branch, with indexed taskId.
  The middleware and the frontend have no other way to see what happened.
- Use custom errors with arguments (not bare require strings) so failures are legible in
  a trace — follow the existing style in AgentVault.sol.
- In your Foundry scripts, console2.log every step: what you're deploying, the address
  you got back, what you're seeding, and a clear FAIL line if a step reverts.

## Step 4 — Freeze and publish the interface

The moment the function signatures are settled (before the internal logic is final):
- Run `node contracts/export-abi.mjs` and commit the ABIs.
- Post the exact function signatures to the team — Person B codes against these.
- Tell me explicitly: "ABI FROZEN". After that, signature changes need my sign-off
  because they break B and C.

CHECKPOINT 2 — ABI frozen, all tests green. Report before deploying anywhere.

## Step 5 — Deploy and connect

- Extend contracts/script/Deploy.s.sol and Seed.s.sol to cover the new contracts, with
  console2.log output for every deployment and seed action.
- Deploy to a local anvil node first; verify with cast calls that a full lifecycle works:
  create task -> bond -> submit -> validate -> release AND the failure path -> slash.
- Write deployment addresses to contracts/deployments/<chainId>.json in the same shape
  as the existing file, so Person B just reads the JSON.
- Then deploy to Monad testnet. Confirm the current testnet RPC and chain id by
  searching the web / the addresses skill — do not assume the values in foundry.toml are
  still current. You'll need a funded key; ask me for it rather than guessing.

CHECKPOINT 3 — deployed, addresses published, lifecycle verified on-chain both paths.

## Step 6 — Support the benchmark

Person B fires the parallelism benchmark. Your job: make sure the contract side does not
serialize. Before B runs it, review their script with them for shared-state contention
(one relayer wallet paying every tx will serialize on that account's balance regardless
of how isolated your task state is — this is documented in contracts/README.md).
Also warn them about the 10 MON reserve-balance floor and the ~1 tx/1.2s limit for
low-balance accounts on Monad; thinly-funded burner wallets will rate-limit the demo.

## Working rules

- One step at a time. Stop at CHECKPOINTs and wait for me.
- Never claim something works that you have not run. Show me the command output.
- If you're unsure about a web3 detail, look it up and cite the source. If you're still
  unsure, ask me. Do not invent an API surface.
- Update TODO.md: mark [~] when you start a task, [x] when it's done and tested, and add
  a dated line to the Done log for anything significant. This is required by AGENTS.md.
- If the architecture changes, update project_plan.md in the same change, per AGENTS.md.
````

---

## Person B — Middleware & x402 Integration

````text
You are working in /home/shaurya/Documents/dev/hackathons/fedis on a Monad hackathon
project called Fedis. You own the MIDDLEWARE / x402 track. Work
through this one step at a time, stopping at each CHECKPOINT to report to me.

## Step 0 — Orient yourself (do not write any code yet)

Read, in order, and summarise back in 5 bullets:
- project_plan.md          <- SOURCE OF TRUTH. Pivoted "bonded execution" design.
                              Section 5 Phase 2 is your flow, step by step.
- fedis-build-plan-v2.md   <- your track is "Person B".
- contracts/README.md      <- especially "Read this before you write the demo script",
                              which is addressed to you and contains real findings.
- AGENTS.md, TODO.md       <- rules and task board.
project.md and fedis-build-plan.md are SUPERSEDED. Do not build from them.

Context: the app is a Next.js 16 project (see package.json) whose src/app is still the
untouched create-next-app scaffold. There is no API layer, no middleware, no x402 code
yet — you are starting from zero. Person A is building new contracts (TaskPolicy,
BondVault, ValidationRouter); an older insurance-pool contract set already exists and is
FROZEN — ignore it unless I tell you otherwise.

## Step 1 — Verify what exists before you assume anything

Report a short table of what's actually present:
- `ls src/app` and confirm whether any API routes exist.
- Check package.json — what's installed? (Expect: next, react, tailwind, typescript.
  Expect NOT: viem/ethers/wagmi, any x402 package, any server framework.)
- Does contracts/abi/ have ABIs, and does contracts/deployments/31337.json have
  addresses? Are they for the OLD contracts or the new ones?
- Is there a local node running, or does one need to be started?
Tell me what's missing before you install anything.

## Step 2 — Learn what you don't know (this is most of the risk on your track)

Two things you almost certainly have stale or missing knowledge about. Research both
with web search and cite your sources — do NOT write code from memory:

  a) x402 — the machine-native payment protocol. Find the CURRENT spec: what the
     payment flow actually looks like on the wire, what the 402 response envelope
     contains, what libraries exist, and whether any of them support Monad. Report what
     you find, including whether a real integration is feasible in our time budget or
     whether we should implement a faithful subset and say so honestly in the pitch.
     project_plan.md is explicit that x402 moves value and Fedis adds enforcement —
     be precise about that boundary.

  b) ERC-8004 — agent identity. What the registry interface is, what's deployed where.
     Person A has notes on this in contracts/README.md; verify rather than trust.

For Monad-specific questions, this repo has a `monskills` plugin that does NOT currently
load (it was installed under the old directory name `fedis`, now `fedis`, so its
registered path is dead). Either re-install via /plugin, or read the files directly:
  ~/.claude/plugins/cache/monskills/monskills/0.7.2/skills/
Start with monskill/SKILL.md (router). For your track, these matter most:
  - concepts/references/block-states.md      (latest / safe / finalized — what to measure)
  - concepts/references/async-execution.md   (~3-block delayed state view; a newly funded
                                              account needs ~1.2s before it can send)
  - concepts/references/reserve-balance.md   (10 MON floor per EOA; low-balance accounts
                                              limited to ~1 tx per 1.2s)
  - concepts/references/realtime-data.md     (WebSocket options for live feeds)
  - tooling-and-infra/  (check provider support before picking an RPC or indexer)
Read those BEFORE you design the benchmark — the reserve-balance limit in particular can
silently destroy it.

If a needed skill doesn't exist, search the web and tell me what you found. If you think
we should install another plugin/skill, ask me first.

CHECKPOINT 1 — report Steps 0-2. Wait for go-ahead before writing code.

## Step 3 — Stand up the API skeleton with MOCKED data first

Person C is blocked on your endpoint shapes, not your real logic. Ship shapes first.

Build Next.js route handlers under src/app/api/ implementing exactly the contract in
fedis-build-plan-v2.md ("REST API for C"):
  POST /api/tasks              -> create task policy    -> { taskId, state }
  POST /api/tasks/:id/bond     -> agent locks collateral -> { state, bondedAmount }
  POST /api/tasks/:id/submit   -> result + evidence     -> { state }
  GET  /api/tasks/:id          -> full policy + state
  GET  /api/agents/:id/risk    -> success/fail counts, active exposure
  POST /api/demo/benchmark     -> fires the parallelism run, streams measurements

Return hardcoded, realistically-shaped JSON at this stage. Then IMMEDIATELY post the
exact response shapes to Person C and tell me "API SHAPES PUBLISHED". Changing them
later costs C real work, so think before publishing.

Logging requirements — non-negotiable, this is our debugging surface during the demo:
- Every handler logs on entry (method, path, params) and on exit (status, duration ms).
- Every contract call logs: function name, args, resulting tx hash, gas used, and block
  number. On revert, log the decoded custom error and the full args that caused it.
- Use a clear consistent prefix so logs are greppable, e.g. [api], [chain], [bench].
- Distinguish levels: success lines and failure lines must be visually distinct
  (e.g. OK / WARN / FAIL prefixes). We will be reading these on a projector.
- Never swallow an error. Catch, log with full context, rethrow or return a 4xx/5xx with
  a machine-readable error code.

CHECKPOINT 2 — mocked API live, shapes published to C.

## Step 4 — Wire the real contracts, one endpoint at a time

Use viem (confirm it supports Monad first — check the tooling-and-infra skill). Read
addresses from contracts/deployments/<chainId>.json and ABIs from contracts/abi/ — never
hardcode either.

Go one endpoint at a time, and after each one prove it works end to end against a local
anvil node with Person A's contracts deployed. Show me the log output for both the
success path and a deliberately-failed path. Order:
  1. POST /api/tasks        (create policy)
  2. POST /api/tasks/:id/bond
  3. POST /api/tasks/:id/submit  + ValidationRouter call
  4. Settlement: release on pass, slash on fail — verify the buyer actually got paid
  5. GET endpoints (task state, agent risk)

Then the x402 payment leg, per whatever you found in Step 2. If a faithful full
integration isn't achievable, implement the honest subset and write down precisely what
is real and what is simulated — we will say so out loud to judges rather than get caught.

CHECKPOINT 3 — full lifecycle working on-chain, both pass and fail paths.

## Step 5 — The parallelism benchmark (this is the demo moment; treat it seriously)

project_plan.md section 3 is explicit: the benchmark must MEASURE what happened.
`Promise.all()` is client-side concurrency and is not by itself evidence of anything.

Build POST /api/demo/benchmark to run TWO workloads and report them side by side:
  A) INDEPENDENT: N tasks against N distinct task policies — no shared state.
  B) CONFLICTING: N transactions deliberately hitting the same task/account state.

Measure and report, per workload: submission time, inclusion (block number + time),
confirmation and finality observations using the correct Monad block tags
(latest / safe / finalized — see block-states.md), success/revert counts, and gas.
Report observed numbers only. Do NOT hardcode or assert "600ms" — that figure came from
the old plan and is wrong anyway; Monad's documented figures are 400ms blocks and 800ms
finality. Keep our measurements and Monad's published specs clearly separated in the
output, and label them as such.

Critical mechanics to get right, or the demo shows nothing:
- Fire from MANY wallets, not one relayer. A single EOA serializes every transaction on
  its own nonce and balance regardless of how well the contract state is partitioned.
- Fund those wallets properly. Monad has a 10 MON reserve-balance floor per EOA, and
  low-balance accounts are limited to about 1 transaction per 1.2s. 500 thinly-funded
  burners = 500 rate-limited wallets = a flat, embarrassing graph.
- After funding a fresh account, wait — async execution means a newly funded account
  needs roughly 1.2s before it can send.
- Log every single one of these steps with [bench] prefixes and per-wallet status, so
  when it misbehaves live we can see exactly which stage failed.

Stream progress to the frontend (WebSocket or SSE — pick one, tell C which) so Dashboard
3 shows it live rather than polling.

CHECKPOINT 4 — benchmark producing real, defensible numbers. Show me a full run's logs.

## Working rules

- One step at a time; stop at CHECKPOINTs.
- Never report something as working that you haven't run. Paste the output.
- Research x402 / ERC-8004 / Monad specifics from live sources and cite them. Your
  training data is stale on all three. If still unsure, ask me — don't invent an API.
- Update TODO.md ([~] on start, [x] on done + Done log entry), per AGENTS.md.
````

---

## Person C — Frontend & Visualizer

````text
You are working in /home/shaurya/Documents/dev/hackathons/fedis on a Monad hackathon
project called Fedis. You own the FRONTEND track. Work through this
one step at a time, stopping at each CHECKPOINT to report to me.

## Step 0 — Orient yourself (no code yet)

Read and summarise back in 5 bullets:
- project_plan.md          <- SOURCE OF TRUTH. Section 5 Phase 3 describes your three
                              dashboards, including an ASCII lifecycle diagram you should
                              render literally.
- fedis-build-plan-v2.md   <- your track is "Person C".
- AGENTS.md, TODO.md       <- rules and task board.
project.md and fedis-build-plan.md are SUPERSEDED. Ignore their dashboard descriptions —
in particular the old "LP Terminal" is NOT what we're building any more.

Context: the product is an economic enforcement layer for AI agents. An agent locks a
bond against a machine-checkable success condition before doing a paid task; if it fails
the check, the bond is slashed and the buyer is compensated. Your job is to make that
legible in about 20 seconds to a judge who has seen thirty other projects today.

## Step 1 — Verify what exists

- `ls src/app` — confirm it's still the default create-next-app scaffold (it was:
  page.tsx, layout.tsx, globals.css, favicon).
- Check package.json for what's actually installed: Next 16, React 19, Tailwind v4,
  TypeScript. Note that Tailwind v4 configures differently from v3 — check
  postcss.config.mjs and globals.css before assuming v3 patterns.
- Does `npm run dev` start cleanly? Report any errors before building on top.
- Has Person B created anything under src/app/api yet? If yes, read the response shapes.

## Step 2 — Confirm the data contract with Person B

Your three dashboards consume Person B's API. The planned endpoints are in
fedis-build-plan-v2.md. Before building, get B's ACTUAL published response shapes and
write them into a single typed file (e.g. src/lib/types.ts) as the shared contract. If
B hasn't published yet, build against your own mock matching the planned shapes and flag
clearly to me that they're provisional.

Create a mock layer (e.g. src/lib/api.ts) with a single switch between mocked and live
data, so swapping to B's real API is a one-line change, not a rewrite. Log which mode
you're in on every call: [api] MODE=mock GET /api/tasks/123 -> 200 in 4ms.

## Step 3 — Get the Monad facts right before they end up in UI copy

This repo has a `monskills` plugin that currently does NOT load (installed under the old
directory name `fedis`; the directory is now `fedis`, so its registered path is dead).
Re-install via /plugin, or read the files directly at:
  ~/.claude/plugins/cache/monskills/monskills/0.7.2/skills/
Read monskill/SKILL.md (router) then concepts/references/block-states.md.

Facts your UI must not get wrong:
- Monad is 400ms block time, 800ms finality. The old plan said "600ms" — it's wrong,
  don't put it on screen.
- Block states are Proposed -> Voted -> Finalized -> Verified, surfaced as the
  latest / safe / finalized tags. If you show a "confirmed" badge, be precise about
  which of these it means.
- Anything you display as a measurement must come from Person B's benchmark output.
  Never hardcode an impressive-looking number into the UI. If it's Monad's published
  spec rather than our measurement, label it as such on screen. Judges will ask.

If you need frontend/wallet guidance (connecting a wallet, showing an address), check
the wallet-integration skill in the same directory before reaching for a library, and
web-search anything the skills don't cover. Cite sources; don't guess at APIs.

CHECKPOINT 1 — report Steps 0-3. Wait for go-ahead.

## Step 4 — Lock the design system BEFORE building screens

TODO.md sections 3.1 and 3.2 contain a locked token set (surfaces, ink, hairlines,
status colors, series colors, type rules, spacing) and a list of anti-vibecode rules.
These are not suggestions and they are not mine to re-litigate on taste — the palette
is a validated one (colorblind-safe, contrast-checked against both surfaces) and the
rules are the standard catalogue of what goes wrong in dashboards. Implement the tokens
as CSS custom properties in globals.css, dark-first with both modes declared, then build
the small primitives set (Card, StatTile, StatusBadge, DataTable, AddressChip) that
every screen composes from. Do this before any screen work, or you will end up
retrofitting.

Two rules worth restating because they're the ones people break:
- Status is icon + label, never color alone. Our PASS/RELEASE vs FAIL/SLASH states are
  the most important thing on screen and must survive colorblindness and a bad projector.
- Never a dual-axis chart. Two measures of different scale = two charts.

## Step 5 — Build the dashboards, ONE AT A TIME, mock data first

Build each one to "demo-ready with mocks" before starting the next. After each, run
`npm run dev`, open it in a browser, and show me a screenshot or a precise description
of what renders. Do not report a dashboard as done without having looked at it.
The per-screen checklists are in TODO.md sections 3.4 through 3.6 — work from those.

  1. AGENT RISK TERMINAL
     Per project_plan.md Phase 3 Dashboard 1: agent ID, bond available, successful /
     failed task counts, current active exposure, required collateral, recent validation
     events. This is the "is this agent good for it?" screen.

  2. PROTECTED TASK LIFECYCLE
     Render the exact flow from project_plan.md as a live state machine for one real
     task:
       INTENT -> TASK POLICY CREATED -> AGENT BONDS COLLATERAL -> EXECUTE -> VERIFY
       -> PASS: RELEASE -> PAY AGENT   |   FAIL: SLASH -> COMPENSATE USER
     Highlight the current state, show both branches, and make the money movement
     visible (who paid what to whom, with amounts). This is the screen that explains the
     whole product — it matters more than visual polish elsewhere.

  3. MONAD PARALLELISM DASHBOARD
     Two workloads side by side, from B's POST /api/demo/benchmark: INDEPENDENT (many
     unrelated task policies) vs CONFLICTING (many transactions on the same state).
     Show measured inclusion / confirmation / finality times, transaction counts, and
     settlement successes. Label clearly which numbers are OUR MEASUREMENTS and which
     (if any) are Monad's published specs. The honest framing is the point: our design
     partitions state so the workload is naturally parallelizable — we're showing that
     difference, not claiming we made the chain fast.
     Coordinate with B on whether progress arrives via WebSocket or SSE.

Logging requirements:
- Log every API call: endpoint, mode (mock/live), status, duration. Prefix [api].
- Log every stream event received from the benchmark. Prefix [bench].
- On any fetch failure, log the full error AND render a visible error state in the UI —
  never a silent blank panel. During a live demo, a blank panel is indistinguishable
  from a hung demo, and we need to know instantly which it is.
- Add a small dev-only status strip showing: API mode, connected chain, last successful
  fetch time. It has saved every demo I've ever run.

CHECKPOINT 2 — all three dashboards working on mocks. Show me.

## Step 6 — Connect to the real API and rehearse

- Flip the mock switch to live against B's API; fix shape mismatches WITH B rather than
  papering over them client-side.
- Walk the full journey end to end with real contracts behind it: create a task, bond,
  execute, validate, settle — for BOTH the pass and the fail path. The slash path is the
  one judges care about; make sure it's not the untested one.
- Then run the benchmark dashboard against a real run.
- Rehearse the actual demo click-path and time it. Note anything slow or fragile and
  tell me — we can pre-warm or cache it rather than discovering it on stage.

CHECKPOINT 3 — live end to end, both paths, demo path rehearsed.

## Working rules

- One step at a time; stop at CHECKPOINTs.
- Never claim a UI works without opening it in a browser and looking at it.
- Don't invent data. If a number isn't in B's API response, it doesn't go on screen.
- Research anything you're unsure about (Tailwind v4, Next 16 app router specifics,
  wallet libs) and cite sources rather than guessing at an API.
- Update TODO.md ([~] on start, [x] on done + Done log entry), per AGENTS.md.
````

---

## Sync points for the three of you

| When | What has to be true |
| --- | --- |
| Sync 1 | A has published frozen contract signatures; B has published API response shapes; C has typed both into `src/lib/types.ts`. Nobody proceeds on guessed interfaces. |
| Sync 2 | A deployed to a local node and published addresses JSON; B's endpoints hit real contracts; C is still on mocks but shapes match. |
| Sync 3 | Full lifecycle green end to end — **both** the pass path and the slash path — on a real chain, visible in C's lifecycle dashboard. |
| Sync 4 | Benchmark produces defensible measured numbers; demo click-path rehearsed and timed. |

The failure mode to avoid: three people each 90% done against three slightly different
interface assumptions. Lock interfaces at Sync 1 and treat changes after that as
everyone's problem, not one person's.
