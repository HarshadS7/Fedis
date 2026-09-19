"use client";

import { useEffect, useState } from "react";
import { AddressChip } from "@/components/ui/address-chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { TerminalSection } from "@/components/ui/terminal-section";
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
      <TerminalSection label="03" title="Premium contrast">
        <p className="text-sm text-[var(--ink-muted)]">Loading premium quotes…</p>
      </TerminalSection>
    );
  }

  if (!trusted || !flagged) {
    return (
      <TerminalSection label="03" title="Premium contrast">
        <p className="text-sm text-[var(--status-warning)]">
          Premium quotes unavailable.
        </p>
      </TerminalSection>
    );
  }

  const error = trusted.error ?? flagged.error;

  return (
    <TerminalSection
      label="03"
      title="Premium contrast"
      description={`On a ${TASK_LABEL} task against flaky-scraper-v0 — same agent risk, different buyer trust scores.`}
    >
      <div className="mb-8 flex flex-wrap gap-2">
        <AddressChip address={DEMO_TRUSTED} label="Trusted" />
        <AddressChip address={DEMO_FRAUDSTER} label="Flagged" />
      </div>

      <div className="grid gap-10 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-[var(--border)]">
        <QuotePanel title="Trusted buyer" tone="good" quote={trusted} />
        <QuotePanel
          title="Flagged buyer"
          tone="serious"
          quote={flagged}
          className="sm:pl-10"
        />
      </div>

      {error ? (
        <p className="mt-6 text-xs text-[var(--status-warning)]">{error}</p>
      ) : null}
    </TerminalSection>
  );
}

function QuotePanel({
  title,
  tone,
  quote,
  className = "",
}: {
  title: string;
  tone: "good" | "serious";
  quote: FetchPremiumResult;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--ink-primary)]">{title}</p>
        <StatusBadge tone={tone} label={tone === "good" ? "TRUSTED" : "FLAGGED"} />
      </div>
      <p className="text-3xl font-semibold tracking-[-0.02em] text-[var(--ink-primary)]">
        {formatUsdc(quote.quote.premium, 2)}
      </p>
      <dl className="mt-6 space-y-2 text-sm text-[var(--ink-muted)]">
        <div className="flex justify-between gap-4 border-b border-[var(--gridline)] pb-2">
          <dt>Trust score</dt>
          <dd className="text-[var(--ink-primary)] tabular-nums">
            {quote.quote.trustScore}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-[var(--gridline)] pb-2">
          <dt>Risk multiplier</dt>
          <dd className="text-[var(--ink-primary)] tabular-nums">
            {formatBps(quote.quote.multiplierBps)}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-[var(--gridline)] pb-2">
          <dt>Agent risk</dt>
          <dd className="text-[var(--ink-primary)] tabular-nums">
            {formatBps(quote.quote.agentRiskBps)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>API mode</dt>
          <dd className="text-[var(--ink-primary)]">{quote.mode}</dd>
        </div>
      </dl>
    </div>
  );
}
