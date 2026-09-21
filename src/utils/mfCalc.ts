import type { MfNavPoint } from "../api/types";

// Return calculators over a fund's NAV curve. Points are ascending by ISO date.

export interface CalcResult {
  invested: number;
  value: number;
  gain: number;
  /** Annualised return as a fraction (CAGR for lumpsum, XIRR for SIP), or null if uncomputable. */
  annualized: number | null;
}

/** Newest NAV at or before an ISO date, or null when the series starts after it. */
function navOnOrBefore(points: MfNavPoint[], iso: string): number | null {
  let found: number | null = null;
  for (const p of points) {
    if (p.date <= iso) found = p.nav;
    else break;
  }
  return found;
}

function isoMinusYears(iso: string, years: number): string {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/** Years of history available in the series. */
export function historyYears(points: MfNavPoint[]): number {
  if (points.length < 2) return 0;
  const first = new Date(points[0].date).getTime();
  const last = new Date(points[points.length - 1].date).getTime();
  return (last - first) / (365.25 * 24 * 3600 * 1000);
}

export interface GrowthPoint { date: string; value: number; invested: number; }

/**
 * Portfolio value vs cumulative amount invested over the selected window, matching the calculator.
 * Lumpsum invested is flat; SIP invested steps up each month. Used to plot both lines.
 */
export function growthSeries(points: MfNavPoint[], mode: "sip" | "lumpsum", amount: number, years: number): GrowthPoint[] {
  if (points.length < 2 || amount <= 0) return [];
  const endIso = points[points.length - 1].date;
  const startIso = isoMinusYears(endIso, years) < points[0].date ? points[0].date : isoMinusYears(endIso, years);
  const windowPts = points.filter(p => p.date >= startIso);
  if (windowPts.length < 2) return [];

  if (mode === "lumpsum") {
    const startNav = navOnOrBefore(points, startIso) ?? windowPts[0].nav;
    if (startNav <= 0) return [];
    const units = amount / startNav;
    return windowPts.map(p => ({ date: p.date, value: Math.round(units * p.nav), invested: amount }));
  }

  // SIP: build a monthly schedule of cumulative units + invested, then read it off at each point.
  const endMs = new Date(endIso).getTime();
  const schedule: { ms: number; cumUnits: number; cumInvested: number }[] = [];
  let cumUnits = 0;
  let cumInvested = 0;
  const cur = new Date(startIso);
  while (cur.getTime() < endMs) {
    const iso = cur.toISOString().slice(0, 10);
    const nav = navOnOrBefore(points, iso);
    if (nav != null && nav > 0) { cumUnits += amount / nav; cumInvested += amount; schedule.push({ ms: cur.getTime(), cumUnits, cumInvested }); }
    cur.setMonth(cur.getMonth() + 1);
  }
  if (schedule.length === 0) return [];

  const out: GrowthPoint[] = [];
  let si = 0;
  for (const p of windowPts) {
    const pms = new Date(p.date).getTime();
    if (pms < schedule[0].ms) continue;
    while (si + 1 < schedule.length && schedule[si + 1].ms <= pms) si++;
    const s = schedule[si];
    out.push({ date: p.date, value: Math.round(s.cumUnits * p.nav), invested: s.cumInvested });
  }
  return out;
}

/** Lumpsum: invest once `years` ago, valued at the latest NAV. */
export function lumpsum(points: MfNavPoint[], amount: number, years: number): CalcResult | null {
  if (points.length < 2 || amount <= 0) return null;
  const endNav = points[points.length - 1].nav;
  const startIso = isoMinusYears(points[points.length - 1].date, years);
  const startNav = navOnOrBefore(points, startIso);
  if (startNav == null || startNav <= 0) return null;
  const units = amount / startNav;
  const value = units * endNav;
  const annualized = Math.pow(value / amount, 1 / years) - 1;
  return { invested: amount, value, gain: value - amount, annualized };
}

/** SIP: invest `monthly` at the start of each month over `years`, valued at the latest NAV. */
export function sip(points: MfNavPoint[], monthly: number, years: number): CalcResult | null {
  if (points.length < 2 || monthly <= 0) return null;
  const endIso = points[points.length - 1].date;
  const endNav = points[points.length - 1].nav;
  const startIso = isoMinusYears(endIso, years);
  if (startIso < points[0].date) return null;

  const YEAR_MS = 365.25 * 24 * 3600 * 1000;
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const flows: { years: number; amt: number }[] = [];
  let units = 0;
  let invested = 0;
  // One installment per month up to (but not including) the end, so a 5-year SIP is 60 of them.
  // `years` here is time measured forward from the first installment — the XIRR reference point.
  const cur = new Date(startIso);
  while (cur.getTime() < endMs) {
    const iso = cur.toISOString().slice(0, 10);
    const nav = navOnOrBefore(points, iso);
    if (nav != null && nav > 0) {
      units += monthly / nav;
      invested += monthly;
      flows.push({ years: (cur.getTime() - startMs) / YEAR_MS, amt: -monthly });
    }
    cur.setMonth(cur.getMonth() + 1);
  }
  if (invested <= 0) return null;
  const value = units * endNav;
  flows.push({ years: (endMs - startMs) / YEAR_MS, amt: value });
  return { invested, value, gain: value - invested, annualized: xirr(flows) };
}

/**
 * Money-weighted annualised rate: solves NPV(r)=0 by bisection, with each flow's `years` measured
 * forward from the first flow — investments negative, the closing value positive.
 */
function xirr(flows: { years: number; amt: number }[]): number | null {
  const npv = (r: number) => flows.reduce((s, f) => s + f.amt / Math.pow(1 + r, f.years), 0);
  let lo = -0.9999;
  let hi = 10;
  let flo = npv(lo);
  let fhi = npv(hi);
  if (isNaN(flo) || isNaN(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const fmid = npv(mid);
    if (Math.abs(fmid) < 1e-6) return mid;
    if (flo * fmid < 0) { hi = mid; fhi = fmid; } else { lo = mid; flo = fmid; }
  }
  return (lo + hi) / 2;
}
