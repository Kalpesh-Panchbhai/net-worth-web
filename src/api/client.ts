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
  SyncMfPreview,
  SyncMfConfirmResult,
  StockSyncPreview,
  StockSyncConfirmResult,
  MfCategory,
  MfLeaderboard,
  MfFundDetail,
  MfTable,
  MfNavSeries,
  MfPortfolio,
  StockMarket,
  StockSignalsResponse,
  StockWinnersResponse,
  StockSectorResponse,
  StockDetailResponse,
  StockEquityResponse,
  StockPortfolioResponse,
  StockClosedResponse,
  StockAlertConfig,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://kfgx37r84g.execute-api.ap-south-1.amazonaws.com/prod";

// --- In-memory GET cache ---
//
// Entries expire, so a long-lived tab does not keep showing values from when it was opened.
// In-flight requests are tracked separately: the cache used to be written only after a response
// resolved, so two components mounting in the same tick both hit the network for the same URL.
const TTL_MS = 60_000;
/**
 * The Mutual Fund Analyzer is recomputed once a day by the backend's nightly job, so its responses
 * are stable for far longer than a minute. A longer TTL keeps category/metric/horizon switching
 * instant (served from cache) without ever showing meaningfully stale numbers.
 */
const LONG_TTL_MS = 15 * 60_000;
const LONG_TTL_PREFIXES = ["/mf-analysis", "/stock-analysis"];
/** Live-broker snapshots must never be replayed from cache — they are point-in-time. */
const NEVER_CACHE = ["/sync-mf"];

function ttlFor(url: string): number {
  // The catalog/metrics are recomputed daily, so cache them long — but the personal portfolio
  // reflects live holdings and value, so it keeps the short default TTL.
  const longable = LONG_TTL_PREFIXES.some(prefix => url.startsWith(prefix)) && !url.includes("action=portfolio");
  return longable ? LONG_TTL_MS : TTL_MS;
}

interface CacheEntry { data: unknown; storedAt: number }

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();
/**
 * Bumped by every invalidation. A request already on the wire captures the generation it started
 * in; if that no longer matches when it resolves, its data describes a superseded state (converted
 * under the previous display currency, say) and must not be written to the cache — and it must not
 * evict a newer request's dedup entry either.
 */
let generation = 0;

function isCacheable(url: string) {
  return !NEVER_CACHE.some(prefix => url.startsWith(prefix));
}

/**
 * Drops cached GETs. Pass one or more path prefixes; omit them to clear everything.
 *
 * Prefix matching, not substring matching: `invalidate("/accounts")` used to also wipe
 * `/account-watchlists/*`, while `invalidate("watchlist")` wiped both `/watchlists/*` and
 * `/watchlist-accounts/*`.
 */
export function invalidateCache(...prefixes: string[]) {
  // In-flight requests are dropped too. A request issued before a display-currency change would
  // otherwise still be handed to whoever is waiting on it — and re-cached for a full TTL — with
  // amounts converted under the old preference.
  generation++;
  if (prefixes.length === 0) { cache.clear(); inFlight.clear(); return; }
  for (const key of [...cache.keys()]) {
    if (prefixes.some(prefix => key.startsWith(prefix))) cache.delete(key);
  }
  for (const key of [...inFlight.keys()]) {
    if (prefixes.some(prefix => key.startsWith(prefix))) inFlight.delete(key);
  }
}

/**
 * Money values on one page come from several endpoints, so any mutation that can move a number
 * has to drop all of them together — otherwise a stale total sits next to a fresh one.
 */
export function invalidateMoneyCaches() {
  invalidateCache("/accounts", "/holdings", "/transactions", "/watchlists", "/watchlist-accounts", "/account-watchlists", "/chart-data", "/incomes");
}

async function fetchJson<T>(url: string, options: RequestInit | undefined, isWrite: boolean): Promise<T> {
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
  return (json.data ?? json) as T;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const method = options?.method ?? "GET";
  const isWrite = method !== "GET";
  if (isWrite) return fetchJson<T>(url, options, true);

  const cacheable = isCacheable(url);
  if (cacheable) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.storedAt < ttlFor(url)) return clone(hit.data) as T;
    if (hit) cache.delete(url);
    const pending = inFlight.get(url);
    if (pending) return clone(await pending) as T;
  }

  const startedAt = generation;
  const promise = fetchJson<T>(url, options, false)
    .then(data => {
      // Only cache, and only clear the dedup slot, if nothing was invalidated while this was in
      // flight. Otherwise a response describing the superseded state would land in the cache with
      // a full fresh TTL, and would evict the entry belonging to the newer request.
      if (generation === startedAt) {
        if (cacheable && data !== undefined) cache.set(url, { data, storedAt: Date.now() });
        inFlight.delete(url);
      }
      return data;
    })
    .catch(err => {
      if (generation === startedAt) inFlight.delete(url);
      throw err;
    });

  if (cacheable) inFlight.set(url, promise as Promise<unknown>);
  return clone(await promise) as T;
}

/**
 * Callers sort and otherwise mutate what they receive, which previously reordered the cached
 * array itself. Hand out a shallow copy of the top-level collection instead.
 */
function clone<T>(data: T): T {
  return Array.isArray(data) ? ([...data] as unknown as T) : data;
}

// Yahoo Finance symbol search
export interface YahooQuote {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  typeDisp?: string;
}

export async function searchSymbol(query: string): Promise<YahooQuote[]> {
  if (!query.trim()) return [];
  const encoded = encodeURIComponent(query.trim());
  // In dev: use Vite proxy to Yahoo directly; in prod: use Firebase Cloud Function
  const url = import.meta.env.DEV
    ? `/yahoo-finance/v1/finance/search?q=${encoded}&quotesCount=20&newsCount=0`
    : `/yahoo-search?q=${encoded}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.quotes ?? []).filter((q: YahooQuote) => q.symbol);
  } catch {
    return [];
  }
}

// Users
export function ensureUser(externalUserId: string) {
  return request<User>("/users", {
    method: "POST",
    body: JSON.stringify({ externalUserId }),
  });
}

export function updateUserPreferredCurrency(id: number, preferredCurrency: string) {
  return request<User>(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ preferredCurrency }),
  });
}

export function deleteUser(id: number) {
  return request<void>(`/users/${id}`, { method: "DELETE" });
}

// Generic per-user config store (Insights layout, goals, FIRE assumptions, Simulator inputs, …).
// Keyed by an opaque string; the value is arbitrary JSON persisted and returned verbatim, so new
// settings need no API change beyond a new key.
export function getUserConfig<T>(userId: number, key: string) {
  return request<{ value: T | null }>(`/user-config/${userId}?key=${encodeURIComponent(key)}`);
}

export function saveUserConfig(userId: number, key: string, value: unknown) {
  invalidateCache(`/user-config/${userId}?key=${encodeURIComponent(key)}`);
  return request<void>(`/user-config/${userId}?key=${encodeURIComponent(key)}`, {
    method: "PATCH",
    body: JSON.stringify({ value }),
  });
}

// Refresh
export function refreshData() {
  return request<{ message: string; durationMs: number; lastRefreshedAt: number }>("/refresh", {
    method: "POST",
  });
}

/** Epoch millis of the last successful refresh (null if never) and the next scheduled one. */
export function getLastRefreshed() {
  return request<{ lastRefreshedAt: number | null; nextRefreshAt: number | null }>("/refresh");
}

// Data refresh schedule (global): interval, weekend policy, enabled.
export function getRefreshSchedule() {
  return request<import("./types").RefreshScheduleConfig>("/refresh-schedule");
}

export function updateRefreshSchedule(cfg: { intervalHours: number; anchorHour: number; anchorMinute: number; timezone: string; weekdaysOnly: boolean; enabled: boolean }) {
  invalidateCache("/refresh-schedule", "/refresh");
  return request<import("./types").RefreshScheduleConfig>("/refresh-schedule", { method: "PUT", body: JSON.stringify(cfg) });
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

// Sync MF (Kite Connect)
export function getSyncMfLoginUrl(redirectUrl: string) {
  return request<{ loginUrl: string }>(`/sync-mf?mode=login&redirectUrl=${encodeURIComponent(redirectUrl)}`);
}

export function syncMfCallback(requestToken: string) {
  return request<{ status: string }>("/sync-mf?mode=callback", {
    method: "POST",
    body: JSON.stringify({ requestToken }),
  });
}

export function getSyncMfPreview(accountId: number) {
  return request<SyncMfPreview>(`/sync-mf?mode=preview&accountId=${accountId}`);
}

export function confirmSyncMf(accountId: number, diffs: SyncMfPreview["diffs"]) {
  return request<SyncMfConfirmResult>("/sync-mf?mode=confirm", {
    method: "POST",
    body: JSON.stringify({ accountId, diffs }),
  });
}

// Mutual Fund Analyzer — read-only, computed at request time from stored NAV history.
// Independent of the logged-in user and display currency, so these are plain cacheable GETs.
export function getMfCategories() {
  return request<MfCategory[]>("/mf-analysis?action=categories");
}

export function getMfLeaderboard(params: { subCategory: string; metric?: string; horizon?: string; limit?: number }) {
  const q = new URLSearchParams();
  q.set("action", "leaderboard");
  q.set("subCategory", params.subCategory);
  if (params.metric) q.set("metric", params.metric);
  if (params.horizon) q.set("horizon", params.horizon);
  if (params.limit != null) q.set("limit", String(params.limit));
  return request<MfLeaderboard>(`/mf-analysis?${q}`);
}

export function getMfFund(schemeCode: number) {
  return request<MfFundDetail>(`/mf-analysis?action=fund&schemeCode=${schemeCode}`);
}

/** Sortable browse grid: all column metrics per fund at a horizon. Omit subCategory for all funds. */
export function getMfTable(params: { subCategory?: string; horizon?: string }) {
  const q = new URLSearchParams();
  q.set("action", "table");
  if (params.subCategory) q.set("subCategory", params.subCategory);
  if (params.horizon) q.set("horizon", params.horizon);
  return request<MfTable>(`/mf-analysis?${q}`);
}

/** A fund's (downsampled) NAV curve — for the growth chart and the SIP/lumpsum calculator. */
export function getMfNav(schemeCode: number) {
  return request<MfNavSeries>(`/mf-analysis?action=nav&schemeCode=${schemeCode}`);
}

/** The user's held mutual funds, ranked and valued — for "my funds" and the portfolio X-ray. */
export function getMfPortfolio(userId: number) {
  return request<MfPortfolio>(`/mf-analysis?action=portfolio&userId=${userId}`);
}

export function getStockSyncPreview(accountId: number) {
  return request<StockSyncPreview>(`/sync-mf?mode=stock-preview&accountId=${accountId}`);
}

export function confirmStockSync(accountId: number, invested: number, value: number) {
  return request<StockSyncConfirmResult>("/sync-mf?mode=stock-confirm", {
    method: "POST",
    body: JSON.stringify({ accountId, invested, value }),
  });
}

// Stock Analyzer — read-only analytics, recomputed by the nightly job / imported from the VM, so
// these are plain cacheable GETs (long TTL, like the MF analyzer).
export function getStockSignals(market: StockMarket = "in", type?: "BUY" | "SELL" | "HOLD") {
  const q = new URLSearchParams({ action: "signals", market });
  if (type) q.set("type", type);
  return request<StockSignalsResponse>(`/stock-analysis?${q}`);
}

export function getStockWinners(market: StockMarket = "in") {
  return request<StockWinnersResponse>(`/stock-analysis?action=winners&market=${market}`);
}

export function getStockSector(market: StockMarket, sector: string) {
  return request<StockSectorResponse>(`/stock-analysis?action=sector&market=${market}&sector=${encodeURIComponent(sector)}`);
}

export function getStockDetail(market: StockMarket, stock: string) {
  return request<StockDetailResponse>(`/stock-analysis?action=stock&market=${market}&stock=${encodeURIComponent(stock)}`);
}

export function getStockClosed(market: StockMarket = "in") {
  return request<StockClosedResponse>(`/stock-analysis?action=closed&market=${market}`);
}

export function getStockEquity(market: StockMarket, opts?: { sector?: string; stock?: string }) {
  const q = new URLSearchParams({ action: "equity", market });
  if (opts?.sector) q.set("sector", opts.sector);
  if (opts?.stock) q.set("stock", opts.stock);
  return request<StockEquityResponse>(`/stock-analysis?${q}`);
}

// My Portfolio — positions with live-ish valuation. Mutations, so not cached.
export function getStockPortfolio(market: StockMarket = "in") {
  return request<StockPortfolioResponse>(`/stock-portfolio?market=${market}`);
}

export function addStockPosition(data: { market: StockMarket; stock: string; sector?: string; strategy?: string; entryDate?: string; entryPrice?: number; quantity?: number; notes?: string }) {
  invalidateCache("/stock-portfolio");
  return request<StockPortfolioResponse>("/stock-portfolio", { method: "POST", body: JSON.stringify(data) });
}

export function updateStockPosition(data: { id: string; market: StockMarket; stock: string; sector?: string | null; strategy?: string | null; entryDate?: string | null; entryPrice?: number | null; quantity?: number | null; notes?: string | null; status: "open" | "closed"; exitPrice?: number | null; exitDate?: string | null }) {
  invalidateCache("/stock-portfolio");
  return request<StockPortfolioResponse>("/stock-portfolio", { method: "PUT", body: JSON.stringify(data) });
}

export function deleteStockPosition(id: string) {
  invalidateCache("/stock-portfolio");
  return request<StockPortfolioResponse>("/stock-portfolio", { method: "DELETE", body: JSON.stringify({ id }) });
}

// Slack alert schedule (per market), editable from the UI.
export function getStockAlerts() {
  return request<StockAlertConfig[]>("/stock-alerts");
}

export function updateStockAlert(cfg: { market: StockMarket; enabled: boolean; hour: number; minute: number; timezone?: string; weekdaysOnly: boolean }) {
  invalidateCache("/stock-alerts");
  return request<StockAlertConfig[]>("/stock-alerts", { method: "PUT", body: JSON.stringify(cfg) });
}
