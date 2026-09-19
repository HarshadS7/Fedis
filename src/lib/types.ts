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
};

export type DemoFireResult = {
  status: string;
  message?: string;
};

export type ApiMode = "mock" | "live";

export type FetchVaultsResult = {
  vaults: VaultInfo[];
  mode: ApiMode;
  fetchedAt: string;
  durationMs: number;
  error?: string;
};
