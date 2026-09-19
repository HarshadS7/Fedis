# TODO

Plan: [`project_plan.md`](./project_plan.md) (live) · [`fedis-build-plan-v2.md`](./fedis-build-plan-v2.md) (build plan)

## Person A — Contracts (bonded execution)
- [ ] `AgentRegistryAdapter.sol`
- [ ] `TaskPolicy.sol`
- [ ] `BondVault.sol`
- [ ] `ValidationRouter.sol`
- [ ] `RiskScore.sol` (optional)
- [ ] Freeze ABIs, export, deploy to Monad testnet

## Person B — Middleware / x402
- [ ] `POST /tasks`, `POST /tasks/:id/bond`, `POST /tasks/:id/submit`, `GET /tasks/:id`
- [ ] `GET /agents/:id/risk`
- [ ] x402 payment integration for task cost
- [ ] `POST /demo/benchmark` — independent vs conflicting workload, measured timings, multi-wallet firing

## Person C — Frontend
- [ ] Agent Risk Terminal
- [ ] Protected Task Lifecycle view
- [ ] Monad Parallelism Kill Shot dashboard (measured, side-by-side)

## Done log
- 2026-09-19: Person A shipped the old insurance-pool contracts (`AgentVault`, `PremiumEngine`, `UserUnderwriting`, `VaultEscrow`) — 60/60 tests, ABIs frozen, deployed+seeded locally. Superseded by the bonded-execution pivot; frozen as a Phase 4 stretch goal, not deleted.
- 2026-09-19: Plan pivoted from `project.md` (insurance pool) to `project_plan.md` (bonded execution) after judging feedback. Wrote `fedis-build-plan-v2.md`, created this file.
