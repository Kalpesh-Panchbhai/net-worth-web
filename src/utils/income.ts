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
