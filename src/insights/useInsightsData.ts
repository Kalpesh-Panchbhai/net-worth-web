import { useEffect, useState } from "react";
import { useUser } from "../context/UserContext";
import { getWatchlists, getWatchlistAccounts, getIncomes, getIncomeSources, getIncomeTags } from "../api/client";
import type { WatchlistSummary, AccountSummary, Income, IncomeSource, IncomeTag } from "../api/types";

export interface InsightsData {
  loading: boolean;
  error: string | null;
  watchlists: WatchlistSummary[];
  /** The catch-all "All" watchlist, when present — its members are every account. */
  allWatchlist: WatchlistSummary | null;
  /** Members of "All" = every account, used as the net-worth allocation source. */
  accounts: AccountSummary[];
  incomes: Income[];
  sources: IncomeSource[];
  tags: IncomeTag[];
}

/**
 * Fetches the datasets the insights widgets share, once per page, so cards don't each refetch.
 * Re-runs on `dataVersion` (currency change / refresh). Per-entity chart data is still fetched by
 * the EntityChart widgets themselves.
 */
export function useInsightsData(): InsightsData {
  const { userId, dataVersion } = useUser();
  const [state, setState] = useState<InsightsData>({
    loading: true, error: null, watchlists: [], allWatchlist: null, accounts: [], incomes: [], sources: [], tags: [],
  });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        setState(s => ({ ...s, loading: true, error: null }));
        const [watchlists, incomes, sources, tags] = await Promise.all([
          getWatchlists(userId), getIncomes(userId), getIncomeSources(userId), getIncomeTags(userId),
        ]);
        const allWatchlist = watchlists.find(w => w.name === "All") ?? watchlists[0] ?? null;
        const accounts = allWatchlist ? await getWatchlistAccounts(allWatchlist.id).catch(() => [] as AccountSummary[]) : [];
        if (cancelled) return;
        setState({ loading: false, error: null, watchlists, allWatchlist, accounts, incomes, sources, tags });
      } catch (err) {
        if (cancelled) return;
        setState(s => ({ ...s, loading: false, error: err instanceof Error ? err.message : "Failed to load insights data" }));
      }
    })();
    return () => { cancelled = true; };
  }, [userId, dataVersion]);

  return state;
}
