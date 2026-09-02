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

export interface WatchlistSummary {
  id: number;
  userId: number;
  name: string;
  currentDayValue: number;
  previousDayValue: number;
  invested: number;
}

export interface AccountSummary {
  id: number;
  userId: number;
  name: string;
  type: string;
  isActive: boolean;
  needsDailyData: boolean;
  currency: string;
  currentDayValue: number;
  previousDayValue: number;
  invested: number;
}

export interface HoldingSummary {
  id: number;
  accountId: number;
  name: string;
  symbol: string;
  units: number;
  currentDayValue: number;
  previousDayValue: number;
  invested: number;
}

export interface ChartDataPoint {
  id: number;
  date: string;
  value: number;
  invested: number;
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
  invested: number;
  value: number;
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
  netAmount: number;
  taxPaid: number;
  currency: string;
  creditedDate: string;
  // Display values converted to the user's preferred currency at the credited date.
  // Present on read responses; may be absent if FX lookup failed.
  convertedNetAmount?: number;
  convertedTaxPaid?: number;
  convertedCurrency?: string;
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
}

export interface SyncMfConfirmResult {
  inserted: number;
}

export interface StockSyncPreview {
  invested: number;
  value: number;
  holdingCount: number;
  alreadySynced: boolean;
  date: string;
}

export interface StockSyncConfirmResult {
  synced: boolean;
  date: string;
}
