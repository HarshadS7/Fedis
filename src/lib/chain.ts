import fs from "node:fs";
import path from "node:path";
import { createPublicClient, defineChain, http, type Abi, type PublicClient } from "viem";
import { log } from "./log";

export type ApiMode = "mock" | "live";

const RPC_URL = process.env.FIDES_RPC_URL ?? "http://127.0.0.1:8545";
const CHAIN_ID = Number(process.env.FIDES_CHAIN_ID ?? 31337);
/** Set FIDES_API_MODE=mock to force fixtures even when a chain is reachable. */
const FORCED_MODE = process.env.FIDES_API_MODE as ApiMode | undefined;

const anvil = defineChain({
  id: CHAIN_ID,
  name: `chain-${CHAIN_ID}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

let _client: PublicClient | null = null;
export function client(): PublicClient {
  if (!_client) {
    _client = createPublicClient({ chain: anvil, transport: http(RPC_URL) });
  }
  return _client;
}

const root = process.cwd();

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")) as T;
}

export type Deployments = {
  chainId: number;
  agentVault: string;
  premiumEngine: string;
  userUnderwriting: string;
  usdc: string;
  identityRegistry: string;
  middleware?: string;
};

let _deployments: Deployments | null | undefined;
export function deployments(): Deployments | null {
  if (_deployments !== undefined) return _deployments;
  try {
    _deployments = readJson<Deployments>(`contracts/deployments/${CHAIN_ID}.json`);
    log.ok("chain", `loaded addresses for chain ${CHAIN_ID}`);
  } catch (err) {
    log.warn("chain", `no deployments/${CHAIN_ID}.json - live mode unavailable`);
    _deployments = null;
  }
  return _deployments;
}

const _abis: Record<string, Abi> = {};
export function abi(name: "AgentVault" | "PremiumEngine" | "UserUnderwriting"): Abi {
  if (!_abis[name]) _abis[name] = readJson<Abi>(`contracts/abi/${name}.json`);
  return _abis[name];
}

/**
 * Live only if we are not forced to mock, addresses exist, AND the node answers.
 * Result is cached briefly so we do not probe the RPC on every single request,
 * but short enough that a chain coming up mid-demo is picked up without a restart.
 */
let _probe: { at: number; live: boolean } | null = null;
const PROBE_TTL_MS = 5_000;

export async function resolveMode(): Promise<ApiMode> {
  if (FORCED_MODE === "mock") return "mock";
  if (!deployments()) return "mock";

  const now = Date.now();
  if (_probe && now - _probe.at < PROBE_TTL_MS) return _probe.live ? "live" : "mock";

  try {
    const block = await client().getBlockNumber();
    _probe = { at: now, live: true };
    log.ok("chain", `node reachable at ${RPC_URL}, block ${block}`);
    return "live";
  } catch (err) {
    _probe = { at: now, live: false };
    log.warn("chain", `node unreachable at ${RPC_URL} - serving mocks. ${String(err).slice(0, 120)}`);
    return "mock";
  }
}

export const rpcUrl = RPC_URL;
export const chainId = CHAIN_ID;
