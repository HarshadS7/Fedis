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

/** Shape from contracts/script/fire.mjs when live benchmark is wired. */
export type WorkloadMeasurement = {
  txCount: number;
  settled: number;
  reverted: number;
  wallMs: number;
  blocksUsed: number;
  blockRange: string;
  txPerBlock: number;
  p50InclusionMs: number;
  p95InclusionMs: number;
  totalGas: number;
};

export type OurMeasurements = {
  measuredAt: string;
  rpc: string;
  chainId: number;
  walletCount: number;
  note?: string;
  independent: WorkloadMeasurement;
  conflicting: WorkloadMeasurement;
  transactions?: {
    independent: BenchTxPoint[];
    conflicting: BenchTxPoint[];
  };
};

export type BenchStreamState = "idle" | "connecting" | "streaming" | "done" | "error";

export type BenchStreamHandlers = {
  onState?: (state: BenchStreamState) => void;
  onStage?: (label: string) => void;
  onTx?: (tx: BenchTxReceiptRow) => void;
  onDone?: (result: DemoFireResult) => void;
  onError?: (message: string) => void;
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
  ourMeasurements: OurMeasurements | null;
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

export type TaskLifecycleState =
  | "intent"
  | "created"
  | "bonded"
  | "executed"
  | "released"
  | "slashed";

export type TaskStepStatus = "pending" | "active" | "complete";

export type TaskStep = {
  id: string;
  label: string;
  status: TaskStepStatus;
  txHash?: string;
};

export type MoneyMovement = {
  from: string;
  to: string;
  amount: string;
  label: string;
};

export type TaskInfo = {
  taskId: string;
  agentId: string;
  agentName: string;
  buyer: string;
  state: TaskLifecycleState;
  paymentAmount: string;
  requiredBond: string;
  maxCompensation: string;
  steps: TaskStep[];
  movements: MoneyMovement[];
  outcome: "pass" | "fail" | "pending";
};

export type FetchTaskResult = {
  task: TaskInfo;
  mode: ApiMode;
  fetchedAt: string;
  durationMs: number;
  error?: string;
};

export type BenchTxPoint = {
  hash: string;
  submittedAtMs: number;
  includedAtMs: number;
  ok?: boolean;
  block?: number | null;
  latest: boolean;
  safe: boolean;
  finalized: boolean;
};

export type BenchTxReceiptRow = {
  key: string;
  workload: string;
  hash: string;
  inclusionMs: number;
  latest: boolean;
  safe: boolean;
  finalized: boolean;
};

export type BenchWorkloadSeries = {
  label: string;
  series: string;
  points: BenchTxPoint[];
};
