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

**Mock mode returns `"simulated": true` with `"ourMeasurements": null`.** Render it as
illustrative and labelled, never as a measurement. `monadPublishedSpec` is Monad's own
400ms/800ms figures — label those as *published spec*, separate from anything we measured.

Live mode currently returns **503 with a `reason`** rather than fake numbers (see below).

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

## ⚠️ Open blocker for Person A — the benchmark

`AgentVault.bond()` is `onlyAuthorized`, so **N burner wallets cannot call it**. "Fire from
many wallets" and this access control are in direct conflict. Two ways out:

1. Owner calls `setAuthorized(wallet, true)` for each firing wallet first (N setup txs), or
2. Use the permissionless **`deposit()`** path as the isolated workload instead — it's
   per-agent isolated storage, which is exactly the parallelism claim, and needs no
   authorization. Each wallet needs MockUSDC minted to it.

Option 2 is less setup and demonstrates the same isolation property. **A decides**; I'll wire
the live path the moment that's settled and a chain is reachable.
