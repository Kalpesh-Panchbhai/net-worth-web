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
  /**
   * Money-weighted return (fraction, 0.12 === 12%) from inception up to this point's date, closed
   * with this point's `value`. Null before the first investment or where it does not apply. The
   * value at the last point equals the summary's `xirr`.
   */
  xirr?: number | null;
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

// ─── Mutual Fund Analyzer ────────────────────────────────────
// All Direct+Growth funds, analysed at request time from stored NAV history. Every metric `value`
// is a fraction (0.12 === 12%) except Sharpe/Sortino (a plain ratio) and rolling_windows (a count).

/** One (asset class, sub-category) peer group and how many live funds it holds. */
export interface MfCategory {
  assetClass: string;
  subCategory: string;
  liveCount: number;
}

export interface MfLeaderboardEntry {
  rank: number;
  schemeCode: number;
  name: string;
  amc: string;
  value: number;
  launchDate: string | null;
  lastNavDate: string | null;
}

/**
 * A category ranked on one metric over one horizon.
 * `peerCount` is the live funds in the category; `ranked` is how many had enough history for the
 * metric — so "3 of {peerCount}" reads honestly even when some funds were dropped.
 */
export interface MfLeaderboard {
  subCategory: string;
  metric: string;
  horizon: string;
  higherIsBetter: boolean;
  peerCount: number;
  ranked: number;
  entries: MfLeaderboardEntry[];
}

export interface MfFundMetric {
  horizon: string;
  metric: string;
  value: number;
}

/** One fund's category standing on a (horizon, metric). percentile: 100 = best, rank: 1 = best. */
export interface MfFundRank {
  horizon: string;
  metric: string;
  rank: number;
  percentile: number;
  peerCount: number;
}

export interface MfFundDetail {
  schemeCode: number;
  name: string;
  amc: string;
  assetClass: string;
  subCategory: string;
  launchDate: string | null;
  firstNavDate: string;
  lastNavDate: string;
  navPoints: number;
  metrics: MfFundMetric[];
  ranks: MfFundRank[];
}

export interface MfNavPoint { date: string; nav: number; }
export interface MfNavSeries { schemeCode: number; name: string; points: MfNavPoint[]; }

/** One held fund enriched with current value, headline metrics and category standing. */
export interface MfPortfolioHolding {
  schemeCode: number;
  name: string;
  amc: string;
  assetClass: string;
  subCategory: string;
  units: number;
  invested: number;
  currentValue: number;
  cagr5y: number | null;
  cagrSi: number | null;
  sharpe3y: number | null;
  rank: number | null;
  percentile: number | null;
  peerCount: number | null;
  /** CAGR horizon the standing was measured over (best available, e.g. "4Y" for a young fund). */
  rankHorizon: string | null;
  rankCagr: number | null;
}

export interface MfPortfolio {
  totalInvested: number;
  totalValue: number;
  holdings: MfPortfolioHolding[];
}

/** One fund's row in the browse table: its identity plus a metric-code → value map. */
export interface MfTableRow {
  schemeCode: number;
  name: string;
  amc: string;
  assetClass: string;
  subCategory: string;
  values: Record<string, number>;
}

/** The browse table at one horizon: the metric columns present, and one row per fund. */
export interface MfTable {
  horizon: string;
  metrics: string[];
  rows: MfTableRow[];
}

// Stock Analyzer — read-only current BUY/SELL/HOLD signals, precomputed daily by the backend by
// replaying each sector's winning strategy over live Yahoo bars.
export type StockSignalType = "BUY" | "SELL" | "HOLD";
export type StockMarket = "in" | "us";

export interface StockSignal {
  market: StockMarket;
  dataDate: string;
  sector: string;
  strategy: string;
  stock: string;
  type: StockSignalType;
  price: number;
  stopLoss: number | null;
  takeProfit: number | null;
  entryPrice: number | null;
  entryDate: string | null;
  unrealizedPnlPct: number | null;
  comment: string | null;
  /** true = signal fired on the last close and fills at the next session's open. */
  actionableTomorrow: boolean;
  prevClose: number | null;
  dayChangePct: number | null;
}

export interface StockSignalSnapshot {
  market: StockMarket;
  /** Date of the last bar the signals were read from (null when never refreshed). */
  asOf: string | null;
  total: number;
  counts: Partial<Record<StockSignalType, number>>;
  signals: StockSignal[];
}

/** A signal plus its per-stock backtest stats (for the Signals table columns). */
export interface EnrichedStockSignal {
  signal: StockSignal;
  btWr: number | null;
  btPf: number | null;
  btCagr: number | null;
  btAvgPnl: number | null;
  btAvgMae: number | null;
  btAvgMfe: number | null;
  btAvgHoldDays: number | null;
}

export interface StockSignalsResponse {
  market: StockMarket;
  asOf: string | null;
  total: number;
  counts: Partial<Record<StockSignalType, number>>;
  signals: EnrichedStockSignal[];
}

export interface StockWinnerRow {
  sector: string;
  strategy: string;
  portfolioCagr: number | null;
  avgPf: number | null;
  avgWr: number | null;
  avgTradePct: number | null;
  avgMaePct: number | null;
  avgMfePct: number | null;
  totalTrades: number;
  composite: number | null;
  stocksUsed: number;
}

export interface StockWinnersResponse {
  market: StockMarket;
  aggregate: {
    invested: number; currentValue: number; overallCagr: number; totalTrades: number; sectors: number;
  };
  rows: StockWinnerRow[];
}

export interface StockPerformanceRow {
  market: StockMarket;
  sector: string;
  strategy: string;
  stock: string;
  cagr: number | null; mdd: number | null; wr: number | null; pf: number | null;
  trades: number | null; winners: number | null; losers: number | null;
  netProfit: number | null; finalEquity: number | null; sharpe: number | null;
  avgBarsHeld: number | null; avgTradePct: number | null; avgMaePct: number | null;
  avgMfePct: number | null; avgHoldDays: number | null;
}

export interface StockTrade {
  market: StockMarket; sector: string; strategy: string; stock: string;
  tradeNum: number; entryDate: string | null; exitDate: string | null;
  entryPrice: number | null; exitPrice: number | null;
  pnl: number | null; pnlPct: number | null; maePct: number | null; mfePct: number | null;
  barsHeld: number | null; comment: string | null;
}

export interface StockSectorResponse { market: StockMarket; sector: string; stocks: StockPerformanceRow[]; }
export interface StockDetailResponse { market: StockMarket; stock: string; performance: StockPerformanceRow | null; trades: StockTrade[]; }
export interface StockEquityPoint { date: string; equity: number; }
export interface StockEquityResponse { market: StockMarket; points: StockEquityPoint[]; }

/** One "My Portfolio" position with valuation. */
export interface StockPositionRaw {
  id: string; market: StockMarket; stock: string; sector: string | null; strategy: string | null;
  entryDate: string | null; entryPrice: number | null; quantity: number | null;
  notes: string | null; status: "open" | "closed"; exitPrice: number | null; exitDate: string | null;
}
export interface ValuedPosition {
  position: StockPositionRaw;
  invested: number | null; currentValue: number | null; currentPrice: number | null;
  unrealizedPct: number | null; realizedPnl: number | null; realizedPct: number | null;
  dayChangePct: number | null; dayPnl: number | null;
}
export interface StockPortfolioResponse {
  market: StockMarket;
  summary: {
    open: number; closed: number; invested: number; currentValue: number;
    unrealized: number; unrealizedPct: number | null; realized: number;
    todaysPnl: number; todaysPnlPct: number | null;
  };
  positions: ValuedPosition[];
}

export interface StockClosedResponse { market: StockMarket; trades: StockTrade[]; }
