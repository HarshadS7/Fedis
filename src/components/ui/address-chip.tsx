"use client";

import { useCallback, useState } from "react";
import { formatAddress } from "@/lib/format";

export function AddressChip({
  address,
  label,
}: {
  address: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const display = formatAddress(address);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [address]);

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={address}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--ink-secondary)] transition-colors hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]"
    >
      {label ? (
        <span className="text-[var(--ink-muted)]">{label}</span>
      ) : null}
      <span className="font-mono tabular-nums">{display}</span>
      <span className="text-[var(--ink-muted)]">{copied ? "copied" : "copy"}</span>
    </button>
  );
}
