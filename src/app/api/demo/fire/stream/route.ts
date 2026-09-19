import { benchNodeReachable, benchRpcUrl, mockStreamEvents } from "@/lib/bench";
import { runFireScript } from "../run-script";
import { resolveMode } from "@/lib/chain";
import { log } from "@/lib/log";
import type { BenchStreamEvent } from "@/lib/bench";

export const dynamic = "force-dynamic";

function sse(data: BenchStreamEvent): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * GET /api/demo/fire/stream?n=50
 * Server-sent events for live benchmark progress.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const n = Math.max(1, Math.min(500, Number(url.searchParams.get("n") ?? "50")));

  log.ok("bench", `GET /api/demo/fire/stream n=${n}`);

  const mode = await resolveMode();
  const benchUp = await benchNodeReachable();
  const useLive = mode === "live" && benchUp;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: BenchStreamEvent) => {
        controller.enqueue(new TextEncoder().encode(sse(event)));
        log.ok("bench", `stream ${event.type}`);
      };

      send({ type: "connected", mode: useLive ? "live" : "mock" });

      void (async () => {
        try {
          if (useLive) {
            send({ type: "stage", label: `Running fire.mjs on ${benchRpcUrl()}` });
            await runFireScript(n, send);
          } else {
            await mockStreamEvents(n, send);
          }
        } catch (err) {
          send({
            type: "error",
            message: err instanceof Error ? err.message : "stream failed",
          });
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
