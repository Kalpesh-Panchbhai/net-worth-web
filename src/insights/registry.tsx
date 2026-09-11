import type { ReactNode } from "react";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import DonutLargeRoundedIcon from "@mui/icons-material/DonutLargeRounded";
import PieChartRoundedIcon from "@mui/icons-material/PieChartRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import SummaryWidget from "./widgets/SummaryWidget";
import NetWorthWidget from "./widgets/NetWorthWidget";
import AllocationWidget from "./widgets/AllocationWidget";
import WatchlistComparisonWidget from "./widgets/WatchlistComparisonWidget";
import PerformanceWidget from "./widgets/PerformanceWidget";
import IncomeWidget from "./widgets/IncomeWidget";
import type {
  WidgetType, WidgetConfig, WidgetInstance,
  SummaryConfig, AllocationConfig, WatchlistComparisonConfig, PerformanceConfig, IncomeConfig,
} from "./types";
import type { InsightsData } from "./useInsightsData";

export const WIDGET_META: Record<WidgetType, { label: string; description: string; icon: ReactNode; defaultConfig: WidgetConfig; configurable: boolean }> = {
  summary: {
    label: "Summary",
    description: "Headline value, invested, P&L, today and XIRR for net worth, a watchlist or account.",
    icon: <AccountBalanceWalletRoundedIcon />,
    defaultConfig: { entityType: "watchlist", entityId: 0, label: "Net Worth" } satisfies SummaryConfig,
    configurable: true,
  },
  netWorth: {
    label: "Net Worth",
    description: "Value, invested and savings-rate (Saved %) over time for total net worth.",
    icon: <SavingsRoundedIcon />,
    defaultConfig: {},
    configurable: false,
  },
  performance: {
    label: "Performance chart",
    description: "Value over time with forecast and best/worst — for a watchlist, account or holding.",
    icon: <ShowChartRoundedIcon />,
    defaultConfig: { entityType: "watchlist", entityId: 0, label: "Net Worth" } satisfies PerformanceConfig,
    configurable: true,
  },
  allocation: {
    label: "Allocation",
    description: "Donut of net worth, a watchlist, or a broker's holdings, by type/account/currency.",
    icon: <DonutLargeRoundedIcon />,
    defaultConfig: { source: { kind: "networth" }, grouping: "type", metric: "value" } satisfies AllocationConfig,
    configurable: true,
  },
  watchlistComparison: {
    label: "Watchlist comparison",
    description: "One donut comparing selectable watchlists.",
    icon: <PieChartRoundedIcon />,
    defaultConfig: { metric: "value", excludedIds: [] } satisfies WatchlistComparisonConfig,
    // Fully controlled from the card (metric toggle + chips), so there is nothing to configure.
    configurable: false,
  },
  income: {
    label: "Income",
    description: "Cumulative income, income breakdown, or effective tax-rate trend.",
    icon: <PaymentsRoundedIcon />,
    defaultConfig: { chart: "cumulative", grouping: "month" } satisfies IncomeConfig,
    configurable: true,
  },
};

export const WIDGET_ORDER: WidgetType[] = ["summary", "netWorth", "performance", "allocation", "watchlistComparison", "income"];

/** Renders a widget instance with the shared data; `onConfigChange` persists in-card edits (chips). */
export function WidgetView({ instance, data, onConfigChange }: {
  instance: WidgetInstance;
  data: InsightsData;
  onConfigChange: (config: WidgetConfig) => void;
}) {
  switch (instance.type) {
    case "summary":
      return <SummaryWidget config={instance.config as SummaryConfig} data={data} />;
    case "netWorth":
      return <NetWorthWidget data={data} />;
    case "allocation":
      return <AllocationWidget config={instance.config as AllocationConfig} data={data} />;
    case "watchlistComparison":
      return <WatchlistComparisonWidget config={instance.config as WatchlistComparisonConfig} data={data} onConfigChange={onConfigChange} />;
    case "performance":
      return <PerformanceWidget config={instance.config as PerformanceConfig} data={data} />;
    case "income":
      return <IncomeWidget config={instance.config as IncomeConfig} data={data} />;
    default:
      return null;
  }
}
