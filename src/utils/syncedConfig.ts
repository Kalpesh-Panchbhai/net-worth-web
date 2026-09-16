import { useCallback, useEffect, useRef, useState } from "react";
import { getUserConfig, saveUserConfig } from "../api/client";

/**
 * A per-user setting that syncs across devices via the backend `user-config` store, backed by an
 * offline-first localStorage cache — the same shape as the Insights layout sync.
 *
 * localStorage is painted immediately so the UI is instant and survives being offline; the server
 * copy is then fetched and reconciled. Writes update state + localStorage synchronously and debounce
 * a single PATCH to the backend, so a failed/offline save is non-fatal and re-syncs on the next write.
 */

const localKey = (key: string, userId: number | null | undefined) => `cfg:${key}:${userId ?? "anon"}`;

function readLocal<T>(key: string, userId: number | null | undefined): T | null {
  try {
    const raw = localStorage.getItem(localKey(key, userId));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

function writeLocal<T>(key: string, userId: number | null | undefined, value: T) {
  try { localStorage.setItem(localKey(key, userId), JSON.stringify(value)); } catch { /* ignore */ }
}

export function useSyncedConfig<T>(
  userId: number | null | undefined,
  key: string,
  defaultValue: T,
): [T, (next: T) => void, boolean] {
  const [value, setValue] = useState<T>(() => readLocal<T>(key, userId) ?? defaultValue);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    const local = readLocal<T>(key, userId);
    if (local != null) setValue(local);
    else setValue(defaultValue);
    if (!userId) { setLoaded(true); return; }
    (async () => {
      try {
        const res = await getUserConfig<T>(userId, key);
        if (cancelled) return;
        if (res?.value != null) {
          setValue(res.value);
          writeLocal(key, userId, res.value);
        }
      } catch { /* offline: keep local/default */ }
      finally { if (!cancelled) setLoaded(true); }
    })();
    return () => { cancelled = true; };
    // defaultValue is intentionally omitted: callers pass a fresh literal each render.
  }, [userId, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback((next: T) => {
    setValue(next);
    writeLocal(key, userId, next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (userId) saveUserConfig(userId, key, next).catch(() => { /* offline: kept in localStorage */ });
    }, 600);
  }, [userId, key]);

  return [value, persist, loaded];
}
