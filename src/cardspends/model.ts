import type { CardSpend } from "../api/types";
import { formatCurrency } from "../utils/format";

/** "2026-10" for the month containing `d`, in local time. */
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export const shiftMonth = (key: string, by: number) => {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + by, 1));
};

export const daysInMonth = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

const isoDay = (d: Date) => `${monthKey(d)}-${String(d.getDate()).padStart(2, "0")}`;
export const todayIso = () => isoDay(new Date());
export const yesterdayIso = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoDay(d);
};

export const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

export const monthLabel = (key: string, style: "long" | "short" = "long") =>
  new Date(`${key}-01T00:00:00`).toLocaleDateString("en-IN", style === "long" ? { month: "long", year: "numeric" } : { month: "short" });

/** A purchase with the refunds linked to it; `net` is what it really cost. */
export interface Purchase extends CardSpend {
  refunds: CardSpend[];
  refunded: number;
  net: number;
}

/** Hangs each refund off its purchase, so the list shows purchases only. */
export function buildPurchases(spends: CardSpend[]): Purchase[] {
  const byPurchase = new Map<number, CardSpend[]>();
  for (const s of spends) if (s.refundOf != null) byPurchase.set(s.refundOf, [...(byPurchase.get(s.refundOf) ?? []), s]);
  return spends.filter(s => s.refundOf == null).map(s => {
    const refunds = (byPurchase.get(s.id) ?? []).sort((a, b) => a.spentOn.localeCompare(b.spentOn));
    const refunded = -refunds.reduce((sum, r) => sum + r.amount, 0);
    return { ...s, refunds, refunded, net: s.amount - refunded };
  });
}

/** Running total of net spend for each day of the month (index 0 = day 1). */
export function cumulativeByDay(purchases: Purchase[], month: string): number[] {
  const daily = new Array(daysInMonth(month)).fill(0);
  for (const p of purchases) daily[Number(p.spentOn.slice(8, 10)) - 1] += p.net;
  let run = 0;
  return daily.map(d => (run += d));
}

/** Net spend per day of the month (index 0 = day 1). */
export function dailyByDay(purchases: Purchase[], month: string): number[] {
  const daily = new Array(daysInMonth(month)).fill(0);
  for (const p of purchases) daily[Number(p.spentOn.slice(8, 10)) - 1] += p.net;
  return daily;
}

/** Days are capped at this multiple of the median day, so one big purchase is not read as a habit. */
const FORECAST_CAP = 3;
/** Days of this month's data after which last month no longer shapes the daily rate. */
const FORECAST_RAMP_DAYS = 10;

/** Month-end spend forecast; `low`–`high` spans about one standard deviation of the days left. */
export interface Forecast {
  expected: number;
  low: number;
  high: number;
}

/** Mean and standard deviation of daily spend, with days capped at FORECAST_CAP × the median. */
function dailyStats(days: number[]): { mean: number; sd: number } {
  const sorted = [...days].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const capped = median > 0 ? days.map(d => Math.min(d, median * FORECAST_CAP)) : days;
  const mean = capped.reduce((s, d) => s + d, 0) / capped.length;
  const sd = Math.sqrt(capped.reduce((s, d) => s + (d - mean) ** 2, 0) / capped.length);
  return { mean, sd };
}

/**
 * Where this month's spend should end up: what is spent so far plus a daily rate for the days left.
 * The rate comes from completed days only (today is still running), blended with last month's while
 * this month has under FORECAST_RAMP_DAYS of data. Null when there is nothing to go on.
 */
export function forecastMonth(daily: number[], todayIdx: number, prevDaily: number[] | null): Forecast | null {
  const past = daily.slice(0, todayIdx);
  const prev = prevDaily && prevDaily.some(d => d !== 0) ? dailyStats(prevDaily) : null;
  if (past.length === 0 && !prev) return null;
  const now = past.length ? dailyStats(past) : { mean: 0, sd: 0 };
  const w = prev ? Math.min(1, past.length / FORECAST_RAMP_DAYS) : 1;
  const rate = w * now.mean + (1 - w) * (prev?.mean ?? 0);
  const sd = w * now.sd + (1 - w) * (prev?.sd ?? 0);

  const spentPast = past.reduce((s, d) => s + d, 0);
  const today = daily[todayIdx] ?? 0;
  const daysAfterToday = daily.length - todayIdx - 1;
  // Today counts at whichever is higher: what is already spent today or a typical day.
  const expected = spentPast + Math.max(today, rate) + rate * daysAfterToday;
  const spread = sd * Math.sqrt(daysAfterToday + 1);
  return { expected, low: Math.max(spentPast + today, expected - spread), high: expected + spread };
}

/**
 * Search box syntax: ">5000", "<500", "1000-2000" filter by amount; anything else matches the card
 * name, the last 4 digits or the amount's digits.
 */
export interface SpendQuery {
  min: number | null;
  max: number | null;
  text: string;
}

export function parseQuery(raw: string): SpendQuery {
  const q = raw.trim().toLowerCase().replace(/[,₹\s]/g, "");
  let m: RegExpMatchArray | null;
  if ((m = q.match(/^>=?(\d+(?:\.\d+)?)$/))) return { min: Number(m[1]), max: null, text: "" };
  if ((m = q.match(/^<=?(\d+(?:\.\d+)?)$/))) return { min: null, max: Number(m[1]), text: "" };
  if ((m = q.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/))) return { min: Number(m[1]), max: Number(m[2]), text: "" };
  return { min: null, max: null, text: q };
}

export function matchesQuery(p: Purchase, q: SpendQuery): boolean {
  if (q.min != null && p.amount < q.min) return false;
  if (q.max != null && p.amount > q.max) return false;
  if (!q.text) return true;
  return p.accountName.toLowerCase().replace(/\s/g, "").includes(q.text)
    || (p.cardLast4 ?? "").includes(q.text)
    || String(p.amount).includes(q.text);
}

export type SourceFilter = "manual" | "email" | "refunded" | "edited";

export function matchesSource(p: Purchase, f: SourceFilter): boolean {
  switch (f) {
    case "manual": return p.source === "manual";
    case "email": return p.source === "email";
    case "refunded": return p.refunded > 0;
    case "edited": return p.edited;
  }
}

export type IssueKind = "large" | "billLike" | "duplicate" | "partialRefund";

export interface Issue {
  /** Stable per purchase and kind, so "It's fine" hides just this warning. */
  key: string;
  kind: IssueKind;
  purchase: Purchase;
  message: string;
}

/** Big multiple of a typical large spend that makes a purchase stand out. */
const LARGE_FACTOR = 3;
/** A purchase this close to the card's debt is probably a bill payment read as a purchase. */
const BILL_TOLERANCE = 0.1;
/** Below this many purchases there is no meaningful "typical" spend to compare against. */
const MIN_HISTORY = 5;

/**
 * Rows worth a second look: amounts far above normal, amounts that look like a card bill, likely
 * duplicates, and refunds that kept part of the money. `history` (this and last month) sets "normal".
 */
export function findIssues(purchases: Purchase[], history: Purchase[], debtByAccount: Map<number, number>, reviewed: Set<string>): Issue[] {
  const out: Issue[] = [];
  const add = (kind: IssueKind, p: Purchase, message: string) => {
    const key = `${kind}:${p.id}`;
    if (!reviewed.has(key)) out.push({ key, kind, purchase: p, message });
  };

  // "Typical large spend" = the 75th-percentile amount, so a couple of huge outliers do not raise the bar.
  const amounts = history.map(p => p.amount).sort((a, b) => a - b);
  const typical = amounts.length >= MIN_HISTORY ? amounts[Math.floor(amounts.length * 0.75)] : null;

  for (const p of purchases) {
    const debt = debtByAccount.get(p.accountId) ?? 0;
    if (debt > 0 && p.amount >= debt * (1 - BILL_TOLERANCE)) {
      add("billLike", p, "Close to the card's whole debt. Is this a bill payment?");
    } else if (typical != null && p.amount > typical * LARGE_FACTOR) {
      add("large", p, `Much bigger than usual (over ${LARGE_FACTOR}× your typical large spend).`);
    }
    if (p.refunded > 0 && p.net > 0) add("partialRefund", p, "Refund was partial. Was the kept amount expected?");
  }

  // Same card and amount within a day of each other.
  const sorted = [...purchases].sort((a, b) => a.spentOn.localeCompare(b.spentOn) || a.id - b.id);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      const gap = (Date.parse(b.spentOn) - Date.parse(a.spentOn)) / 86_400_000;
      if (gap > 1) break;
      if (a.accountId === b.accountId && a.amount === b.amount) add("duplicate", b, `Same amount on the same card as another spend on ${dayLabel(a.spentOn)}.`);
    }
  }
  return out;
}

// Card spend amounts always show 2 decimals, including totals, badges and chart labels.
export const fmt = (v: number, currency?: string) => formatCurrency(v, currency, { maxDecimals: 2 });
export const fmtShort = fmt;
