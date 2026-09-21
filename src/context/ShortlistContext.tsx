import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getUserConfig, saveUserConfig } from "../api/client";

interface ShortlistCtx {
  starred: Set<number>;
  isStarred: (schemeCode: number) => boolean;
  toggle: (schemeCode: number) => void;
}

const Ctx = createContext<ShortlistCtx>({ starred: new Set(), isStarred: () => false, toggle: () => {} });

/** Access the user's starred mutual funds (persisted in the per-user config store). */
export function useShortlist() {
  return useContext(Ctx);
}

const KEY = "mf_shortlist";

/** Loads the shortlist once per session and persists every toggle back to the config store. */
export function ShortlistProvider({ userId, children }: { userId: number; children: ReactNode }) {
  const [starred, setStarred] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    getUserConfig<number[]>(userId, KEY)
      .then(res => { if (!cancelled && Array.isArray(res.value)) setStarred(new Set(res.value)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  const toggle = (schemeCode: number) => {
    setStarred(prev => {
      const next = new Set(prev);
      if (next.has(schemeCode)) next.delete(schemeCode); else next.add(schemeCode);
      // Fire-and-forget: the UI is already updated; a failed save just means it won't persist.
      saveUserConfig(userId, KEY, [...next]).catch(() => {});
      return next;
    });
  };

  return (
    <Ctx.Provider value={{ starred, isStarred: (c) => starred.has(c), toggle }}>
      {children}
    </Ctx.Provider>
  );
}
