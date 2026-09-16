import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "../context/UserContext";
import { getAccounts, getWatchlists, getHoldings } from "../api/client";
import { isInternalAccount } from "./account";
import type { AccountSummary, WatchlistSummary, HoldingSummary } from "../api/types";
import type { Goal } from "./goals";

export interface GoalValues {
  loading: boolean;
  /** Total net worth: active, non-internal accounts summed in the display currency. */
  netWorth: number;
  accounts: AccountSummary[];
  watchlists: WatchlistSummary[];
  holdingsById: Map<number, HoldingSummary>;
  /** The live current value a goal is measured against (or its manual amount). */
  valueOf: (goal: Goal) => number;
}

/**
 * Resolves the live current value for each goal from its linked entity — net worth, an account, a
 * holding, or a watchlist — refetching on a currency change / data refresh. Holdings are fetched
 * only for the accounts referenced by holding-linked goals. Shared by the Goals page and the
 * dashboard Goals widget so both read one source of truth.
 */
export function useGoalValues(goals: Goal[]): GoalValues {
  const { userId, preferredCurrency, dataVersion } = useUser();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [watchlists, setWatchlists] = useState<WatchlistSummary[]>([]);
  const [holdingsById, setHoldingsById] = useState<Map<number, HoldingSummary>>(new Map());
  const [loading, setLoading] = useState(true);

  // Distinct accounts whose holdings we need (for holding-linked goals).
  const holdingAccountIds = useMemo(() => {
    const s = new Set<number>();
    for (const g of goals) if (g.source?.kind === "holding") s.add(g.source.accountId);
    return [...s].sort((a, b) => a - b);
  }, [goals]);
  const holdingKey = holdingAccountIds.join(",");

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [accs, wls] = await Promise.all([getAccounts(userId), getWatchlists(userId)]);
        const hmap = new Map<number, HoldingSummary>();
        if (holdingAccountIds.length) {
          const lists = await Promise.all(holdingAccountIds.map(id => getHoldings(id).catch(() => [] as HoldingSummary[])));
          for (const list of lists) for (const h of list) hmap.set(h.id, h);
        }
        if (cancelled) return;
        setAccounts(accs);
        setWatchlists(wls);
        setHoldingsById(hmap);
      } catch {
        /* keep whatever we had; callers fall back to 0 for unresolved sources */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, dataVersion, holdingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const netWorth = useMemo(
    () => accounts
      .filter(a => a.isActive && a.displayCurrency === preferredCurrency && !isInternalAccount(a.name))
      .reduce((sum, a) => sum + a.currentDayValue, 0),
    [accounts, preferredCurrency],
  );

  const valueOf = useCallback((goal: Goal): number => {
    const src = goal.source;
    if (!src || src.kind === "manual") return goal.currentAmount;
    if (src.kind === "networth") return netWorth;
    if (src.kind === "account") return accounts.find(a => a.id === src.id)?.currentDayValue ?? 0;
    if (src.kind === "watchlist") return watchlists.find(w => w.id === src.id)?.currentDayValue ?? 0;
    return holdingsById.get(src.id)?.currentDayValue ?? 0;
  }, [accounts, watchlists, holdingsById, netWorth]);

  return { loading, netWorth, accounts, watchlists, holdingsById, valueOf };
}
