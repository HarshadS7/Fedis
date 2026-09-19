# Demo runbook

## What's real vs simulated

| Feature | Status |
| --- | --- |
| Agent vault reads (`/api/vaults`, `/api/premium`) | **Live** off local anvil when chain is up |
| Protected task lifecycle (`/api/tasks/*`) | **Live** — TaskPolicy + BondVault on anvil |
| Validation | **Simulated** — middleware calls `release`/`slash` (no ValidationRouter yet) |
| ERC-8004 registry | **Mocked** on testnet (no bytecode at canonical address) |
| x402 payment leg | **Not integrated** this round |
| Parallelism benchmark | **Measured** on separate bench chain `:8547` (anvil is sequential) |

## One-time setup

```bash
# Terminal 1 — demo chain
anvil

# Terminal 2 — deploy + seed vaults
cd contracts
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
forge script script/Seed.s.sol   --rpc-url http://127.0.0.1:8545 --broadcast

# Terminal 2 — seed demo tasks (slash + release + in-flight)
npm run seed:tasks

# Terminal 3 — app
npm run dev
```

## Demo click-path (60 seconds)

1. **Landing** (`/`) — problem statement, CTA to terminal.
2. **Terminal** (`/terminal`) — stat row + vault table (all numbers from chain).
3. **Premium contrast** — trusted $1.10 vs flagged $12.95 on flaky-scraper-v0.
4. **Task lifecycle** — switch tabs:
   - **Failed (slashed)** — buyer compensated $40 from $50 bond.
   - **Successful (released)** — bond returned to agent.
   - **In-flight** — verify step active.
5. **Parallelism** — Run benchmark stream; label our measurements vs Monad 400ms/800ms spec.

## Pre-demo health check

```bash
npm run dev          # must be running
npm run demo:check   # 6/6 checks should pass
```

## Honest lines to say out loud

- "Slashing is triggered by an authorized validator — not an LLM judging output quality."
- "ValidationRouter is the next contract; today settlement is an authorized middleware call."
- "Local anvil executes sequentially — contention freedom is proven in contract tests, not this graph."
- "Monad published spec: 400ms blocks, 800ms finality — separate from our measured numbers."

## Fallback

- Chain down → app serves fixtures (`mode: mock` in dev strip).
- Benchmark fails → cached `contracts/bench-latest.json` served by `/api/demo/fire`.
