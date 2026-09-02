import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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
  logout: () => Promise<void>;
  setPreferredCurrency: (currency: string) => Promise<void>;
}

const UserContext = createContext<UserContextValue>({
  userId: null, firebaseUser: null, preferredCurrency: DEFAULT_CURRENCY, loading: true, error: null,
  logout: async () => {},
  setPreferredCurrency: async () => {},
});

export function useUser() {
  return useContext(UserContext);
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UserState>({ userId: null, firebaseUser: null, preferredCurrency: DEFAULT_CURRENCY, loading: true, error: null });

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

  const logout = async () => {
    await signOut(auth);
    setState({ userId: null, firebaseUser: null, preferredCurrency: DEFAULT_CURRENCY, loading: false, error: null });
  };

  const setPreferredCurrency = async (currency: string) => {
    if (!state.userId || state.preferredCurrency === currency) return;
    // Persist first, then drop cached income data, then flip the preference.
    // Doing it in this order guarantees any refetch triggered by the preference
    // change reads fresh data converted with the new currency (avoids a stale-cache race).
    const user = await updateUserPreferredCurrency(state.userId, currency);
    invalidateCache("incomes");
    setState(s => ({ ...s, preferredCurrency: user.preferredCurrency || currency }));
  };

  return (
    <UserContext.Provider value={{ ...state, logout, setPreferredCurrency }}>
      {children}
    </UserContext.Provider>
  );
}
