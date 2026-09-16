/**
 * What a goal's current value is measured against. A linked source reads the live value of an
 * entity (net worth, an account/broker, a holding, a watchlist), so progress updates on its own;
 * `manual` uses the goal's own `currentAmount`. Absent source === manual (back-compat).
 */
export type GoalSource =
  | { kind: "manual" }
  | { kind: "networth" }
  | { kind: "account"; id: number; label: string }
  | { kind: "watchlist"; id: number; label: string }
  | { kind: "holding"; id: number; accountId: number; label: string };

/**
 * A savings/net-worth goal. Persisted per-user via `useSyncedConfig` (backend `user-config` store
 * with a localStorage cache), so goals follow the user across devices.
 */
export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  /** Amount already saved. Used only when `source` is manual (or absent). */
  currentAmount: number;
  /** What the current value is read from; defaults to manual when absent. */
  source?: GoalSource;
  /** Fixed monthly contribution assumed for the projection. */
  monthlyContribution: number;
  /** Expected annual return, as a percent (12 === 12%). */
  annualReturnPct: number;
  /** Optional deadline, YYYY-MM-DD. When set, the goal is scored on-track / behind against it. */
  targetDate?: string;
  createdAt: string;
}

/** Short human label for a goal's source, e.g. for a "Tracking …" chip. */
export function goalSourceLabel(source: GoalSource | undefined): string {
  if (!source || source.kind === "manual") return "Manual";
  if (source.kind === "networth") return "Net worth";
  return source.label;
}

let counter = 0;
export function newGoalId(): string {
  counter += 1;
  return `g_${Date.now().toString(36)}_${counter}`;
}

// ─── Projection math ─────────────────────────────────────────

const MONTH_CAP = 1200; // 100 years — the "unreachable" sentinel horizon.

/** Convert an annual percentage return to its monthly-compounding equivalent rate. */
export function monthlyRateOf(annualReturnPct: number): number {
  return Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1;
}

/**
 * Months of monthly compounding + fixed contribution before `current` reaches `target`.
 * Returns 0 when already met, Infinity when it never gets there within the cap.
 */
export function monthsToReach(current: number, target: number, monthly: number, monthlyRate: number): number {
  if (current >= target) return 0;
  let balance = current;
  for (let m = 1; m <= MONTH_CAP; m++) {
    balance = balance * (1 + monthlyRate) + monthly;
    if (balance >= target) return m;
  }
  return Infinity;
}

/**
 * The fixed monthly contribution required to reach `target` in exactly `months`, given a starting
 * balance and monthly rate. 0 when growth alone already gets there; Infinity when `months` <= 0.
 */
export function requiredMonthly(current: number, target: number, months: number, monthlyRate: number): number {
  if (months <= 0) return Infinity;
  const growth = Math.pow(1 + monthlyRate, months);
  const fvCurrent = current * growth;
  if (fvCurrent >= target) return 0;
  const needed = target - fvCurrent;
  if (monthlyRate === 0) return needed / months;
  const annuityFactor = (growth - 1) / monthlyRate; // FV of a 1/month ordinary annuity
  return needed / annuityFactor;
}

/** Whole months from today (start of day) until `date`; negative when the date has passed. */
export function monthsUntil(date: string): number {
  const now = new Date();
  const target = new Date(date + "T00:00:00");
  return (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
}

/** A date `months` from today, as YYYY-MM-DD (null when the horizon is unreachable). */
export function dateAfterMonths(months: number): string | null {
  if (!Number.isFinite(months)) return null;
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export interface GoalStatus {
  progressPct: number;
  monthsToGoal: number;
  projectedDate: string | null;
  /** Present only when the goal has a targetDate. */
  onTrack?: boolean;
  monthsAvailable?: number;
  /** Monthly contribution needed to hit the targetDate; present only with a targetDate. */
  requiredContribution?: number;
}

/** @param currentAmount the goal's live current value (from its source, or its manual amount). */
export function evaluateGoal(goal: Goal, currentAmount: number): GoalStatus {
  const rate = monthlyRateOf(goal.annualReturnPct);
  const progressPct = goal.targetAmount > 0 ? (currentAmount / goal.targetAmount) * 100 : 0;
  const monthsToGoal = monthsToReach(currentAmount, goal.targetAmount, goal.monthlyContribution, rate);
  const projectedDate = dateAfterMonths(monthsToGoal);

  if (!goal.targetDate) return { progressPct, monthsToGoal, projectedDate };

  const monthsAvailable = monthsUntil(goal.targetDate);
  const requiredContribution = requiredMonthly(currentAmount, goal.targetAmount, monthsAvailable, rate);
  const onTrack = monthsToGoal <= monthsAvailable;
  return { progressPct, monthsToGoal, projectedDate, onTrack, monthsAvailable, requiredContribution };
}

// ─── FIRE math ───────────────────────────────────────────────

export interface FireInputs {
  netWorth: number;
  monthlyContribution: number;
  annualExpenses: number;
  annualReturnPct: number;
  inflationPct: number;
  withdrawalRatePct: number;
  /** Horizon for the Coast-FIRE calculation, in years. */
  yearsToRetirement: number;
}

export interface FireResult {
  /** Portfolio (in today's money) that sustains the annual expenses at the withdrawal rate. */
  fireNumber: number;
  /** Inflation-adjusted annual return used for all projections. */
  realReturnPct: number;
  progressPct: number;
  monthsToFI: number;
  fiDate: string | null;
  /** Balance today that, left untouched, grows to the FIRE number by the retirement horizon. */
  coastNumber: number;
  isCoasting: boolean;
  points: FireYearPoint[];
}

export interface FireYearPoint {
  year: number;
  balance: number;
  fireNumber: number;
}

export function computeFire(input: FireInputs): FireResult {
  const { netWorth, monthlyContribution, annualExpenses, annualReturnPct, inflationPct, withdrawalRatePct, yearsToRetirement } = input;

  const realReturn = (1 + annualReturnPct / 100) / (1 + inflationPct / 100) - 1;
  const realMonthly = Math.pow(1 + realReturn, 1 / 12) - 1;
  const fireNumber = withdrawalRatePct > 0 ? annualExpenses / (withdrawalRatePct / 100) : Infinity;

  const monthsToFI = monthsToReach(netWorth, fireNumber, monthlyContribution, realMonthly);
  const progressPct = fireNumber > 0 && Number.isFinite(fireNumber) ? (netWorth / fireNumber) * 100 : 0;
  const coastNumber = Number.isFinite(fireNumber) ? fireNumber / Math.pow(1 + realReturn, yearsToRetirement) : Infinity;

  // Yearly real-terms projection for the chart. Extend a few years past FI so the crossing shows.
  const horizonYears = Math.min(50, Math.max(5, Math.ceil((Number.isFinite(monthsToFI) ? monthsToFI / 12 : 40)) + 5));
  const points: FireYearPoint[] = [{ year: 0, balance: Math.round(netWorth), fireNumber: Math.round(fireNumber) }];
  let balance = netWorth;
  for (let y = 1; y <= horizonYears; y++) {
    for (let m = 0; m < 12; m++) balance = balance * (1 + realMonthly) + monthlyContribution;
    points.push({ year: y, balance: Math.round(balance), fireNumber: Math.round(fireNumber) });
  }

  return {
    fireNumber,
    realReturnPct: realReturn * 100,
    progressPct,
    monthsToFI,
    fiDate: dateAfterMonths(monthsToFI),
    coastNumber,
    isCoasting: netWorth >= coastNumber,
    points,
  };
}

// ─── Formatting helpers ──────────────────────────────────────

/** Human "3y 4m" / "8 months" / "Reached" / "50+ yrs" from a month count. */
export function formatDuration(months: number): string {
  if (!Number.isFinite(months)) return "50+ yrs";
  if (months <= 0) return "Reached";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} ${m === 1 ? "month" : "months"}`;
  if (m === 0) return `${y}y`;
  return `${y}y ${m}m`;
}

/** "Sep 2031" from a YYYY-MM-DD string. */
export function formatMonthYear(date: string | null): string {
  if (!date) return "—";
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" });
}
