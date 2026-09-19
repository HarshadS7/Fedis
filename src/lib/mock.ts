/**
 * Single source of truth for fixtures is mockData.ts (it derives real keccak256
 * agentIds, so ids match the seeded chain and don't change on the mock->live swap).
 * Re-exported here so `@/lib/mock` imports keep working.
 */
export {
  DEMO_FRAUDSTER,
  DEMO_TRUSTED,
  FLAKY_AGENT_ID,
  MOCK_USERS,
  MOCK_VAULTS,
  agentId,
  labelFor,
  mockQuote,
} from "./mockData";
