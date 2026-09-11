import { useEffect, useMemo, useState } from "react";
import { useUser } from "../../context/UserContext";
import { getWatchlistAccounts, getHoldings } from "../../api/client";
import type { AccountSummary, HoldingSummary } from "../../api/types";
import AllocationBreakdown, { type AllocationGrouping } from "../../components/AllocationBreakdown";
import type { AllocationConfig } from "../types";
import type { InsightsData } from "../useInsightsData";

const TYPE_LABELS: Record<string, string> = {
  BROKER: "Broker", SAVINGS: "Savings", CREDIT_CARD: "Credit Card", LOAN: "Loan", OTHER: "Other",
};
const ACCOUNT_GROUPINGS: AllocationGrouping<AccountSummary>[] = [
  { id: "type", label: "Type", keyOf: a => a.type, labelOf: k => TYPE_LABELS[k] ?? k, colorBy: "type" },
  { id: "account", label: "Account", keyOf: a => a.name },
  { id: "currency", label: "Currency", keyOf: a => a.currency },
];
const HOLDING_GROUPINGS: AllocationGrouping<HoldingSummary>[] = [
  { id: "holding", label: "Holding", keyOf: h => h.name },
];

export default function AllocationWidget({ config, data }: { config: AllocationConfig; data: InsightsData }) {
  const { preferredCurrency } = useUser();
  const { source } = config;

  // Watchlist / holdings sources need their own members; the net-worth source reuses shared data.
  const [extra, setExtra] = useState<AccountSummary[] | HoldingSummary[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (source.kind === "watchlist") {
      getWatchlistAccounts(source.id).then(r => { if (!cancelled) setExtra(r); }).catch(() => { if (!cancelled) setExtra([]); });
    } else if (source.kind === "holdings") {
      getHoldings(source.accountId).then(r => { if (!cancelled) setExtra(r); }).catch(() => { if (!cancelled) setExtra([]); });
    } else {
      setExtra([]);
    }
    return () => { cancelled = true; };
  }, [source.kind, source.kind === "watchlist" ? source.id : source.kind === "holdings" ? source.accountId : 0, data]);

  const resolved = useMemo(() => {
    if (source.kind === "networth") {
      return { items: data.accounts, groupings: ACCOUNT_GROUPINGS, title: "Net Worth Allocation", itemNoun: "accounts", currency: data.allWatchlist?.displayCurrency ?? preferredCurrency };
    }
    if (source.kind === "watchlist") {
      const wl = data.watchlists.find(w => w.id === source.id);
      return { items: extra as AccountSummary[], groupings: ACCOUNT_GROUPINGS, title: `${wl?.name ?? "Watchlist"} Allocation`, itemNoun: "accounts", currency: wl?.displayCurrency ?? preferredCurrency };
    }
    const acc = data.accounts.find(a => a.id === source.accountId);
    return { items: extra as HoldingSummary[], groupings: HOLDING_GROUPINGS, title: `${acc?.name ?? "Account"} Holdings`, itemNoun: "holdings", currency: acc?.displayCurrency ?? preferredCurrency };
  }, [source, extra, data, preferredCurrency]);

  return (
    <AllocationBreakdown
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      items={resolved.items as any}
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      groupings={resolved.groupings as any}
      currency={resolved.currency}
      title={resolved.title}
      itemNoun={resolved.itemNoun}
      initialGroupingId={config.grouping}
      initialMetric={config.metric}
    />
  );
}
