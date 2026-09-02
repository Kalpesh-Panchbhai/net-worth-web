export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface User {
  id: number;
  externalUserId: string;
  preferredCurrency: string;
}

/**
 * Money fields shared by every summary response.
 *
 * All amounts are in `displayCurrency`, which the backend always populates: normally the user's
 * preferred currency, or the item's own native currency when no FX rate could be resolved. `gain`
 * and `dayChange` are computed server-side from those same converted amounts, so a view never has
 * to subtract two independently-converted numbers or guess which label applies.
 */
export interface SummaryMetrics {
  currentDayValue: number;
  previousDayValue: number;
  invested: number;
  /** currentDayValue - invested */
  gain: number;
  /** currentDayValue - previousDayValue */
  dayChange: number;
  /** Money-weighted annualised return as a fraction (0.12 === 12%); null when not computable. */
  xirr: number | null;
  displayCurrency: string;
}

export interface WatchlistSummary extends SummaryMetrics {
  id: number;
  userId: number;
  name: string;
}

/** A dated cash movement in `displayCurrency`: negative invested, positive returned. */
export interface CashFlow {
  date: string;
  amount: number;
}

export interface AccountSummary extends SummaryMetrics {
  id: number;
  userId: number;
  name: string;
  type: string;
  isActive: boolean;
  needsDailyData: boolean;
  /** Native account currency. Informational only — the money fields are in displayCurrency. */
  currency: string;
  /**
   * This account's cash flows, in displayCurrency. Absent for accounts XIRR does not apply to.
   *
   * A group's money-weighted return is the IRR of its members' pooled flows and cannot be
   * recovered from their individual `xirr` values by any average, so pooling these is the only way
   * to get an exact figure for a client-side selection (a search filter, a type group). Use
   * `pooledXirr` from src/utils/xirr.ts.
   */
  cashFlows?: CashFlow[];
}

export interface HoldingSummary extends SummaryMetrics {
  id: number;
  accountId: number;
  name: string;
  symbol: string;
  /**
   * A share/unit count only when `unitsAreShares` is true. For non-broker accounts the underlying
   * column stores a money balance instead, and it is not FX-converted — so render it as a unit
   * count only when the flag says it is one.
   */
  units: number;
  unitsAreShares: boolean;
}

export interface ChartDataPoint {
  id: number;
  date: string;
  value: number;
  invested: number;
  /** Currency `value` and `invested` are expressed in. */
  displayCurrency: string;
}

export type EntityType = "holding" | "account" | "watchlist";
export type TimePeriod = "1M" | "3M" | "6M" | "1Y" | "2Y" | "5Y" | "ALL";
export type AccountType = "BROKER" | "SAVINGS" | "CREDIT_CARD" | "LOAN" | "OTHER";

export interface Watchlist {
  id: number;
  userId: number;
  name: string;
}

export interface Account {
  id: number;
  userId: number;
  name: string;
  type: AccountType;
  isActive: boolean;
  needsDailyData: boolean;
  currency: string;
}

export interface Holding {
  id: number;
  accountId: number;
  name: string;
  symbol: string;
}

export interface Transaction {
  id: number;
  accountId: number;
  holdingId: number;
  txnDate: string;
  /**
   * Cumulative for the holding as of txnDate. On read responses this is the running sum of the
   * converted deltas, so it always equals the sum of `investedDelta` up to and including this row.
   */
  invested: number;
  /** Units when `valueInUnits` is true, otherwise the running converted money total. */
  value: number;
  /**
   * This row's own change, converted at this row's own date.
   *
   * Always use these instead of subtracting two rows' cumulative amounts: those were translated at
   * different dates, so the FX drift between them would land inside the difference. Absent on the
   * row echoed back by a create (nothing is converted there).
   */
  investedDelta?: number;
  valueDelta?: number;
  /**
   * Currency of the money fields. Always set: the preferred currency on read responses, or the
   * account's native currency on the row echoed back by a create (which is what was stored).
   */
  displayCurrency: string;
  /** True when `value` is a unit count, so it is never FX-converted or currency-formatted. */
  valueInUnits: boolean;
}

export interface WatchlistAccountLink {
  watchlistId: number;
  accountId: number;
}

export interface Income {
  id: number;
  userId: number;
  incomeSourceId: number;
  incomeTagId: number;
  /** As entered, in `currency`. Use the converted* fields for display. */
  netAmount: number;
  taxPaid: number;
  /** Currency this income was actually paid in. */
  currency: string;
  creditedDate: string;
  /**
   * Amounts converted at the credited date's FX rate, and the currency they are in.
   * The backend always populates all four on read responses — `convertedCurrency` names the
   * user's preferred currency, or falls back to `currency` when no rate existed — so display code
   * never has to substitute a native amount under a preferred-currency label.
   */
  convertedNetAmount: number;
  convertedTaxPaid: number;
  /** convertedNetAmount + convertedTaxPaid */
  convertedGrossAmount: number;
  convertedCurrency: string;
}

export interface IncomeSource {
  id: number;
  userId: number;
  name: string;
  isDefault: boolean;
}

export interface IncomeTag {
  id: number;
  userId: number;
  name: string;
  isDefault: boolean;
}

export interface SyncMfDiff {
  fund: string;
  isin: string;
  yahooSymbol: string;
  holdingId: number | null;
  holdingName: string | null;
  kiteUnits: number;
  kiteInvested: number;
  dbUnits: number;
  dbInvested: number;
  unitsDiff: number;
  investedDiff: number;
  status: "CHANGED" | "NEW" | "UNCHANGED";
  txnDate?: string; // per-holding transaction date (YYYY-MM-DD)
}

export interface SyncMfPreview {
  diffs: SyncMfDiff[];
  accountId: number;
  /** Currency the diff amounts are in — Kite's own, never converted. */
  currency: string;
}

export interface SyncMfConfirmResult {
  inserted: number;
}

export interface StockSyncPreview {
  invested: number;
  value: number;
  /** Currency the amounts are in — Kite's own, never converted. */
  currency: string;
  holdingCount: number;
  alreadySynced: boolean;
  date: string;
}

export interface StockSyncConfirmResult {
  synced: boolean;
  date: string;
}
