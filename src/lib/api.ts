import { MOCK_VAULTS } from "./mock";
import type { ApiMode, FetchVaultsResult, VaultInfo } from "./types";

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
