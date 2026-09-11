import { useCallback, useEffect, useRef, useState } from "react";
import { getInsightsLayout, saveInsightsLayout } from "../api/client";
import type { WidgetInstance } from "./types";

const KEY = (userId: number | null | undefined) => `insights:layout:${userId ?? "anon"}`;

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
    { id: newWidgetId(), type: "income", size: "full", config: { chart: "cumulative", grouping: "month" } },
  ];
}

function readLocal(userId: number | null | undefined): WidgetInstance[] | null {
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WidgetInstance[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch { return null; }
}

function writeLocal(userId: number | null | undefined, layout: WidgetInstance[]) {
  try { localStorage.setItem(KEY(userId), JSON.stringify(layout)); } catch { /* ignore */ }
}

/**
 * Per-user widget layout, synced to the backend so it follows the user across devices.
 *
 * localStorage is a fast, offline-tolerant cache: we paint from it immediately, then reconcile with
 * the server copy. Saves are debounced to the backend and mirrored locally, so an offline/failed
 * save still survives a reload and syncs on the next successful write.
 */
export function useInsightsLayout(userId: number | null | undefined): [WidgetInstance[], (next: WidgetInstance[]) => void, boolean] {
  const [layout, setLayout] = useState<WidgetInstance[]>(() => readLocal(userId) ?? defaultLayout());
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    const local = readLocal(userId);
    if (local) setLayout(local);
    if (!userId) { setLoaded(true); return; }
    (async () => {
      try {
        const res = await getInsightsLayout(userId);
        const remote = res?.layout;
        if (cancelled) return;
        if (Array.isArray(remote) && remote.length > 0) {
          setLayout(remote as WidgetInstance[]);
          writeLocal(userId, remote as WidgetInstance[]);
        } else if (!local) {
          setLayout(defaultLayout());
        }
      } catch {
        if (!cancelled && !local) setLayout(defaultLayout());
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const persist = useCallback((next: WidgetInstance[]) => {
    setLayout(next);
    writeLocal(userId, next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // Debounced so a burst of edits (drag, resize) collapses into one PUT. localStorage already
    // holds the change, so a failed backend save is non-fatal — it re-syncs on the next write.
    saveTimer.current = setTimeout(() => {
      if (userId) saveInsightsLayout(userId, next).catch(() => { /* offline: kept in localStorage */ });
    }, 600);
  }, [userId]);

  return [layout, persist, loaded];
}
