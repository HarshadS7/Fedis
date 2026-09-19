import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Abi,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
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

/**
 * Write client. The middleware key is authorized on TaskPolicy and is BondVault's
 * validation router, so it can drive the whole task lifecycle for the demo.
 * Anvil account 0 by default — never a real key.
 */
const MIDDLEWARE_KEY = (process.env.FIDES_MIDDLEWARE_KEY ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as `0x${string}`;

let _wallet: ReturnType<typeof createWalletClient> | null = null;
export function wallet() {
  if (!_wallet) {
    _wallet = createWalletClient({
      account: privateKeyToAccount(MIDDLEWARE_KEY),
      chain: anvil,
      transport: http(RPC_URL),
    });
  }
  return _wallet;
}

export function middlewareAddress(): `0x${string}` {
  return privateKeyToAccount(MIDDLEWARE_KEY).address;
}

const root = process.cwd();

/**
 * Statically scoped to contracts/ so the bundler traces only that subtree. A fully
 * dynamic path here makes Turbopack trace the whole project into the server bundle.
 */
function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, "contracts", rel), "utf8")) as T;
}

export type Deployments = {
  chainId: number;
  agentVault: string;
  premiumEngine: string;
  userUnderwriting: string;
  usdc: string;
  identityRegistry: string;
  middleware?: string;
  taskPolicy?: string;
  bondVault?: string;
};

let _deployments: Deployments | null | undefined;
export function deployments(): Deployments | null {
  if (_deployments !== undefined) return _deployments;
  try {
    _deployments = readJson<Deployments>(`deployments/${CHAIN_ID}.json`);
    log.ok("chain", `loaded addresses for chain ${CHAIN_ID}`);
  } catch {
    log.warn("chain", `no deployments/${CHAIN_ID}.json - live mode unavailable`);
    _deployments = null;
  }
  return _deployments;
}

const _abis: Record<string, Abi> = {};
export type ContractName =
  | "AgentVault"
  | "PremiumEngine"
  | "UserUnderwriting"
  | "TaskPolicy"
  | "BondVault"
  | "MockUSDC";

export function abi(name: ContractName): Abi {
  if (!_abis[name]) _abis[name] = readJson<Abi>(`abi/${name}.json`);
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
