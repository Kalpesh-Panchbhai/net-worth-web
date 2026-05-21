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

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://kfgx37r84g.execute-api.ap-south-1.amazonaws.com/prod";

// --- In-memory GET cache ---
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function invalidateCache(pattern?: string) {
  if (!pattern) { cache.clear(); return; }
  for (const key of cache.keys()) {
    if (key.includes(pattern)) cache.delete(key);
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const method = options?.method ?? "GET";
  const isWrite = method !== "GET";

  // Return cached data for GET requests
  if (!isWrite) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data as T;
  }

  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers: {
      ...(isWrite ? { "Content-Type": "application/json" } : {}),
      ...options?.headers as Record<string, string>,
    },
  });
  if (response.status === 204) return undefined as T;
  const json = await response.json();
  if (!response.ok || json.success === false) {
    throw new Error(json?.error?.message || json?.message || `Request failed: ${response.status}`);
  }
  const data = (json.data ?? json) as T;

  // Cache GET responses
  if (!isWrite) cache.set(url, { data, ts: Date.now() });

  return data;
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
