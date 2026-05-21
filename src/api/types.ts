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

export interface Transaction {
  id: number;
  accountId: number;
  holdingId: number;
  txnDate: string;
  invested: number;
  value: number;
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
