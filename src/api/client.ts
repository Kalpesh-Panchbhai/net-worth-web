import type {
  ApiResponse,
  User,
  WatchlistSummary,
  AccountSummary,
  HoldingSummary,
  ChartDataPoint,
  EntityType,
  TimePeriod,
  Income,
  IncomeSource,
  IncomeTag,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? "/api" : "https://kfgx37r84g.execute-api.ap-south-1.amazonaws.com/prod");

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    ...(options?.body ? { headers: { "Content-Type": "text/plain", ...options?.headers as Record<string, string> } } : {}),
  });
  if (response.status === 204) return undefined as T;
  const json = await response.json();
  if (!response.ok || json.success === false) {
    throw new Error(json?.error?.message || json?.message || `Request failed: ${response.status}`);
  }
  return json.data ?? json;
}

// Users
export function ensureUser(externalUserId: string) {
  return request<User>("/users", {
    method: "POST",
    body: JSON.stringify({ externalUserId }),
  });
}

// Watchlists
export function getWatchlists(userId: number) {
  return request<WatchlistSummary[]>(`/watchlists/${userId}`);
}

// Accounts
export function getAccounts(userId: number) {
  return request<AccountSummary[]>(`/accounts/${userId}`);
}

// Holdings
export function getHoldings(accountId: number) {
  return request<HoldingSummary[]>(`/holdings/${accountId}`);
}

// Chart Data
export function getChartData(entityType: EntityType, entityId: number, timePeriod: TimePeriod) {
  return request<ChartDataPoint[]>(
    `/chart-data?entityType=${entityType}&entityId=${entityId}&timePeriod=${timePeriod}`
  );
}

// Refresh
export function refreshData() {
  return request<ApiResponse<{ message: string; durationMs: number }>>("/refresh", {
    method: "POST",
  });
}

// Income Sources
export function getIncomeSources(userId: number) {
  return request<IncomeSource[]>(`/income-sources/${userId}`);
}

export function createIncomeSource(userId: number, name: string, isDefault?: boolean) {
  return request<IncomeSource>("/income-sources", {
    method: "POST",
    body: JSON.stringify({ userId, name, isDefault }),
  });
}

export function setDefaultIncomeSource(id: number) {
  return request<void>(`/income-sources/${id}`, { method: "PATCH" });
}

// Income Tags
export function getIncomeTags(userId: number) {
  return request<IncomeTag[]>(`/income-tags/${userId}`);
}

export function createIncomeTag(userId: number, name: string, isDefault?: boolean) {
  return request<IncomeTag>("/income-tags", {
    method: "POST",
    body: JSON.stringify({ userId, name, isDefault }),
  });
}

export function setDefaultIncomeTag(id: number) {
  return request<void>(`/income-tags/${id}`, { method: "PATCH" });
}

// Incomes
export function getIncomes(userId: number) {
  return request<Income[]>(`/incomes/${userId}`);
}

export function createIncome(data: {
  userId: number;
  incomeSourceId: number;
  incomeTagId: number;
  netAmount: number;
  taxPaid?: number;
  currency: string;
  creditedDate: string;
}) {
  return request<Income>("/incomes", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateIncome(id: number, data: {
  incomeSourceId?: number;
  incomeTagId?: number;
  netAmount?: number;
  taxPaid?: number;
  currency?: string;
  creditedDate?: string;
}) {
  return request<Income>(`/incomes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteIncome(id: number) {
  return request<void>(`/incomes/${id}`, { method: "DELETE" });
}
