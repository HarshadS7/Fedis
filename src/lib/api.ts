import {
  DEMO_FRAUDSTER,
  DEMO_TRUSTED,
  FLAKY_AGENT_ID,
  MOCK_VAULTS,
  mockQuote,
} from "./mock";
import type {
  ApiMode,
  DemoFireResult,
  FetchPremiumResult,
  FetchVaultsResult,
  PremiumQuote,
  VaultInfo,
} from "./types";

const TASK_COST_100_USD = "100000000";

function useLiveApi(): boolean {
  return process.env.NEXT_PUBLIC_API_MODE === "live";
}

function useClientMockOnly(): boolean {
  return (
    process.env.NEXT_PUBLIC_API_MODE === "mock" ||
    process.env.NEXT_PUBLIC_FORCE_MOCK === "1"
  );
}

function logApi(
  mode: ApiMode,
  method: string,
  path: string,
  status: number,
  durationMs: number,
): void {
  console.log(
    `[api] MODE=${mode} ${method} ${path} -> ${status} in ${durationMs}ms`,
  );
}

function logApiFail(path: string, error: unknown): void {
  console.error(`[api] FAIL GET ${path} -`, error);
}

function logBench(event: string, detail?: string): void {
  console.log(`[bench] ${event}${detail ? ` - ${detail}` : ""}`);
}

export async function fetchVaults(): Promise<FetchVaultsResult> {
  const started = Date.now();
  const path = "/api/vaults";

  if (useClientMockOnly()) {
    const durationMs = Date.now() - started;
    logApi("mock", "GET", path, 200, durationMs);
    return {
      vaults: MOCK_VAULTS,
      mode: "mock",
      fetchedAt: new Date().toISOString(),
      durationMs,
    };
  }

  try {
    const res = await fetch(path, { cache: "no-store" });
    const durationMs = Date.now() - started;

    if (!res.ok) {
      logApiFail(path, `HTTP ${res.status}`);
      if (useLiveApi()) {
        logApi("live", "GET", path, res.status, durationMs);
        return {
          vaults: [],
          mode: "live",
          fetchedAt: new Date().toISOString(),
          durationMs,
          error: `Live API returned ${res.status}.`,
        };
      }

      logApi("mock", "GET", path, 200, durationMs);
      return {
        vaults: MOCK_VAULTS,
        mode: "mock",
        fetchedAt: new Date().toISOString(),
        durationMs,
        error: `API returned ${res.status}. Using client mock fixtures.`,
      };
    }

    // The route returns an envelope, and its `mode` is authoritative: a 200 does NOT
    // mean live data. With no chain reachable the server answers 200 with fixtures,
    // so trusting the status here would label mock numbers as live on screen.
    const body = (await res.json()) as {
      mode: ApiMode;
      vaults: VaultInfo[];
      degraded?: boolean;
      error?: string;
    };
    logApi(body.mode, "GET", path, 200, durationMs);
    return {
      vaults: body.vaults,
      mode: body.mode,
      fetchedAt: new Date().toISOString(),
      durationMs,
      error: body.degraded
        ? `Live read failed, serving fixtures. ${body.error ?? ""}`.trim()
        : undefined,
    };
  } catch (error) {
    const durationMs = Date.now() - started;
    logApiFail(path, error);
    logApi("mock", "GET", path, 200, durationMs);
    return {
      vaults: MOCK_VAULTS,
      mode: "mock",
      fetchedAt: new Date().toISOString(),
      durationMs,
      error:
        error instanceof Error
          ? `${error.message}. Falling back to mock fixtures.`
          : "Unknown error. Falling back to mock fixtures.",
    };
  }
}

export async function fetchPremium(
  agentId: string,
  user: string,
  taskCost = TASK_COST_100_USD,
): Promise<FetchPremiumResult> {
  const started = Date.now();
  const path = `/api/premium?agentId=${encodeURIComponent(agentId)}&user=${encodeURIComponent(user)}&taskCost=${taskCost}`;

  if (useClientMockOnly()) {
    const durationMs = Date.now() - started;
    logApi("mock", "GET", path, 200, durationMs);
    return {
      quote: mockQuote(agentId, BigInt(taskCost), user),
      mode: "mock",
      fetchedAt: new Date().toISOString(),
      durationMs,
    };
  }

  try {
    const res = await fetch(path, { cache: "no-store" });
    const durationMs = Date.now() - started;

    if (!res.ok) {
      logApiFail(path, `HTTP ${res.status}`);
      const quote = mockQuote(agentId, BigInt(taskCost), user);
      logApi("mock", "GET", path, 200, durationMs);
      return {
        quote,
        mode: "mock",
        fetchedAt: new Date().toISOString(),
        durationMs,
        error: `API returned ${res.status}. Using client mock quote.`,
      };
    }

    const body = (await res.json()) as PremiumQuote & { mode: ApiMode };
    logApi(body.mode, "GET", path, 200, durationMs);
    return {
      quote: {
        premium: body.premium,
        multiplierBps: body.multiplierBps,
        agentRiskBps: body.agentRiskBps,
        trustScore: body.trustScore,
      },
      mode: body.mode,
      fetchedAt: new Date().toISOString(),
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - started;
    logApiFail(path, error);
    logApi("mock", "GET", path, 200, durationMs);
    return {
      quote: mockQuote(agentId, BigInt(taskCost), user),
      mode: "mock",
      fetchedAt: new Date().toISOString(),
      durationMs,
      error:
        error instanceof Error
          ? `${error.message}. Falling back to mock quote.`
          : "Unknown error. Falling back to mock quote.",
    };
  }
}

export async function fetchPremiumContrast(): Promise<{
  trusted: FetchPremiumResult;
  flagged: FetchPremiumResult;
}> {
  const [trusted, flagged] = await Promise.all([
    fetchPremium(FLAKY_AGENT_ID, DEMO_TRUSTED),
    fetchPremium(FLAKY_AGENT_ID, DEMO_FRAUDSTER),
  ]);
  return { trusted, flagged };
}

export async function fetchDemoFire(n = 50): Promise<DemoFireResult> {
  const started = Date.now();
  const path = "/api/demo/fire";
  logBench(`POST ${path} n=${n}`);

  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ n }),
      cache: "no-store",
    });
    const durationMs = Date.now() - started;
    const body = (await res.json()) as DemoFireResult & { mode: ApiMode };

    if (!res.ok) {
      logBench(`POST ${path} -> ${res.status}`, body.reason ?? "unavailable");
      return {
        ...body,
        mode: body.mode ?? "mock",
        n,
        ourMeasurements: null,
        fetchedAt: new Date().toISOString(),
        durationMs,
        error: body.reason ?? `Benchmark returned ${res.status}.`,
      };
    }

    logBench(
      `POST ${path} -> 200`,
      body.simulated ? "simulated shape" : "live measurements",
    );
    return {
      ...body,
      fetchedAt: new Date().toISOString(),
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - started;
    logBench(`POST ${path} FAIL`, error instanceof Error ? error.message : "unknown");
    return {
      mode: "mock",
      n,
      ourMeasurements: null,
      fetchedAt: new Date().toISOString(),
      durationMs,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error running benchmark.",
    };
  }
}
