import type { Income } from "../api/types";

export type IncomeGrouping = "month" | "year" | "fy" | "source" | "tag";

/** A grouped income point in the shape the income charts consume. */
export interface IncomeChartPoint { label: string; net: number; tax: number; }

export function incomeYearKey(d: string): string { return d.slice(0, 4); }

export function incomeFyKey(d: string): string {
  const dt = new Date(d + "T00:00:00");
  const m = dt.getMonth(); // 0-based
  const y = dt.getFullYear();
  const startYear = m >= 3 ? y : y - 1; // April (month 3) onwards = current FY
  return `FY ${startYear}-${String(startYear + 1).slice(2)}`;
}

/**
 * Dominant converted currency across incomes. Amounts are only comparable within one currency (a
 * row whose FX lookup failed keeps its native one), so charts/totals use the most common code.
 */
export function pickIncomeCurrency(incomes: Income[], fallback: string): string {
  const counts = new Map<string, number>();
  for (const inc of incomes) counts.set(inc.convertedCurrency, (counts.get(inc.convertedCurrency) ?? 0) + 1);
  let ccy = fallback, most = 0;
  for (const [code, n] of counts) if (n > most) { ccy = code; most = n; }
  return ccy;
}

interface Lookups {
  sourceLookup: Map<number, string>;
  tagLookup: Map<number, string>;
  displayCcy: string;
}

/** Group incomes into chart points, chronologically for time groupings and by name otherwise. */
export function buildIncomeChartData(incomes: Income[], grouping: IncomeGrouping, { sourceLookup, tagLookup, displayCcy }: Lookups): IncomeChartPoint[] {
  const map = new Map<string, { sortKey: string; net: number; tax: number }>();
  for (const inc of incomes) {
    if (inc.convertedCurrency !== displayCcy) continue;
    let key: string;
    let sortKey: string;
    switch (grouping) {
      case "month": {
        const raw = inc.creditedDate.slice(0, 7);
        const [y, m] = raw.split("-");
        key = new Date(Number(y), Number(m) - 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
        sortKey = raw;
        break;
      }
      case "year": key = incomeYearKey(inc.creditedDate); sortKey = key; break;
      case "fy": key = incomeFyKey(inc.creditedDate); sortKey = key; break;
      case "source": key = sourceLookup.get(inc.incomeSourceId) ?? "Unknown"; sortKey = key; break;
      case "tag": key = tagLookup.get(inc.incomeTagId) ?? "Unknown"; sortKey = key; break;
    }
    const prev = map.get(key) || { sortKey, net: 0, tax: 0 };
    map.set(key, { sortKey, net: prev.net + inc.convertedNetAmount, tax: prev.tax + inc.convertedTaxPaid });
  }
  return Array.from(map.entries())
    .sort(([, a], [, b]) => a.sortKey.localeCompare(b.sortKey))
    .map(([label, val]) => ({ label, net: val.net, tax: val.tax }));
}

/**
 * Elapsed span between two ISO dates, in average-length months (365.25/12 days), anchored to the
 * 1st of the start date's month and counted inclusively through the end date.
 * e.g. 1–29 Nov ⇒ 29 days; 1 Nov–31 Dec ⇒ 61 days. Never zero, so it's always safe to divide by.
 */
function incomeMonthsSpan(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 1;
  const DAYS_PER_MONTH = 365.25 / 12;
  const startMs = new Date(startDate.slice(0, 7) + "-01T00:00:00").getTime();
  const days = (new Date(endDate + "T00:00:00").getTime() - startMs) / 86400000 + 1;
  return Math.max(days, 1) / DAYS_PER_MONTH;
}

/**
 * Average-monthly-income chart points: each group's income divided by its elapsed span in months.
 * Mirrors the Incomes page — Month accumulates from the first income (a running monthly rate), while
 * Source/Tag/Year/FY are self-contained (each group ÷ its own date span). Same order as
 * buildIncomeChartData so the two share an x-axis.
 */
export function buildIncomeAvgChartData(incomes: Income[], grouping: IncomeGrouping, { sourceLookup, tagLookup, displayCcy }: Lookups): IncomeChartPoint[] {
  const groups = new Map<string, { sortKey: string; net: number; tax: number; minDate: string; maxDate: string }>();
  let globalMin = "";
  for (const inc of incomes) {
    if (inc.convertedCurrency !== displayCcy) continue;
    if (!globalMin || inc.creditedDate < globalMin) globalMin = inc.creditedDate;
    let key: string;
    let sortKey: string;
    switch (grouping) {
      case "month": {
        const raw = inc.creditedDate.slice(0, 7);
        const [y, m] = raw.split("-");
        key = new Date(Number(y), Number(m) - 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
        sortKey = raw;
        break;
      }
      case "year": key = incomeYearKey(inc.creditedDate); sortKey = key; break;
      case "fy": key = incomeFyKey(inc.creditedDate); sortKey = key; break;
      case "source": key = sourceLookup.get(inc.incomeSourceId) ?? "Unknown"; sortKey = key; break;
      case "tag": key = tagLookup.get(inc.incomeTagId) ?? "Unknown"; sortKey = key; break;
    }
    const g = groups.get(key) || { sortKey, net: 0, tax: 0, minDate: "", maxDate: "" };
    if (!g.minDate || inc.creditedDate < g.minDate) g.minDate = inc.creditedDate;
    if (inc.creditedDate > g.maxDate) g.maxDate = inc.creditedDate;
    g.net += inc.convertedNetAmount;
    g.tax += inc.convertedTaxPaid;
    groups.set(key, g);
  }

  const entries = Array.from(groups.entries()).sort(([, a], [, b]) => a.sortKey.localeCompare(b.sortKey));
  if (grouping === "month") {
    // Continuous timeline: totals accumulate oldest→newest, the span runs from the first income.
    let cNet = 0, cTax = 0, cMax = "";
    return entries.map(([label, g]) => {
      cNet += g.net; cTax += g.tax;
      if (g.maxDate > cMax) cMax = g.maxDate;
      const months = incomeMonthsSpan(globalMin, cMax);
      return { label, net: cNet / months, tax: cTax / months };
    });
  }
  // Self-contained groups: each divided by its own date span.
  return entries.map(([label, g]) => {
    const months = incomeMonthsSpan(g.minDate, g.maxDate);
    return { label, net: g.net / months, tax: g.tax / months };
  });
}

/**
 * Future period labels for the cumulative chart's forecast. Only time-based groupings can be
 * projected (source/tag are categories, not a timeline); labels match buildIncomeChartData's format.
 */
export function buildIncomeForecastLabels(incomes: Income[], grouping: IncomeGrouping): string[] {
  if (grouping !== "month" && grouping !== "year" && grouping !== "fy") return [];
  let maxDate = "";
  for (const inc of incomes) if (inc.creditedDate > maxDate) maxDate = inc.creditedDate;
  if (!maxDate) return [];
  const out: string[] = [];
  if (grouping === "month") {
    const [y, m] = maxDate.slice(0, 7).split("-").map(Number);
    let yy = y, mm = m; // mm is 1-based
    for (let k = 0; k < 6; k++) {
      mm++; if (mm > 12) { mm = 1; yy++; }
      out.push(new Date(yy, mm - 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }));
    }
  } else if (grouping === "year") {
    let y = Number(maxDate.slice(0, 4));
    for (let k = 0; k < 3; k++) out.push(String(++y));
  } else {
    const dt = new Date(maxDate + "T00:00:00");
    let startYear = dt.getMonth() >= 3 ? dt.getFullYear() : dt.getFullYear() - 1;
    for (let k = 0; k < 3; k++) { startYear++; out.push(`FY ${startYear}-${String(startYear + 1).slice(2)}`); }
  }
  return out;
}
