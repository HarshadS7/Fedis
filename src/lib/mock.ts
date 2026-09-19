/**
 * Single source of truth for fixtures is mockData.ts (it derives real keccak256
 * agentIds, so ids match the seeded chain and don't change on the mock->live swap).
 * Re-exported here so `@/lib/mock` imports keep working.
 */
export { MOCK_VAULTS, MOCK_USERS, agentId, labelFor, mockQuote } from "./mockData";
