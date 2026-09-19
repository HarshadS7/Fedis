"use client";

import { useCallback, useEffect, useState } from "react";
import { AddressChip } from "@/components/ui/address-chip";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatsRow, TerminalSection } from "@/components/ui/terminal-section";
import { fetchTask } from "@/lib/api";
import { explorerTxUrl } from "@/lib/explorer";
import { formatAddress, formatUsdc } from "@/lib/format";
import {
  DEMO_TASK_OPTIONS,
  DEMO_TASK_SLASHED,
} from "@/lib/mockTasks";
import type { FetchTaskResult, MoneyMovement, TaskStep } from "@/lib/types";

function StepNode({ step }: { step: TaskStep }) {
  const active =
    step.status === "active"
      ? "border-[var(--status-warning)] text-[var(--status-warning)]"
      : step.status === "complete"
        ? "border-[var(--status-good)] text-[var(--status-good)]"
        : "border-[var(--border)] text-[var(--ink-muted)]";

  return (
    <div className={`min-w-[108px] rounded-lg border px-3 py-2 ${active}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-80">{step.label}</p>
      {step.status === "active" ? (
        <StatusBadge tone="warning" label="CURRENT" />
      ) : step.status === "complete" ? (
        <StatusBadge tone="good" label="DONE" />
      ) : (
        <span className="mt-1 block text-[10px]">pending</span>
      )}
      {step.txHash ? (
        explorerTxUrl(step.txHash) ? (
          <a
            href={explorerTxUrl(step.txHash)!}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block font-mono text-[10px] text-[var(--ink-secondary)] hover:text-[var(--accent)]"
          >
            {formatAddress(step.txHash, 8, 6)}
          </a>
        ) : (
          <span
            className="mt-2 block font-mono text-[10px] text-[var(--ink-secondary)]"
            title={step.txHash}
          >
            {formatAddress(step.txHash, 8, 6)}
          </span>
        )
      ) : null}
    </div>
  );
}

export function TaskLifecyclePanel() {
  const [taskId, setTaskId] = useState(DEMO_TASK_SLASHED);
  const [result, setResult] = useState<FetchTaskResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    const next = await fetchTask(id);
    setResult(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(taskId);
  }, [load, taskId]);

  const mainline = result?.task.steps.filter((s) =>
    ["intent", "created", "bonded", "executed", "verify"].includes(s.id),
  );
  const passBranch = result?.task.steps.find((s) => s.id === "release");
  const failBranch = result?.task.steps.find((s) => s.id === "slash");

  const movementColumns: DataTableColumn<MoneyMovement>[] = [
    {
      key: "label",
      header: "Movement",
      render: (row) => row.label,
    },
    {
      key: "from",
      header: "From",
      render: (row) => row.from,
    },
    {
      key: "to",
      header: "To",
      align: "right",
      render: (row) => row.to,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (row) => formatUsdc(row.amount, 2),
    },
  ];

  return (
    <TerminalSection
      label="02"
      title="Protected task lifecycle"
      description="Bonded execution flow — both pass and fail branches stay visible. Numbers from GET /api/tasks/:id."
    >
      <div className="mb-6 flex flex-wrap gap-2">
        {DEMO_TASK_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setTaskId(option.id)}
            className={`btn-tab ${taskId === option.id ? "btn-tab-active" : ""}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--ink-muted)]">Loading task…</p>
      ) : null}

      {!loading && result?.error ? (
        <p className="mb-4 text-sm text-[var(--status-warning)]">
          {result.error}
          {result.mode !== "live" ? (
            <span className="block mt-1 text-[var(--ink-muted)]">
              Run <code className="text-xs">npm run seed:tasks</code> after deploy to
              seed on-chain demo tasks.
            </span>
          ) : null}
        </p>
      ) : null}

      {!loading && result ? (
        <>
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <StatusBadge
              tone={
                result.task.outcome === "fail"
                  ? "serious"
                  : result.task.outcome === "pass"
                    ? "good"
                    : "warning"
              }
              label={result.task.state.toUpperCase()}
            />
            <StatusBadge
              tone={result.mode === "live" ? "good" : "warning"}
              label={result.mode === "live" ? "LIVE CHAIN" : "FIXTURE"}
            />
            <span className="text-sm text-[var(--ink-secondary)]">
              Agent: {result.task.agentName}
            </span>
            <AddressChip address={result.task.buyer} label="Buyer" />
          </div>

          <div className="mb-8 overflow-x-auto">
            <div className="flex min-w-[720px] flex-col gap-4">
              <div className="flex items-center gap-2">
                {mainline?.map((step, index) => (
                  <div key={step.id} className="flex items-center gap-2">
                    <StepNode step={step} />
                    {index < mainline.length - 1 ? (
                      <span className="text-[var(--ink-muted)]">→</span>
                    ) : null}
                  </div>
                ))}
              </div>

              <svg
                viewBox="0 0 400 80"
                className="h-16 w-full max-w-md text-[var(--border)]"
                aria-hidden
              >
                <path
                  d="M 200 0 L 200 24 M 80 48 L 320 48 M 80 48 L 80 80 M 320 48 L 320 80"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>

              <div className="flex gap-8">
                {passBranch ? <StepNode step={passBranch} /> : null}
                {failBranch ? <StepNode step={failBranch} /> : null}
              </div>
            </div>
          </div>

          <StatsRow
            items={[
              {
                label: "Payment",
                value: formatUsdc(result.task.paymentAmount, 2),
              },
              {
                label: "Required bond",
                value: formatUsdc(result.task.requiredBond, 2),
              },
              {
                label: "Max compensation",
                value: formatUsdc(result.task.maxCompensation, 2),
              },
            ]}
          />

          <div className="mt-10">
            <p className="section-label mb-4">Money movement</p>
            <DataTable
              flat
              columns={movementColumns}
              rows={result.task.movements}
              rowKey={(row) => `${row.from}-${row.to}-${row.label}`}
              emptyMessage="No money movements recorded."
            />
          </div>
        </>
      ) : null}
    </TerminalSection>
  );
}
