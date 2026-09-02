import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User as FirebaseUser } from "firebase/auth";
import { auth } from "../firebase";
import { ensureUser, updateUserPreferredCurrency, invalidateCache } from "../api/client";
import { DEFAULT_CURRENCY } from "../constants";

interface UserState {
  userId: number | null;
  firebaseUser: FirebaseUser | null;
  preferredCurrency: string;
  loading: boolean;
  error: string | null;
}

interface UserContextValue extends UserState {
  /**
   * Bumped whenever every money value in the app becomes stale — a display-currency change or a
   * data refresh. Pages list it in their load-effect dependencies so they refetch in place; this
   * replaces the full `window.location.reload()` those actions used to trigger, which threw away
   * the warm cache and re-ran every page's cold-start fetches.
   */
  dataVersion: number;
  logout: () => Promise<void>;
  setPreferredCurrency: (currency: string) => Promise<void>;
  /** Drops every cached money response and makes mounted pages refetch. */
  refreshAll: () => void;
}

const UserContext = createContext<UserContextValue>({
  userId: null, firebaseUser: null, preferredCurrency: DEFAULT_CURRENCY, loading: true, error: null,
  dataVersion: 0,
  logout: async () => {},
  setPreferredCurrency: async () => {},
  refreshAll: () => {},
});

export function useUser() {
  return useContext(UserContext);
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UserState>({ userId: null, firebaseUser: null, preferredCurrency: DEFAULT_CURRENCY, loading: true, error: null });
  const [dataVersion, setDataVersion] = useState(0);
  // setPreferredCurrency needs the current userId without being re-created (and thus re-rendering
  // every consumer) each time the state object changes.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setState({ userId: null, firebaseUser: null, preferredCurrency: DEFAULT_CURRENCY, loading: false, error: null });
        return;
      }
      try {
        const user = await ensureUser(firebaseUser.uid);
        setState({ userId: user.id, firebaseUser, preferredCurrency: user.preferredCurrency || DEFAULT_CURRENCY, loading: false, error: null });
      } catch (err) {
        setState({
          userId: null, firebaseUser, preferredCurrency: DEFAULT_CURRENCY,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load user",
        });
      }
    });
    return unsubscribe;
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    invalidateCache();
    setState({ userId: null, firebaseUser: null, preferredCurrency: DEFAULT_CURRENCY, loading: false, error: null });
  }, []);

  const refreshAll = useCallback(() => {
    invalidateCache();
    setDataVersion(v => v + 1);
  }, []);

  const setPreferredCurrency = useCallback(async (currency: string) => {
    const { userId, preferredCurrency } = stateRef.current;
    if (!userId || preferredCurrency === currency) return;
    // Conversion happens server-side, so every cached response is now labelled with the old
    // currency. Persist first — showing a currency the server did not accept would leave the UI
    // and the data disagreeing — then drop the cache and let mounted pages refetch.
    const user = await updateUserPreferredCurrency(userId, currency);
    setState(s => ({ ...s, preferredCurrency: user.preferredCurrency || currency }));
    refreshAll();
  }, [refreshAll]);

  // A fresh value object on every render re-renders every useUser() consumer, which is every page
  // plus the layout chrome.
  const value = useMemo(
    () => ({ ...state, dataVersion, logout, setPreferredCurrency, refreshAll }),
    [state, dataVersion, logout, setPreferredCurrency, refreshAll],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
