import fs from "node:fs";
import path from "node:path";
import type {
  ApiMode,
  BenchTxPoint,
  DemoFireResult,
  OurMeasurements,
  WorkloadMeasurement,
} from "./types";

function benchOutPath(): string {
  return path.join(process.cwd(), "contracts", "bench-latest.json");
}

export type BenchFile = {
  measuredAt: string;
  rpc: string;
  chainId: number;
  walletCount: number;
  note?: string;
  independent: WorkloadMeasurement & { transactions?: BenchTxPoint[] };
  conflicting: WorkloadMeasurement & { transactions?: BenchTxPoint[] };
  transactions?: {
    independent: BenchTxPoint[];
    conflicting: BenchTxPoint[];
  };
};

function toMeasurement(
  row: BenchFile["independent"],
): WorkloadMeasurement {
  return {
    txCount: row.txCount,
    settled: row.settled,
    reverted: row.reverted,
    wallMs: row.wallMs,
    blocksUsed: row.blocksUsed,
    blockRange: row.blockRange,
    txPerBlock: row.txPerBlock,
    p50InclusionMs: row.p50InclusionMs,
    p95InclusionMs: row.p95InclusionMs,
    totalGas: row.totalGas,
  };
}

export function readBenchFile(): BenchFile | null {
  try {
    return JSON.parse(fs.readFileSync(benchOutPath(), "utf8")) as BenchFile;
  } catch {
    return null;
  }
}

function normalizeTx(
  raw: {
    hash: string;
    submittedAt?: number;
    submittedAtMs?: number;
    includedAt?: number;
    includedAtMs?: number;
    latest: boolean;
    safe: boolean;
    finalized: boolean;
    ok?: boolean;
    block?: number | null;
  },
): BenchTxPoint {
  return {
    hash: raw.hash,
    submittedAtMs: raw.submittedAtMs ?? raw.submittedAt ?? 0,
    includedAtMs: raw.includedAtMs ?? raw.includedAt ?? 0,
    latest: raw.latest,
    safe: raw.safe,
    finalized: raw.finalized,
    ok: raw.ok,
    block: raw.block,
  };
}

export function demoFireFromBench(file: BenchFile, mode: ApiMode): DemoFireResult {
  const rawTx = file.transactions ?? {
    independent: file.independent.transactions ?? [],
    conflicting: file.conflicting.transactions ?? [],
  };

  const ourMeasurements: OurMeasurements = {
    measuredAt: file.measuredAt,
    rpc: file.rpc,
    chainId: file.chainId,
    walletCount: file.walletCount,
    note: file.note,
    independent: toMeasurement(file.independent),
    conflicting: toMeasurement(file.conflicting),
    transactions: {
      independent: rawTx.independent.map(normalizeTx),
      conflicting: rawTx.conflicting.map(normalizeTx),
    },
  };

  return {
    mode,
    simulated: false,
    n: file.walletCount,
    ourMeasurements,
    monadPublishedSpec: { blockTimeMs: 400, finalityMs: 800 },
    fetchedAt: new Date().toISOString(),
    durationMs: 0,
  };
}

export type BenchStreamEvent =
  | { type: "connected"; mode: ApiMode }
  | { type: "stage"; label: string }
  | {
      type: "tx";
      workload: string;
      hash: string;
      latest: boolean;
      safe: boolean;
      finalized: boolean;
    }
  | { type: "done"; result: DemoFireResult }
  | { type: "error"; message: string };

export function benchRpcUrl(): string {
  return process.env.fedis_BENCH_RPC ?? "http://127.0.0.1:8547";
}

export async function benchNodeReachable(): Promise<boolean> {
  try {
    const res = await fetch(benchRpcUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function mockStreamEvents(
  n: number,
  onEvent: (event: BenchStreamEvent) => void,
): Promise<DemoFireResult> {
  onEvent({ type: "stage", label: "Simulated independent workload" });

  const workloads = ["independent", "conflicting"] as const;
  const txPoints: OurMeasurements["transactions"] = {
    independent: [],
    conflicting: [],
  };

  for (const workload of workloads) {
    for (let i = 0; i < Math.min(n, 20); i++) {
      await new Promise((r) => setTimeout(r, 30));
      const submittedAt = Date.now();
      const includedAt = submittedAt + 40 + i * 3;
      const point: BenchTxPoint = {
        hash: `0xsim${workload === "independent" ? "01" : "02"}${String(i).padStart(58, "0")}`,
        submittedAtMs: submittedAt,
        includedAtMs: includedAt,
        latest: true,
        safe: i % 3 !== 0,
        finalized: i % 5 === 0,
      };
      txPoints[workload].push(point);
      onEvent({
        type: "tx",
        workload,
        hash: point.hash,
        latest: point.latest,
        safe: point.safe,
        finalized: point.finalized,
      });
    }
  }

  const result: DemoFireResult = {
    mode: "mock",
    simulated: true,
    note: "ILLUSTRATIVE STREAM — simulated tx hashes, not from chain.",
    n,
    workloads: {
      independent: {
        label: "Independent (N agents, isolated storage)",
        agentsTouched: 4,
        txCount: n,
        reverts: 0,
        series: "series-1",
      },
      conflicting: {
        label: "Conflicting (N txs, same agent)",
        agentsTouched: 1,
        txCount: n,
        reverts: 0,
        series: "series-2",
      },
    },
    monadPublishedSpec: { blockTimeMs: 400, finalityMs: 800 },
    ourMeasurements: {
      measuredAt: new Date().toISOString(),
      rpc: "simulated",
      chainId: 0,
      walletCount: n,
      note: "Simulated stream for UI wiring. Run fire.mjs on :8547 for measured hashes.",
      independent: {
        txCount: n,
        settled: n,
        reverted: 0,
        wallMs: n * 40,
        blocksUsed: Math.ceil(n / 10),
        blockRange: "sim",
        txPerBlock: 10,
        p50InclusionMs: 45,
        p95InclusionMs: 120,
        totalGas: n * 21000,
      },
      conflicting: {
        txCount: n,
        settled: n,
        reverted: 0,
        wallMs: n * 55,
        blocksUsed: Math.ceil(n / 8),
        blockRange: "sim",
        txPerBlock: 8,
        p50InclusionMs: 60,
        p95InclusionMs: 150,
        totalGas: n * 21000,
      },
      transactions: txPoints,
    },
    fetchedAt: new Date().toISOString(),
    durationMs: 0,
  };

  onEvent({ type: "done", result });
  return result;
}
