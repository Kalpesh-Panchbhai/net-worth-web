import type {
  User,
  Watchlist,
  WatchlistSummary,
  Account,
  AccountSummary,
  AccountType,
  Holding,
  HoldingSummary,
  ChartDataPoint,
  EntityType,
  TimePeriod,
  Transaction,
  Income,
  IncomeSource,
  IncomeTag,
  WatchlistAccountLink,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://kfgx37r84g.execute-api.ap-south-1.amazonaws.com/prod";

// --- In-memory GET cache ---
const cache = new Map<string, unknown>();

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
  if (!isWrite && cache.has(url)) return cache.get(url) as T;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${url}`, {
      ...options,
      headers: {
        ...(isWrite ? { "Content-Type": "application/json" } : {}),
        ...options?.headers as Record<string, string>,
      },
    });
  } catch {
    throw new Error("Unable to reach the server. Please check your connection or try again later.");
  }
  if (response.status === 204) return undefined as T;
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    throw new Error("Unable to reach the server. Please check your connection or try again later.");
  }
  let json: Record<string, unknown>;
  try {
    json = await response.json();
  } catch {
    throw new Error("Unable to reach the server. Please check your connection or try again later.");
  }
  if (!response.ok || json.success === false) {
    throw new Error((json?.error as Record<string, unknown>)?.message as string || json?.message as string || `Request failed: ${response.status}`);
  }
  const data = (json.data ?? json) as T;

  // Cache GET responses
  if (!isWrite) cache.set(url, data);

  return data;
}

// Users
export function ensureUser(externalUserId: string) {
  return request<User>("/users", {
    method: "POST",
    body: JSON.stringify({ externalUserId }),
  });
}

export function deleteUser(id: number) {
  return request<void>(`/users/${id}`, { method: "DELETE" });
}

// Refresh
export function refreshData() {
  return request<{ message: string; durationMs: number }>("/refresh", {
    method: "POST",
  });
}

// Watchlists
export function getWatchlists(userId: number) {
  return request<WatchlistSummary[]>(`/watchlists/${userId}`);
}

export function createWatchlist(userId: number, name: string) {
  return request<Watchlist>("/watchlists", {
    method: "POST",
    body: JSON.stringify({ userId, name }),
  });
}

export function updateWatchlist(id: number, name: string) {
  return request<Watchlist>(`/watchlists/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteWatchlist(id: number) {
  return request<void>(`/watchlists/${id}`, { method: "DELETE" });
}

// Watchlist-Accounts (link/unlink)
export function getWatchlistAccounts(watchlistId: number) {
  return request<AccountSummary[]>(`/watchlist-accounts/${watchlistId}`);
}

export function linkWatchlistAccount(watchlistId: number, accountId: number) {
  return request<WatchlistAccountLink>("/watchlist-accounts", {
    method: "POST",
    body: JSON.stringify({ watchlistId, accountId }),
  });
}

export function unlinkWatchlistAccount(watchlistId: number, accountId: number) {
  return request<void>("/watchlist-accounts", {
    method: "DELETE",
    body: JSON.stringify({ watchlistId, accountId }),
  });
}

// Account-Watchlists
export function getAccountWatchlists(accountId: number) {
  return request<WatchlistSummary[]>(`/account-watchlists/${accountId}`);
}

// Accounts
export function getAccounts(userId: number) {
  return request<AccountSummary[]>(`/accounts/${userId}`);
}

export function createAccount(data: {
  userId: number;
  name: string;
  type: AccountType;
  currency: string;
  isActive?: boolean;
  needsDailyData?: boolean;
}) {
  return request<Account>("/accounts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateAccount(id: number, data: { name?: string; isActive?: boolean }) {
  return request<Account>(`/accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteAccount(id: number) {
  return request<void>(`/accounts/${id}`, { method: "DELETE" });
}

// Holdings
export function getHoldings(accountId: number) {
  return request<HoldingSummary[]>(`/holdings/${accountId}`);
}

export function createHolding(data: {
  accountId: number;
  name: string;
  symbol: string;
}) {
  return request<Holding>("/holdings", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteHolding(id: number) {
  return request<void>(`/holdings/${id}`, { method: "DELETE" });
}

// Transactions
export function getTransactions(query: { accountId?: number; holdingId?: number }) {
  const params = new URLSearchParams();
  if (query.accountId != null) params.set("accountId", String(query.accountId));
  if (query.holdingId != null) params.set("holdingId", String(query.holdingId));
  return request<Transaction[]>(`/transactions?${params}`);
}

export function createTransaction(data: {
  accountId: number;
  holdingId: number;
  txnDate: string;
  invested: number;
  value: number;
  mode?: string;
}) {
  return request<Transaction>("/transactions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteTransaction(id: number) {
  return request<void>(`/transactions/${id}`, { method: "DELETE" });
}

// Chart Data
export function getChartData(entityType: EntityType, entityId: number, timePeriod: TimePeriod) {
  return request<ChartDataPoint[]>(
    `/chart-data?entityType=${entityType}&entityId=${entityId}&timePeriod=${timePeriod}`
  );
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
