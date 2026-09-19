import Link from "next/link";
import type { ReactNode } from "react";
import {
  BenchmarkFeaturePreview,
  HeroTerminalPreview,
  LifecycleFeaturePreview,
  ShowcaseTerminalPreview,
  VaultFeaturePreview,
} from "./terminal-previews";

const GITHUB_URL = "https://github.com/HarshadS7/Fides";

function NavLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className="text-sm text-[var(--ink-muted)] transition-colors hover:text-[var(--ink-primary)]"
    >
      {children}
    </a>
  );
}

function PillButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const styles =
    variant === "primary"
      ? "bg-[var(--ink-primary)] text-[var(--surface-page)] hover:bg-[#1a1a1a]"
      : "border border-[var(--border)] bg-transparent text-[var(--ink-primary)] hover:border-[var(--ink-primary)]";

  return (
    <Link
      href={href}
      className={`inline-flex items-center rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${styles}`}
    >
      {children}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="section-label mb-3">
      {children}
    </p>
  );
}

function Divider() {
  return <hr className="border-0 border-t border-[var(--border)]" />;
}

export function LandingPage() {
  return (
    <div className="landing min-h-full">
      {/* Hero canvas */}
      <section className="landing-hero relative overflow-hidden">
        <div className="landing-hero-texture" aria-hidden="true" />

        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-8 sm:px-8 sm:pb-24 sm:pt-10">
          <header className="mb-16 flex items-center justify-between sm:mb-20">
            <Link href="/" className="text-lg font-medium tracking-[-0.02em]">
              Fides
            </Link>
            <nav className="hidden items-center gap-8 sm:flex">
              <NavLink href="#product">Product</NavLink>
              <NavLink href="#how-it-works">How it works</NavLink>
              <NavLink href="/terminal">Terminal</NavLink>
            </nav>
          </header>

          <div className="grid items-end gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <SectionLabel>Economic enforcement for the agentic web</SectionLabel>
              <h1 className="mb-5 text-[2.5rem] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[3.25rem]">
                When an agent takes your money,
                <br />
                make failure cost something.
              </h1>
              <p className="mb-8 max-w-md text-base leading-relaxed text-[var(--ink-muted)] sm:text-lg">
                Bonded execution, on-chain slashing, and real-time risk visibility
                — built for Monad&apos;s parallel execution model.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <PillButton href="/terminal">Open Agent Risk Terminal</PillButton>
                <a
                  href={`${GITHUB_URL}/tree/main/contracts`}
                  className="text-sm text-[var(--ink-muted)] underline-offset-4 hover:text-[var(--accent)] hover:underline"
                >
                  View contracts
                </a>
              </div>
            </div>

            <div className="lg:col-span-7">
              <HeroTerminalPreview />
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="max-w-2xl">
          <SectionLabel>The problem</SectionLabel>
          <p className="text-lg leading-relaxed text-[var(--ink-muted)] sm:text-xl">
            Autonomous agents can accept paid work through protocols like x402, but
            payment alone doesn&apos;t create accountability. When an agent fails a
            task, stalls, or delivers garbage, buyers have no enforceable recourse.
            Fides adds economic skin in the game: agents bond collateral, tasks
            define machine-checkable success before execution, and failure triggers
            compensation — not subjective AI judging, but deterministic settlement.
          </p>
        </div>
      </section>

      <Divider />

      {/* Flagship showcase */}
      <section id="product" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="mb-12 grid gap-8 lg:grid-cols-5 lg:items-end">
          <div className="lg:col-span-2">
            <SectionLabel>Agent Risk Terminal</SectionLabel>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
              One screen for liability, slashes, and task cost.
            </h2>
          </div>
          <div className="lg:col-span-3">
            <p className="text-base leading-relaxed text-[var(--ink-muted)]">
              One screen to see who&apos;s covered, who&apos;s been slashed, and what a
              protected task actually costs. Every number comes from the chain — not
              a dashboard fantasy.
            </p>
          </div>
        </div>
        <ShowcaseTerminalPreview />
      </section>

      <Divider />

      {/* Feature stories */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="flex flex-col gap-20 sm:gap-28">
          <FeatureStory
            number="01"
            headline="See liability before you hire."
            body="Each agent vault shows TVL, utilization, APY, risk in basis points, and slash count. Agents with failures are marked explicitly — icon plus label, never color alone. No hiding bad actors behind averages."
            visual={<VaultFeaturePreview />}
          />
          <FeatureStory
            number="02"
            headline="Know exactly what happens to the money."
            body="Every protected task follows a visible state machine: policy created, bond locked, execution, verification, then release or slash. Both pass and fail branches stay on screen. Amounts, addresses, and explorer links for each completed step."
            visual={<LifecycleFeaturePreview />}
            reverse
          />
          <FeatureStory
            number="03"
            headline="Built for parallel execution, measured honestly."
            body="Independent agent workloads vs conflicting state contention — streamed per-tx with latest, safe, and finalized reported separately. Our measurements labeled distinctly from Monad's published 400ms block / 800ms finality spec. No fake latency numbers."
            visual={<BenchmarkFeaturePreview />}
          />
        </div>
      </section>

      <Divider />

      {/* Trust */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <SectionLabel>Honest by design</SectionLabel>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
              What&apos;s real, what&apos;s not.
            </h2>
          </div>
          <ul className="divide-y divide-[var(--border)] lg:col-span-3">
            <TrustPoint>
              <strong className="font-medium text-[var(--ink-primary)]">
                Slash() is on-chain and onlyAuthorized
              </strong>
              {" — "}
              slashing is triggered by an authorized validator, not a contract
              pretending to judge AI quality.
            </TrustPoint>
            <TrustPoint>
              <strong className="font-medium text-[var(--ink-primary)]">
                ERC-8004 identity integration
              </strong>
              {" — "}
              with graceful mock fallback where the registry is unavailable on
              testnet.
            </TrustPoint>
            <TrustPoint>
              <strong className="font-medium text-[var(--ink-primary)]">
                Deterministic validation predicates only
              </strong>
              {" — "}
              oracle tolerance, signed attestation, schema checks. No LLM-as-judge.
            </TrustPoint>
            <TrustPoint>
              <strong className="font-medium text-[var(--ink-primary)]">
                Deployed contracts
              </strong>
              {" — "}
              AgentVault, PremiumEngine, UserUnderwriting, VaultEscrow — tested,
              ABI-frozen, seedable on local chain.
            </TrustPoint>
          </ul>
        </div>
      </section>

      <Divider />

      {/* Closing */}
      <section className="mx-auto max-w-6xl px-5 py-20 text-center sm:px-8 sm:py-28">
        <h2 className="mb-8 text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
          Make agent work accountable.
        </h2>
        <PillButton href="/terminal">Open Agent Risk Terminal</PillButton>
      </section>

      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-[var(--ink-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-[var(--ink-primary)]">Fides</span>
            <span aria-hidden="true">·</span>
            <span>Built on Monad</span>
            <span aria-hidden="true">·</span>
            <a
              href={GITHUB_URL}
              className="hover:text-[var(--accent)]"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </div>
          <p>© {new Date().getFullYear()} Fides</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureStory({
  number,
  headline,
  body,
  visual,
  reverse = false,
}: {
  number: string;
  headline: string;
  body: string;
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div
      className={`grid items-center gap-10 lg:grid-cols-12 lg:gap-16 ${
        reverse ? "" : ""
      }`}
    >
      <div
        className={`lg:col-span-5 ${reverse ? "lg:order-2" : ""}`}
      >
        <p className="mb-4 font-mono text-sm text-[var(--accent)]">
          {number}
        </p>
        <h3 className="mb-4 text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
          {headline}
        </h3>
        <p className="text-base leading-relaxed text-[var(--ink-muted)]">
          {body}
        </p>
      </div>
      <div className={`lg:col-span-7 ${reverse ? "lg:order-1" : ""}`}>
        {visual}
      </div>
    </div>
  );
}

function TrustPoint({ children }: { children: React.ReactNode }) {
  return (
    <li className="py-5 text-base leading-relaxed text-[var(--ink-muted)] first:pt-0 last:pb-0">
      {children}
    </li>
  );
}
