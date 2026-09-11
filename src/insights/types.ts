import type { EntityType } from "../api/types";

export type WidgetType = "summary" | "netWorth" | "allocation" | "watchlistComparison" | "performance" | "income";
export type WidgetSize = "half" | "full";
export type AllocationMetric = "value" | "invested";

/** Where an allocation widget pulls its items from. */
export type AllocationSource =
  | { kind: "networth" }
  | { kind: "watchlist"; id: number }
  | { kind: "holdings"; accountId: number };

export interface AllocationConfig {
  source: AllocationSource;
  /** grouping id understood by the resolved source (e.g. type/account/currency/holding). */
  grouping: string;
  metric: AllocationMetric;
}

export interface WatchlistComparisonConfig {
  metric: AllocationMetric;
  /** Watchlist ids explicitly hidden; new watchlists show by default. */
  excludedIds: number[];
}

export interface PerformanceConfig {
  entityType: EntityType;
  entityId: number;
  /** Cached label for the header/config summary (entity name). */
  label: string;
}

/** Net-worth / entity summary hero. entityId 0 with entityType "watchlist" means the "All" watchlist. */
export interface SummaryConfig {
  entityType: "watchlist" | "account";
  entityId: number;
  label: string;
}

export type IncomeChartKind = "cumulative" | "bar" | "tax";
export type IncomeGrouping = "month" | "year" | "fy" | "source" | "tag";
export interface IncomeConfig {
  chart: IncomeChartKind;
  grouping: IncomeGrouping;
}

/** The net-worth (savings-rate) chart takes no config — it always tracks total net worth. */
export type NetWorthConfig = Record<string, never>;

export type WidgetConfig =
  | SummaryConfig
  | NetWorthConfig
  | AllocationConfig
  | WatchlistComparisonConfig
  | PerformanceConfig
  | IncomeConfig;

export interface WidgetInstance {
  /** Stable instance id (not the widget type). */
  id: string;
  type: WidgetType;
  size: WidgetSize;
  config: WidgetConfig;
}
