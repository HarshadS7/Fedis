/** Client-safe chain id — mirrors FIDES_CHAIN_ID without importing server chain module. */
const CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_FIDES_CHAIN_ID ??
    process.env.FIDES_CHAIN_ID ??
    31337,
);

/** Monad mainnet / testnet explorer links; local anvil has no public explorer. */
export function explorerTxUrl(hash: string): string | null {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;
  if (CHAIN_ID === 10143) return `https://testnet.monad.xyz/tx/${hash}`;
  if (CHAIN_ID === 143) return `https://explorer.monad.xyz/tx/${hash}`;
  return null;
}
