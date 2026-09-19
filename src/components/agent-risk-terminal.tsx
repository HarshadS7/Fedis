"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DevStatusStrip } from "@/components/dev-status-strip";
import { ParallelismPanel } from "@/components/parallelism-panel";
import { PremiumContrastCard } from "@/components/premium-contrast-card";
import { TaskLifecyclePanel } from "@/components/task-lifecycle-panel";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  StatsRow,
  TerminalDivider,
  TerminalSection,
} from "@/components/ui/terminal-section";
import { fetchVaults } from "@/lib/api";
import { formatBps, formatInteger, formatUsdc } from "@/lib/format";
import type { FetchVaultsResult, VaultInfo } from "@/lib/types";

function aggregateStats(vaults: VaultInfo[]) {
  const totalTvl = vaults.reduce((sum, vault) => sum + Number(vault.tvl), 0);
  const totalSlashes = vaults.reduce(
    (sum, vault) => sum + Number(vault.slashCount),
    0,
  );
  const totalJobs = vaults.reduce(
    (sum, vault) => sum + Number(vault.jobCount),
    0,
  );

  return {
    totalCapital: formatUsdc(totalTvl),
    agentsCovered: formatInteger(vaults.length),
    totalSlashed: formatInteger(totalSlashes),
    tasksInsured: formatInteger(totalJobs),
  };
}

export function AgentRiskTerminal() {
  const [result, setResult] = useState<FetchVaultsResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const next = await fetchVaults();
    setResult(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial network fetch on mount
    void load();
  }, [load]);

  const stats = useMemo(
    () => (result ? aggregateStats(result.vaults) : null),
    [result],
  );

  const columns: DataTableColumn<VaultInfo>[] = useMemo(
    () => [
      {
        key: "name",
        header: "Agent",
        render: (vault) => (
          <div className="flex items-center gap-3">
            <span>{vault.agentName}</span>
            {Number(vault.slashCount) > 0 ? (
              <StatusBadge tone="serious" label="SLASHED" />
            ) : (
              <StatusBadge tone="good" label="CLEAN" />
            )}
          </div>
        ),
      },
      {
        key: "tvl",
        header: "TVL",
        align: "right",
        render: (vault) => formatUsdc(vault.tvl),
      },
      {
        key: "util",
        header: "Utilization",
        align: "right",
        render: (vault) => formatBps(vault.utilizationBps),
      },
      {
        key: "apy",
        header: "APY",
        align: "right",
        render: (vault) => formatBps(vault.apyBps),
      },
      {
        key: "risk",
        header: "Risk",
        align: "right",
        render: (vault) => formatBps(vault.riskBps),
      },
      {
        key: "slashes",
        header: "Slashes",
        align: "right",
        render: (vault) => formatInteger(vault.slashCount),
      },
    ],
    [],
  );

  return (
    <AppShell>
      <header className="pb-10">
        <p className="section-label mb-2">Live dashboard</p>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
          Agent Risk Terminal
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--ink-muted)] sm:text-base">
          Vault liability, slash history, task lifecycle, and Monad parallelism —
          every number from the API.
        </p>
        {result ? (
          <DevStatusStrip
            mode={result.mode}
            chain={
              result.mode === "live" ? "local / testnet" : "fixtures (mock)"
            }
            fetchedAt={result.fetchedAt}
            durationMs={result.durationMs}
            error={result.error}
            onRefresh={() => void load()}
            refreshing={loading}
          />
        ) : null}
      </header>

      {loading ? (
        <p className="text-sm text-[var(--ink-muted)]">Loading vault data…</p>
      ) : null}

      {!loading && result?.error ? (
        <p className="text-sm text-[var(--status-warning)]">{result.error}</p>
      ) : null}

      {!loading && stats ? (
        <StatsRow
          items={[
            { label: "Total capital", value: stats.totalCapital },
            { label: "Agents covered", value: stats.agentsCovered },
            { label: "Total slashed", value: stats.totalSlashed },
            { label: "Tasks insured", value: stats.tasksInsured },
          ]}
        />
      ) : null}

      {!loading && result ? (
        <>
          <TerminalDivider />
          <TerminalSection
            label="01"
            title="Agent vaults"
            description="TVL, utilization, APY, risk in basis points, and slash count per agent."
          >
            <DataTable
              flat
              columns={columns}
              rows={result.vaults}
              rowKey={(vault) => vault.agentId}
              emptyMessage="No agent vaults returned from the API."
            />
          </TerminalSection>

          <TerminalDivider />
          <TaskLifecyclePanel />

          <TerminalDivider />
          <PremiumContrastCard />

          <TerminalDivider />
          <ParallelismPanel />
        </>
      ) : null}
    </AppShell>
  );
}
