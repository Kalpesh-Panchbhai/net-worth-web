import { DEFAULT_CURRENCY } from "../constants";

interface FormatCurrencyOptions {
  // Fixed number of fraction digits. When omitted, decimals are shown only for
  // non-integer values (2 digits), matching the app's default display style.
  maxDecimals?: number;
}

/**
 * Format a number as a currency string using the browser's Intl API.
 * The symbol (₹, $, €, £) is derived from the ISO `currency` code; the
 * "en-IN" locale only controls digit grouping and symbol placement.
 */
export function formatCurrency(v: number, currency: string = DEFAULT_CURRENCY, opts?: FormatCurrencyOptions): string {
  const abs = Math.abs(v);
  const digits = opts?.maxDecimals ?? (v % 1 !== 0 ? 2 : 0);
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(abs);
  return v < 0 ? `-${formatted}` : formatted;
}

/** Format a holding unit count with 3 decimal places. */
export function formatUnits(v: number): string {
  return v.toFixed(3);
}
