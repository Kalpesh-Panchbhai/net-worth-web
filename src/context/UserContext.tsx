import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ensureUser } from "../api/client";

interface UserState {
  userId: number | null;
  loading: boolean;
  error: string | null;
}

const UserContext = createContext<UserState>({ userId: null, loading: true, error: null });

export function useUser() {
  return useContext(UserContext);
}

const EXTERNAL_USER_ID = "Ve43CSFGNFgps5eGk3avtSOClgA3";

export function UserProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UserState>({ userId: null, loading: true, error: null });

  useEffect(() => {
    ensureUser(EXTERNAL_USER_ID)
      .then((user) => setState({ userId: user.id, loading: false, error: null }))
      .catch((err) =>
        setState({ userId: null, loading: false, error: err instanceof Error ? err.message : "Failed to load user" })
      );
  }, []);

  return <UserContext.Provider value={state}>{children}</UserContext.Provider>;
}
