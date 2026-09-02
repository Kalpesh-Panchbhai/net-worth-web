import type { AccountSummary, Transaction } from "../api/types";

export interface CashFlow {
  date: Date;
  amount: number;
}

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;
const MAX_ITER = 100;
const TOL = 1e-7;

function xnpv(rate: number, flows: CashFlow[], t0: number): number {
  let sum = 0;
  for (const f of flows) {
    const t = (f.date.getTime() - t0) / MS_PER_YEAR;
    sum += f.amount / Math.pow(1 + rate, t);
  }
  return sum;
}

function xnpvDeriv(rate: number, flows: CashFlow[], t0: number): number {
  let sum = 0;
  for (const f of flows) {
    const t = (f.date.getTime() - t0) / MS_PER_YEAR;
    sum += (-t * f.amount) / Math.pow(1 + rate, t + 1);
  }
  return sum;
}

export function xirr(input: CashFlow[]): number | null {
  if (input.length < 2) return null;
  let hasPos = false, hasNeg = false;
  for (const f of input) {
    if (f.amount > 0) hasPos = true;
    if (f.amount < 0) hasNeg = true;
  }
  if (!hasPos || !hasNeg) return null;

  const flows = [...input].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = flows[0].date.getTime();

  // Newton-Raphson
  let rate = 0.1;
  for (let i = 0; i < MAX_ITER; i++) {
    const f = xnpv(rate, flows, t0);
    if (Math.abs(f) < TOL) return rate;
    const df = xnpvDeriv(rate, flows, t0);
    if (Math.abs(df) < 1e-14) break;
    const next = rate - f / df;
    if (!isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-10) return next;
    rate = next <= -0.9999 ? -0.9999 : next;
  }

  // Bisection fallback in [-0.9999, 10]
  let lo = -0.9999, hi = 10;
  const fLo = xnpv(lo, flows, t0);
  const fHi = xnpv(hi, flows, t0);
  if (!isFinite(fLo) || !isFinite(fHi) || fLo * fHi > 0) return null;
  for (let i = 0; i < MAX_ITER; i++) {
    const mid = (lo + hi) / 2;
    const fm = xnpv(mid, flows, t0);
    if (Math.abs(fm) < TOL) return mid;
    if (fm * fLo < 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Money-weighted return for a group of accounts, from the cash flows the backend ships on each
 * summary. Flows are pooled and closed with the group's combined current value — a group's IRR is
 * the IRR of its pooled flows, so it cannot be recovered from the members' own `xirr` values by
 * any weighted average.
 *
 * Only accounts whose amounts share `currency` contribute; a member left in its own native
 * currency because no FX rate resolved would otherwise pull the pooled figure off. Returns null
 * when no member has flows.
 */
export function pooledXirr(
  accounts: Array<Pick<AccountSummary, "cashFlows" | "currentDayValue" | "displayCurrency">>,
  currency: string,
): number | null {
  const flows: CashFlow[] = [];
  let currentValue = 0;
  for (const a of accounts) {
    if (a.displayCurrency !== currency) continue;
    if (!a.cashFlows?.length) continue;
    for (const f of a.cashFlows) flows.push({ date: new Date(`${f.date}T00:00:00Z`), amount: f.amount });
    currentValue += a.currentDayValue;
  }
  if (flows.length === 0) return null;
  if (currentValue > 0) flows.push({ date: new Date(), amount: currentValue });
  return xirr(flows);
}

// Build cashflows from transactions (cumulative invested per holding) + current value.
// Convention: investment outflow = negative, current value = positive inflow.
export function buildCashflows(
  txns: Transaction[],
  currentValue: number,
  today: Date = new Date(),
): CashFlow[] {
  const byHolding = new Map<number, Transaction[]>();
  for (const t of txns) {
    const arr = byHolding.get(t.holdingId);
    if (arr) arr.push(t); else byHolding.set(t.holdingId, [t]);
  }
  const flows: CashFlow[] = [];
  for (const arr of byHolding.values()) {
    const sorted = [...arr].sort((a, b) => a.txnDate.localeCompare(b.txnDate));
    let prev = 0;
    for (const t of sorted) {
      const delta = t.invested - prev;
      if (delta !== 0) flows.push({ date: new Date(t.txnDate + "T00:00:00Z"), amount: -delta });
      prev = t.invested;
    }
  }
  if (currentValue > 0) flows.push({ date: today, amount: currentValue });
  return flows;
}

export function computeXirr(txns: Transaction[], currentValue: number): number | null {
  const flows = buildCashflows(txns, currentValue);
  return xirr(flows);
}
