/** Person B REST shapes — see GO.md and AgentVault.VaultInfo */

export type VaultInfo = {
  agentId: string;
  agentName: string;
  escrow: string;
  operator: string;
  registryAgentId: string;
  identityVerified: boolean;
  tvl: string;
  totalShares: string;
  jobVolume: string;
  premiumsEarned: string;
  totalSlashed: string;
  protocolFees: string;
  utilizationBps: string;
  apyBps: string;
  riskBps: string;
  jobCount: string;
  slashCount: string;
};

export type PremiumQuote = {
  premium: string;
  multiplierBps: string;
  agentRiskBps: string;
  trustScore: string;
};

export type FetchPremiumResult = {
  quote: PremiumQuote;
  mode: ApiMode;
  fetchedAt: string;
  durationMs: number;
  error?: string;
};

export type DemoFireWorkload = {
  label: string;
  agentsTouched: number;
  txCount: number;
  reverts: number;
  series: string;
};

export type DemoFireResult = {
  mode: ApiMode;
  simulated?: boolean;
  note?: string;
  n: number;
  workloads?: {
    independent: DemoFireWorkload;
    conflicting: DemoFireWorkload;
  };
  monadPublishedSpec?: { blockTimeMs: number; finalityMs: number };
  ourMeasurements: unknown;
  available?: boolean;
  reason?: string;
  error?: string;
  fetchedAt: string;
  durationMs: number;
};

export type ApiMode = "mock" | "live";

export type FetchVaultsResult = {
  vaults: VaultInfo[];
  mode: ApiMode;
  fetchedAt: string;
  durationMs: number;
  error?: string;
};
