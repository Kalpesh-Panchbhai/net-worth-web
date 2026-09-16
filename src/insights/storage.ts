import { useMemo } from "react";
import { useSyncedConfig } from "../utils/syncedConfig";
import type { WidgetInstance } from "./types";

let counter = 0;
/** Short unique id for a widget instance. */
export function newWidgetId(): string {
  counter += 1;
  return `w_${Date.now().toString(36)}_${counter}`;
}

/** The layout a fresh user sees before customising anything. */
export function defaultLayout(): WidgetInstance[] {
  return [
    { id: newWidgetId(), type: "summary", size: "full", config: { entityType: "watchlist", entityId: 0, label: "Net Worth" } },
    { id: newWidgetId(), type: "netWorth", size: "full", config: {} },
    { id: newWidgetId(), type: "performance", size: "full", config: { entityType: "watchlist", entityId: 0, label: "Net Worth" } },
    { id: newWidgetId(), type: "allocation", size: "half", config: { source: { kind: "networth" }, grouping: "type", metric: "value" } },
    { id: newWidgetId(), type: "watchlistComparison", size: "half", config: { metric: "value", excludedIds: [] } },
    { id: newWidgetId(), type: "goals", size: "half", config: {} },
    { id: newWidgetId(), type: "income", size: "full", config: { chart: "cumulative", grouping: "month" } },
  ];
}

/**
 * Per-user Insights dashboard layout, synced across devices via the generic `user-config` store
 * (key `insights`) — one table for every per-user setting. Offline-first: painted from a
 * localStorage cache, reconciled with the server, and saved with a debounced write.
 */
export function useInsightsLayout(userId: number | null | undefined): [WidgetInstance[], (next: WidgetInstance[]) => void, boolean] {
  // A stable default so the fresh-user fallback keeps consistent widget ids across renders.
  const fallback = useMemo(() => defaultLayout(), []);
  return useSyncedConfig<WidgetInstance[]>(userId, "insights", fallback);
}
