import { DEFAULT_CURRENCY } from "../constants";

interface FormatCurrencyOptions {
  // Fixed number of fraction digits. When omitted, decimals are shown only for
  // non-integer values (2 digits), matching the app's default display style.
  maxDecimals?: number;
}

// Digit grouping and symbol placement follow the currency's home locale, so USD reads
// $100,000 rather than the Indian $1,00,000 grouping a single hard-coded locale gave every
// currency. Only the four supported codes need an entry.
const LOCALE_BY_CURRENCY: Record<string, string> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
};

// Intl.NumberFormat construction is expensive and these were being built once per rendered
// cell — thousands of times on a long list. There are only a handful of distinct shapes.
const formatterCache = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, digits: number, compact: boolean): Intl.NumberFormat {
  const key = `${currency}|${digits}|${compact}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const created = new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency] ?? "en-US", {
    style: "currency",
    currency,
    // Compact notation needs a fraction digit or it rounds 1.2M down to "1M", losing an order of
    // magnitude on every axis tick. minimumFractionDigits stays 0 so a round 2M reads "2M".
    minimumFractionDigits: compact ? 0 : digits,
    maximumFractionDigits: compact ? 1 : digits,
    ...(compact ? { notation: "compact" as const, compactDisplay: "short" as const } : {}),
  });
  formatterCache.set(key, created);
  return created;
}

/**
 * Format a number as a currency string. The symbol (₹, $, €, £) comes from the ISO `currency`
 * code and the grouping from that currency's own locale.
 */
export function formatCurrency(v: number, currency: string = DEFAULT_CURRENCY, opts?: FormatCurrencyOptions): string {
  const digits = opts?.maxDecimals ?? (v % 1 !== 0 ? 2 : 0);
  const formatted = formatter(currency, digits, false).format(Math.abs(v));
  return v < 0 ? `-${formatted}` : formatted;
}

/**
 * Short form for chart axes and dense badges: ₹1.2Cr, $1.2M, €1.2M.
 * Indian numbering uses lakh/crore, which `Intl` renders natively for the en-IN locale, so the
 * abbreviation always matches the currency instead of assuming every chart is in rupees.
 */
export function formatCurrencyCompact(v: number, currency: string = DEFAULT_CURRENCY): string {
  const formatted = formatter(currency, 1, true).format(Math.abs(v));
  return v < 0 ? `-${formatted}` : formatted;
}

/** Format a holding unit count with 3 decimal places. */
export function formatUnits(v: number): string {
  return v.toFixed(3);
}
