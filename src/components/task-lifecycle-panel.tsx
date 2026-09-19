"use client";

import { useCallback, useEffect, useState } from "react";
import { AddressChip } from "@/components/ui/address-chip";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { fetchTask } from "@/lib/api";
import { formatAddress, formatUsdc } from "@/lib/format";
import {
  DEMO_TASK_OPTIONS,
  DEMO_TASK_SLASHED,
} from "@/lib/mockTasks";
import type { FetchTaskResult, MoneyMovement, TaskStep } from "@/lib/types";

function explorerTxUrl(hash: string): string {
  return `https://explorer.monad.xyz/tx/${hash}`;
}

function StepNode({ step }: { step: TaskStep }) {
  const border =
    step.status === "active"
      ? "border-[var(--status-warning)]"
      : step.status === "complete"
        ? "border-[var(--status-good)]"
        : "border-[var(--border)]";

  return (
    <div className={`min-w-[120px] rounded border px-3 py-2 ${border}`}>
      <p className="text-xs text-[var(--ink-muted)]">{step.label}</p>
      {step.status === "active" ? (
        <StatusBadge tone="warning" label="CURRENT" />
      ) : step.status === "complete" ? (
        <StatusBadge tone="good" label="DONE" />
      ) : (
        <span className="mt-1 block text-[10px] text-[var(--ink-muted)]">
          pending
        </span>
      )}
      {step.txHash ? (
        <a
          href={explorerTxUrl(step.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block font-mono text-[10px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
        >
          {formatAddress(step.txHash, 8, 6)}
        </a>
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
    <Card title="Protected task lifecycle">
      <p className="mb-4 text-sm text-[var(--ink-secondary)]">
        Bonded execution flow — both pass and fail branches stay visible. Numbers
        from <code className="text-[var(--ink-muted)]">GET /api/tasks/:id</code>.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {DEMO_TASK_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setTaskId(option.id)}
            className={`rounded border px-3 py-2 text-xs ${
              taskId === option.id
                ? "border-[var(--ink-primary)] text-[var(--ink-primary)]"
                : "border-[var(--border)] text-[var(--ink-secondary)]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--ink-secondary)]">Loading task…</p>
      ) : null}

      {!loading && result?.error ? (
        <p className="mb-4 text-sm text-[var(--status-warning)]">{result.error}</p>
      ) : null}

      {!loading && result ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
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
            <span className="text-sm text-[var(--ink-secondary)]">
              Agent: {result.task.agentName}
            </span>
            <AddressChip address={result.task.buyer} label="Buyer" />
          </div>

          <div className="mb-6 overflow-x-auto">
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
                className="h-16 w-full max-w-md text-[var(--gridline)]"
                aria-hidden
              >
                <path
                  d="M 200 0 L 200 24 M 80 48 L 320 48 M 80 48 L 80 80 M 320 48 L 320 80"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>

              <div className="flex gap-8">
                {passBranch ? <StepNode step={passBranch} /> : null}
                {failBranch ? <StepNode step={failBranch} /> : null}
              </div>
            </div>
          </div>

          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded border border-[var(--border)] p-3 text-sm">
              <p className="text-[var(--ink-muted)]">Payment</p>
              <p className="text-[var(--ink-primary)]">
                {formatUsdc(result.task.paymentAmount, 2)}
              </p>
            </div>
            <div className="rounded border border-[var(--border)] p-3 text-sm">
              <p className="text-[var(--ink-muted)]">Required bond</p>
              <p className="text-[var(--ink-primary)]">
                {formatUsdc(result.task.requiredBond, 2)}
              </p>
            </div>
            <div className="rounded border border-[var(--border)] p-3 text-sm">
              <p className="text-[var(--ink-muted)]">Max compensation</p>
              <p className="text-[var(--ink-primary)]">
                {formatUsdc(result.task.maxCompensation, 2)}
              </p>
            </div>
          </div>

          <DataTable
            columns={movementColumns}
            rows={result.task.movements}
            rowKey={(row) => `${row.from}-${row.to}-${row.label}`}
            emptyMessage="No money movements recorded."
          />
        </>
      ) : null}
    </Card>
  );
}
