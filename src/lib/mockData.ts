import { keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { VaultInfo } from "./types";

function demoAddress(label: string): `0x${string}` {
  return privateKeyToAccount(keccak256(toBytes(label))).address;
}

/** Seeded buyers from contracts/script/Seed.s.sol */
export const DEMO_TRUSTED = demoAddress("fides.demo.trusted");
export const DEMO_FRAUDSTER = demoAddress("fides.demo.fraudster");

/**
 * The exact values Seed.s.sol puts on a freshly seeded chain (recorded in
 * contracts/README.md). Mock and live responses are the SAME shape, so the
 * frontend cannot tell them apart except via the `mode` field.
 *
 * Kept as strings in on-chain units: USDC is 6dp, and utilization/apy/risk are bps.
 */
const AGENT_NAMES = [
  "gpt-researcher-v2",
  "claude-summarizer-v1",
  "flaky-scraper-v0",
  "new-translator-v1",
] as const;

export const agentId = (name: string) => keccak256(toBytes(name));

export const FLAKY_AGENT_ID = agentId("flaky-scraper-v0");

/**
 * agentId is keccak256(name) on-chain, so the name cannot be recovered from the id.
 * We hash the known demo agents once and look up by hash. This is what lets live
 * responses carry a readable agentName instead of a bare hash.
 */
const NAME_BY_ID = new Map<string, string>(
  AGENT_NAMES.map((n) => [agentId(n).toLowerCase(), n]),
);

export function labelFor(id: string): string {
  return NAME_BY_ID.get(id.toLowerCase()) ?? `${id.slice(0, 10)}…`;
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function vault(
  name: (typeof AGENT_NAMES)[number],
  tvlUsd: number,
  utilizationBps: number,
  apyBps: number,
  riskBps: number,
  jobCount: number,
  slashCount: number,
  totalSlashedUsd: number,
): VaultInfo {
  const usdc = (n: number) => Math.round(n * 1e6).toString();
  return {
    agentId: agentId(name),
    agentName: name,
    escrow: ZERO_ADDR,
    operator: ZERO_ADDR,
    registryAgentId: "0",
    identityVerified: false,
    tvl: usdc(tvlUsd),
    totalShares: usdc(tvlUsd),
    jobVolume: usdc((tvlUsd * utilizationBps) / 10_000),
    premiumsEarned: usdc(tvlUsd * 0.01),
    totalSlashed: usdc(totalSlashedUsd),
    protocolFees: usdc(tvlUsd * 0.001),
    utilizationBps: utilizationBps.toString(),
    apyBps: apyBps.toString(),
    riskBps: riskBps.toString(),
    jobCount: jobCount.toString(),
    slashCount: slashCount.toString(),
  };
}

export const MOCK_VAULTS: VaultInfo[] = [
  vault("gpt-researcher-v2", 250032, 960, 415, 50, 84, 0, 0),
  vault("claude-summarizer-v1", 40072, 7990, 1996, 50, 61, 0, 0),
  vault("flaky-scraper-v0", 26652, 5250, 1381, 551, 39, 4, 2400),
  vault("new-translator-v1", 0, 10000, 15000, 300, 0, 0, 0),
];

/** The two seeded demo buyers, from contracts/script/Seed.s.sol. */
export const MOCK_USERS: Record<string, { trustScore: string; multiplierBps: string }> = {
  trusted: { trustScore: "9100", multiplierBps: "2000" },
  fraudster: { trustScore: "3392", multiplierBps: "23500" },
};

export function mockQuote(
  agentIdHex: string,
  taskCostUsdc: bigint,
  user?: string,
) {
  const v = MOCK_VAULTS.find(
    (x) => x.agentId.toLowerCase() === agentIdHex.toLowerCase(),
  );
  const agentRiskBps = BigInt(v?.riskBps ?? "300");

  let multiplierBps = 2000n;
  let trustScore = MOCK_USERS.trusted.trustScore;
  if (user?.toLowerCase() === DEMO_FRAUDSTER.toLowerCase()) {
    multiplierBps = BigInt(MOCK_USERS.fraudster.multiplierBps);
    trustScore = MOCK_USERS.fraudster.trustScore;
  }

  const premium =
    (taskCostUsdc * agentRiskBps * multiplierBps) / 100_000_000n;
  return {
    premium: premium.toString(),
    multiplierBps: multiplierBps.toString(),
    agentRiskBps: agentRiskBps.toString(),
    trustScore,
  };
}
