import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User as FirebaseUser } from "firebase/auth";
import { auth } from "../firebase";
import { ensureUser } from "../api/client";

interface UserState {
  userId: number | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  error: string | null;
}

const UserContext = createContext<UserState & { logout: () => Promise<void> }>({
  userId: null, firebaseUser: null, loading: true, error: null,
  logout: async () => {},
});

export function useUser() {
  return useContext(UserContext);
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UserState>({ userId: null, firebaseUser: null, loading: true, error: null });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setState({ userId: null, firebaseUser: null, loading: false, error: null });
        return;
      }
      try {
        const user = await ensureUser(firebaseUser.uid);
        setState({ userId: user.id, firebaseUser, loading: false, error: null });
      } catch (err) {
        setState({
          userId: null, firebaseUser,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load user",
        });
      }
    });
    return unsubscribe;
  }, []);

  const logout = async () => {
    await signOut(auth);
    setState({ userId: null, firebaseUser: null, loading: false, error: null });
  };

  return (
    <UserContext.Provider value={{ ...state, logout }}>
      {children}
    </UserContext.Provider>
  );
}
