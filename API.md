# API shapes — SHAPES PUBLISHED (Person B → Person C)

Base: `http://localhost:3000`. Run with `npm run dev`. **These are live and curl-verified.**

Every response carries `"mode": "mock" | "live"`. Mock and live have **identical shapes** —
the only difference is where the numbers came from. No chain is needed to build against this.

All integers are **decimal strings** (uint256 doesn't survive JSON). USDC is 6dp,
`utilizationBps` / `apyBps` / `riskBps` are basis points (1996 → 19.96%).

`agentId` is `keccak256(agentName)`, not a readable string. Map hash → name client-side:

```ts
import { keccak256, toBytes } from "viem";
const id = keccak256(toBytes("flaky-scraper-v0"));
// 0xd451dae1e7f9a21617d3048db373d9386a94b54d40993ee2044bada8fdaf1760
```

Known agents: `gpt-researcher-v2`, `claude-summarizer-v1`, `flaky-scraper-v0`, `new-translator-v1`.

---

### `GET /api/vaults`

```json
{
  "mode": "mock",
  "vaults": [
    {
      "agentId": "0x9ee76b36…",
      "escrow": "0x0000…0000",
      "operator": "0x0000…0000",
      "registryAgentId": "0",
      "identityVerified": false,
      "tvl": "250032000000",
      "totalShares": "250032000000",
      "jobVolume": "24003072000",
      "premiumsEarned": "2500320000",
      "totalSlashed": "0",
      "protocolFees": "250032000",
      "utilizationBps": "960",
      "apyBps": "415",
      "riskBps": "50",
      "jobCount": "84",
      "slashCount": "0"
    }
  ]
}
```

On a live-read failure it returns mock data plus `"degraded": true` and `"error": "…"` —
**render a visible warning when `degraded` is true.** It never returns an empty array to
hide a failure.

### `GET /api/agents/[id]`

`id` must be a bytes32. Returns `{ mode, vault: { …same fields as above… } }`.
`400` if not a bytes32, `404` if unknown.

### `GET /api/premium?agentId=&user=&taskCost=`

`taskCost` in USDC base units (`100000000` = $100). `user` optional, defaults to zero address.

```json
{ "mode":"mock", "premium":"1102000", "multiplierBps":"2000", "agentRiskBps":"551", "trustScore":"9100" }
```

`premium: "1102000"` = **$1.10** on a $100 task vs `flaky-scraper-v0` for the trusted buyer —
matches the seeded chain. The fraudster's 2.35x multiplier is the contrast worth showing.

### `POST /api/demo/fire`  body `{ "n": 50 }`

Serves the **measured** output of `contracts/script/fire.mjs` when
`contracts/bench-latest.json` exists: `{ simulated: false, ourMeasurements: {...} }`.
With no measured run it falls back to `{ simulated: true, ourMeasurements: null }` —
render that as illustrative, never as a measurement.

⚠️ Read `caveat` in the response and put it on screen. A local anvil executes
**sequentially**, so INDEPENDENT and CONFLICTING are *expected* to match; the gap is a
Monad property and is **not** demonstrated by a local run. Contention-freedom is proven
separately and deterministically by the storage-access tests in `Integration.t.sol`.

`monadPublishedSpec` is Monad's own 400ms/800ms figures — label as *published spec*,
kept separate from our measurements.

---

## Bonded execution — `/api/tasks/*` (live chain only, 503 without one)

The full lifecycle, verified end to end on-chain:

| Endpoint | Method | Does |
|---|---|---|
| `/api/tasks` | POST | `TaskPolicy.createTask` → state `Created` |
| `/api/tasks/[id]/bond` | POST | mints+approves as needed, `BondVault.lockBond` → `Bonded` |
| `/api/tasks/[id]/submit` | POST | `markExecuted` then release **or** slash → `Released`/`Slashed` |
| `/api/tasks/[id]` | GET | full policy + bond + lifecycle state |

Create body: `{ agentName | agentId, buyer, requiredBond?, maxCompensation?, paymentAmount?, deadlineSeconds?, validationMethod? }`
Submit body: `{ result?, passed: boolean }`.

Every write returns `tx: { hash, gasUsed, blockNumber }` — real hashes for the UI to link.
State transitions are guarded: bonding a non-`Created` task or submitting a non-`Bonded`
task returns **409** with the actual state.

**Verified on a local chain:**
- Pass path: `Created → Bonded → Executed → Released`
- Slash path: buyer received exactly **$40** on a $50 bond with `maxCompensation` $40 —
  cap enforced, $10 refunded to the bonder

⚠️ **Honest boundary for the pitch:** `passed` is supplied by the caller. `ValidationRouter`
is not built, so validation is currently an authorized call, **not** an on-chain
deterministic predicate. The response says so in its `validation.method` field. Say this
out loud before a judge asks.

---

## Config

| Env | Default | Effect |
|---|---|---|
| `FIDES_API_MODE` | unset | `mock` forces fixtures even if a chain is up |
| `FIDES_RPC_URL` | `http://127.0.0.1:8545` | node to read from |
| `FIDES_CHAIN_ID` | `31337` | picks `contracts/deployments/<id>.json` |

Mode is automatic: live only if addresses exist **and** the node answers (re-probed every
5s, so a chain coming up mid-demo is picked up without a restart). Addresses and ABIs are
read off disk from `contracts/` — never hardcoded.

## ✅ Resolved — the benchmark authorization blocker

`AgentVault.bond()` is `onlyAuthorized`, so N burner wallets couldn't call it. Person A
solved it in `fire.mjs` with **`setAuthorizedBatch`** — all firing wallets authorized in one
transaction, then `bond()` fired from each. No longer blocking.

## ⚠️ Live gotcha — two anvils, one chainId

The demo chain (`:8545`) and the bench chain (`:8547`) are **both chainId 31337**, so both
write `contracts/deployments/31337.json`. Addresses currently match because anvil is
deterministic and both deploy in the same order — but if the two ever diverge, the UI will
read the wrong addresses with no error. Deploy the bench chain *before* the demo chain, or
give it a distinct `--chain-id`.
