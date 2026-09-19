import { StatusBadge } from "@/components/ui/status-badge";
import type { ReactNode } from "react";

/** Dark terminal chrome for landing-page product mockups. */
function TerminalFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`terminal-preview overflow-hidden rounded-xl border border-white/10 bg-[#0d0d0d] text-white shadow-[0_8px_32px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.06)] ${className}`}
    >
      {children}
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded border border-white/10 bg-[#1a1a19] px-3 py-2">
      <p className="text-[10px] text-[#898781]">{label}</p>
      <p className="text-sm font-medium text-white">{value}</p>
    </div>
  );
}

export function HeroTerminalPreview() {
  return (
    <TerminalFrame className="p-4 [transform:perspective(1200px)_rotateX(2deg)]">
      <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
        <div>
          <p className="text-xs text-white">fedis</p>
          <p className="text-[10px] text-[#898781]">Agent Risk Terminal</p>
        </div>
        <p className="text-[9px] text-[#898781]">Monad · 400ms / 800ms</p>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="Total capital" value="$316,756" />
        <MiniStat label="Agents" value="4" />
        <MiniStat label="Slashes" value="4" />
        <MiniStat label="Tasks" value="184" />
      </div>

      <div className="mb-3 overflow-hidden rounded border border-white/10">
        <table className="w-full text-left text-[10px]">
          <thead className="border-b border-white/10 text-[#898781]">
            <tr>
              <th className="px-2 py-1.5 font-normal">Agent</th>
              <th className="px-2 py-1.5 text-right font-normal">TVL</th>
              <th className="px-2 py-1.5 text-right font-normal">Slashes</th>
            </tr>
          </thead>
          <tbody className="text-[#c3c2b7]">
            <tr className="border-b border-white/5">
              <td className="px-2 py-1.5">
                <span className="text-white">gpt-researcher-v2</span>
                <StatusBadge tone="good" label="CLEAN" />
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">$250,032</td>
              <td className="px-2 py-1.5 text-right tabular-nums">0</td>
            </tr>
            <tr className="bg-[#ec835a]/5">
              <td className="px-2 py-1.5">
                <span className="text-white">flaky-scraper-v0</span>
                <StatusBadge tone="serious" label="SLASHED" />
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">$26,652</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[#ec835a]">4</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-1 overflow-hidden text-[9px] text-[#898781]">
        {["INTENT", "POLICY", "BOND", "EXECUTE", "VERIFY", "SLASH"].map(
          (step, i) => (
            <span key={step} className="flex items-center gap-1">
              <span
                className={`rounded border px-1.5 py-0.5 ${
                  i >= 4
                    ? "border-[#ec835a] text-[#ec835a]"
                    : "border-[#0ca30c] text-[#0ca30c]"
                }`}
              >
                {step}
              </span>
              {i < 5 ? <span>→</span> : null}
            </span>
          ),
        )}
      </div>
    </TerminalFrame>
  );
}

export function VaultFeaturePreview() {
  return (
    <TerminalFrame className="p-4">
      <p className="mb-2 text-xs text-[#898781]">Agent vaults</p>
      <table className="w-full text-left text-[11px]">
        <thead className="border-b border-white/10 text-[#898781]">
          <tr>
            <th className="pb-2 font-normal">Agent</th>
            <th className="pb-2 text-right font-normal">TVL</th>
            <th className="pb-2 text-right font-normal">Risk</th>
            <th className="pb-2 text-right font-normal">Slashes</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-white/5 text-[#c3c2b7]">
            <td className="py-2">
              claude-summarizer-v1
              <StatusBadge tone="good" label="CLEAN" />
            </td>
            <td className="py-2 text-right tabular-nums">$40,072</td>
            <td className="py-2 text-right tabular-nums">0.50%</td>
            <td className="py-2 text-right tabular-nums">0</td>
          </tr>
          <tr className="bg-[#ec835a]/8 text-[#c3c2b7]">
            <td className="py-2">
              <span className="text-white">flaky-scraper-v0</span>
              <StatusBadge tone="serious" label="SLASHED" />
            </td>
            <td className="py-2 text-right tabular-nums">$26,652</td>
            <td className="py-2 text-right tabular-nums">5.51%</td>
            <td className="py-2 text-right tabular-nums text-[#ec835a]">4</td>
          </tr>
        </tbody>
      </table>
    </TerminalFrame>
  );
}

export function LifecycleFeaturePreview() {
  const steps = [
    "INTENT",
    "POLICY CREATED",
    "AGENT BONDS",
    "EXECUTE",
    "VERIFY",
    "SLASH",
  ];

  return (
    <TerminalFrame className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <StatusBadge tone="serious" label="SLASHED" />
        <span className="text-[11px] text-[#898781]">flaky-scraper-v0</span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1">
        {steps.map((step, i) => (
          <span key={step} className="flex items-center gap-1 text-[9px]">
            <span
              className={`rounded border px-1.5 py-1 ${
                step === "SLASH"
                  ? "border-[#ec835a] bg-[#ec835a]/10 text-[#ec835a]"
                  : "border-[#0ca30c]/40 text-[#0ca30c]"
              }`}
            >
              {step}
            </span>
            {i < steps.length - 1 ? (
              <span className="text-[#898781]">→</span>
            ) : null}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div className="rounded border border-white/10 bg-[#1a1a19] p-2">
          <p className="text-[#898781]">Payment</p>
          <p className="text-white">$100.00</p>
        </div>
        <div className="rounded border border-white/10 bg-[#1a1a19] p-2">
          <p className="text-[#898781]">Required bond</p>
          <p className="text-white">$50.00</p>
        </div>
        <div className="rounded border border-white/10 bg-[#1a1a19] p-2">
          <p className="text-[#898781]">Compensation</p>
          <p className="text-[#ec835a]">$45.00</p>
        </div>
      </div>
    </TerminalFrame>
  );
}

export function BenchmarkFeaturePreview() {
  return (
    <TerminalFrame className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded border border-white/20 px-2 py-1 text-[10px] text-white">
          Run benchmark stream
        </span>
        <StatusBadge tone="warning" label="SIMULATED" />
        <StatusBadge tone="good" label="STREAM DONE" />
      </div>

      <div className="mb-3 flex gap-3 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#3987e5]" />
          Independent
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#d95926]" />
          Conflicting
        </span>
      </div>

      <div className="mb-3 space-y-3">
        {["Independent", "Conflicting"].map((label, row) => (
          <div key={label}>
            <p className="mb-1 text-[9px] text-[#898781]">{label}</p>
            <div className="relative h-3 rounded bg-[#1a1a19]">
              <div className="absolute inset-y-0 left-0 right-0 border-b border-[#2c2c2a]" />
              {Array.from({ length: 12 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-[#0d0d0d]"
                  style={{
                    left: `${8 + i * 7}%`,
                    background: row === 0 ? "#3987e5" : "#d95926",
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded border border-white/10 text-[9px]">
        <div className="grid grid-cols-4 border-b border-white/10 bg-[#1a1a19] px-2 py-1 text-[#898781]">
          <span>Workload</span>
          <span>Tx hash</span>
          <span className="text-right">safe</span>
          <span className="text-right">finalized</span>
        </div>
        <div className="grid grid-cols-4 px-2 py-1 text-[#c3c2b7] tabular-nums">
          <span>independent</span>
          <span className="font-mono">0xsim01…0000</span>
          <span className="text-right">yes</span>
          <span className="text-right">yes</span>
        </div>
      </div>
    </TerminalFrame>
  );
}

export function ShowcaseTerminalPreview() {
  return (
    <TerminalFrame className="p-5">
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <MiniStat label="Total capital" value="$316,756" />
        <MiniStat label="Agents covered" value="4" />
        <MiniStat label="Total slashed" value="4" />
        <MiniStat label="Tasks insured" value="184" />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs text-[#898781]">Premium contrast · flaky-scraper-v0</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border border-white/10 bg-[#1a1a19] p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] text-[#898781]">Trusted buyer</span>
                <StatusBadge tone="good" label="TRUSTED" />
              </div>
              <p className="text-lg text-white">$1.10</p>
            </div>
            <div className="rounded border border-white/10 bg-[#1a1a19] p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] text-[#898781]">Flagged buyer</span>
                <StatusBadge tone="warning" label="FLAGGED" />
              </div>
              <p className="text-lg text-white">$12.95</p>
            </div>
          </div>
        </div>
        <div className="rounded border border-white/10 bg-[#1a1a19] p-3">
          <div className="mb-2 flex items-center gap-2">
            <StatusBadge tone="serious" label="SLASHED" />
            <span className="text-[11px] text-[#898781]">Task lifecycle</span>
          </div>
          <div className="flex flex-wrap gap-1 text-[8px]">
            {["INTENT", "POLICY", "BOND", "EXECUTE", "VERIFY", "SLASH"].map(
              (step) => (
                <span
                  key={step}
                  className={`rounded border px-1 py-0.5 ${
                    step === "SLASH"
                      ? "border-[#ec835a] text-[#ec835a]"
                      : "border-[#0ca30c]/40 text-[#0ca30c]"
                  }`}
                >
                  {step}
                </span>
              ),
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded border border-white/10">
        <table className="w-full text-left text-[11px]">
          <thead className="border-b border-white/10 text-[#898781]">
            <tr>
              <th className="px-3 py-2 font-normal">Agent</th>
              <th className="px-3 py-2 text-right font-normal">TVL</th>
              <th className="px-3 py-2 text-right font-normal">Slashes</th>
            </tr>
          </thead>
          <tbody className="text-[#c3c2b7]">
            <tr className="border-b border-white/5">
              <td className="px-3 py-2">gpt-researcher-v2</td>
              <td className="px-3 py-2 text-right tabular-nums">$250,032</td>
              <td className="px-3 py-2 text-right tabular-nums">0</td>
            </tr>
            <tr className="bg-[#ec835a]/8">
              <td className="px-3 py-2 text-white">
                flaky-scraper-v0
                <StatusBadge tone="serious" label="SLASHED" />
              </td>
              <td className="px-3 py-2 text-right tabular-nums">$26,652</td>
              <td className="px-3 py-2 text-right tabular-nums text-[#ec835a]">4</td>
            </tr>
          </tbody>
        </table>
      </div>
    </TerminalFrame>
  );
}
