import { spawn } from "node:child_process";
import path from "node:path";
import {
  benchRpcUrl,
  demoFireFromBench,
  readBenchFile,
  type BenchFile,
  type BenchStreamEvent,
} from "@/lib/bench";
import type { DemoFireResult } from "@/lib/types";

function benchOutPath(): string {
  return path.join(process.cwd(), "contracts", "bench-latest.json");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Spawn fire.mjs via shell so Turbopack does not try to bundle the script path.
 */
export function runFireScript(
  n: number,
  onEvent: (event: BenchStreamEvent) => void,
): Promise<DemoFireResult | null> {
  return new Promise((resolve) => {
    const out = benchOutPath();
    const rpc = benchRpcUrl();
    const scriptCwd = path.join(process.cwd(), "contracts", "script");
    const cmd =
      `node fire.mjs --n ${n} --rpc ${shellQuote(rpc)} --out ${shellQuote(out)}`;

    const child = spawn("sh", ["-c", cmd], { cwd: scriptCwd });

    let buffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.includes("[bench-event]")) continue;
        const json = line.slice(line.indexOf("[bench-event]") + "[bench-event]".length).trim();
        try {
          const event = JSON.parse(json) as Record<string, unknown>;
          if (event.type === "tx" && typeof event.hash === "string") {
            onEvent({
              type: "tx",
              workload: String(event.workload),
              hash: event.hash,
              latest: Boolean(event.latest),
              safe: Boolean(event.safe),
              finalized: Boolean(event.finalized),
            });
          } else if (event.type === "done" && event.payload) {
            const file = event.payload as BenchFile;
            const result = demoFireFromBench(file, "live");
            onEvent({ type: "done", result });
            resolve(result);
          }
        } catch {
          // ignore malformed bench-event lines
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      console.error("[bench]", chunk.toString());
    });

    child.on("close", (code) => {
      if (code !== 0) {
        onEvent({ type: "error", message: `fire.mjs exited with code ${code}` });
        resolve(null);
        return;
      }
      const file = readBenchFile();
      if (file) {
        const result = demoFireFromBench(file, "live");
        onEvent({ type: "done", result });
        resolve(result);
      } else {
        onEvent({ type: "error", message: "bench output file missing after run" });
        resolve(null);
      }
    });
  });
}
