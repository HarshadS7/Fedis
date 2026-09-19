"use client";

import { useEffect, useState } from "react";
import { AddressChip } from "@/components/ui/address-chip";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { fetchPremiumContrast } from "@/lib/api";
import { DEMO_FRAUDSTER, DEMO_TRUSTED } from "@/lib/mock";
import { formatBps, formatUsdc } from "@/lib/format";
import type { FetchPremiumResult } from "@/lib/types";

const TASK_LABEL = "$100";

export function PremiumContrastCard() {
  const [trusted, setTrusted] = useState<FetchPremiumResult | null>(null);
  const [flagged, setFlagged] = useState<FetchPremiumResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetchPremiumContrast().then((result) => {
      if (!active) return;
      setTrusted(result.trusted);
      setFlagged(result.flagged);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <Card title="Premium contrast">
        <p className="text-sm text-[var(--ink-secondary)]">
          Loading premium quotes…
        </p>
      </Card>
    );
  }

  if (!trusted || !flagged) {
    return (
      <Card title="Premium contrast">
        <p className="text-sm text-[var(--status-warning)]">
          Premium quotes unavailable.
        </p>
      </Card>
    );
  }

  const error = trusted.error ?? flagged.error;

  return (
    <Card title="Premium contrast">
      <p className="mb-4 text-sm text-[var(--ink-secondary)]">
        On a {TASK_LABEL} task against{" "}
        <span className="text-[var(--ink-primary)]">flaky-scraper-v0</span> —
        same agent risk, different buyer trust scores.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <AddressChip address={DEMO_TRUSTED} label="Trusted" />
        <AddressChip address={DEMO_FRAUDSTER} label="Flagged" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <QuotePanel title="Trusted buyer" tone="good" quote={trusted} />
        <QuotePanel title="Flagged buyer" tone="serious" quote={flagged} />
      </div>

      {error ? (
        <p className="mt-3 text-xs text-[var(--status-warning)]">{error}</p>
      ) : null}
    </Card>
  );
}

function QuotePanel({
  title,
  tone,
  quote,
}: {
  title: string;
  tone: "good" | "serious";
  quote: FetchPremiumResult;
}) {
  return (
    <div className="rounded border border-[var(--border)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm text-[var(--ink-primary)]">{title}</p>
        <StatusBadge tone={tone} label={tone === "good" ? "TRUSTED" : "FLAGGED"} />
      </div>
      <p className="text-2xl text-[var(--ink-primary)]">
        {formatUsdc(quote.quote.premium, 2)}
      </p>
      <dl className="mt-3 space-y-1 text-xs text-[var(--ink-muted)]">
        <div className="flex justify-between gap-4">
          <dt>Trust score</dt>
          <dd className="text-[var(--ink-secondary)] tabular-nums">
            {quote.quote.trustScore}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Risk multiplier</dt>
          <dd className="text-[var(--ink-secondary)] tabular-nums">
            {formatBps(quote.quote.multiplierBps)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Agent risk</dt>
          <dd className="text-[var(--ink-secondary)] tabular-nums">
            {formatBps(quote.quote.agentRiskBps)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>API mode</dt>
          <dd className="text-[var(--ink-secondary)]">{quote.mode}</dd>
        </div>
      </dl>
    </div>
  );
}
