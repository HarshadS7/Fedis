"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DevStatusStrip } from "@/components/dev-status-strip";
import { ParallelismPanel } from "@/components/parallelism-panel";
import { PremiumContrastCard } from "@/components/premium-contrast-card";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
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
          <div className="flex flex-col gap-1">
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
      <div className="flex flex-col gap-4">
        {result ? (
          <DevStatusStrip
            mode={result.mode}
            chain={
              result.mode === "live" ? "local / testnet" : "fixtures (mock)"
            }
            fetchedAt={result.fetchedAt}
            durationMs={result.durationMs}
            error={result.error}
          />
        ) : null}

        {loading ? (
          <Card>
            <p className="text-sm text-[var(--ink-secondary)]">
              Loading vault data…
            </p>
          </Card>
        ) : null}

        {!loading && result?.error ? (
          <Card>
            <p className="text-sm text-[var(--status-warning)]">
              {result.error}
            </p>
          </Card>
        ) : null}

        {!loading && stats ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Total capital underwritten" value={stats.totalCapital} />
            <StatTile label="Agents covered" value={stats.agentsCovered} />
            <StatTile label="Total slashed (events)" value={stats.totalSlashed} />
            <StatTile label="Tasks insured" value={stats.tasksInsured} />
          </div>
        ) : null}

        {!loading && result ? (
          <Card title="Agent vaults">
            <DataTable
              columns={columns}
              rows={result.vaults}
              rowKey={(vault) => vault.agentId}
              emptyMessage="No agent vaults returned from the API."
            />
          </Card>
        ) : null}

        {!loading && result ? <PremiumContrastCard /> : null}

        {!loading && result ? <ParallelismPanel /> : null}
      </div>
    </AppShell>
  );
}
