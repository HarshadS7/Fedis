const USDC_DECIMALS = 6;

export function formatUsdc(raw: string | number, fractionDigits = 0): string {
  const value = Number(raw) / 10 ** USDC_DECIMALS;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatBps(bps: string | number, fractionDigits = 2): string {
  const value = Number(bps) / 100;
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatInteger(raw: string | number): string {
  return Number(raw).toLocaleString("en-US");
}
