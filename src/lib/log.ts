/**
 * Greppable, level-tagged logging. This is our only debugging surface during the
 * live demo, so every request, chain call, and failure goes through here.
 */
type Scope = "api" | "chain" | "bench";

function line(scope: Scope, level: "OK" | "WARN" | "FAIL", msg: string) {
  const stamp = new Date().toISOString().slice(11, 23);
  const text = `[${scope}] ${level} ${stamp} ${msg}`;
  if (level === "FAIL") console.error(text);
  else if (level === "WARN") console.warn(text);
  else console.log(text);
}

export const log = {
  ok: (scope: Scope, msg: string) => line(scope, "OK", msg),
  warn: (scope: Scope, msg: string) => line(scope, "WARN", msg),
  fail: (scope: Scope, msg: string, err?: unknown) => {
    const detail =
      err instanceof Error ? `${err.name}: ${err.message}` : err ? String(err) : "";
    line(scope, "FAIL", detail ? `${msg} - ${detail}` : msg);
    if (err instanceof Error && err.stack) console.error(err.stack);
  },
};

/** Wraps a route handler so entry, exit, duration, and failures are always logged. */
export async function timed<T>(
  scope: Scope,
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const out = await fn();
    log.ok(scope, `${label} -> done in ${Date.now() - t0}ms`);
    return out;
  } catch (err) {
    log.fail(scope, `${label} -> threw after ${Date.now() - t0}ms`, err);
    throw err;
  }
}

/** uint256 does not survive JSON.stringify. Convert bigints to decimal strings. */
export function jsonSafe<T>(value: T): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, jsonSafe(v)]),
    );
  }
  return value;
}
