import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { ApiError, getSession, request } from "./api";
import type { Session, User } from "./api";
import { clearUserDrafts } from "./chatDrafts";

type AuthState = {
  user: User | null;
  loading: boolean;
  previewMode: boolean;
  error: string;
  refresh: () => Promise<void>;
  setUser: (user: User | null) => void;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const session = await getSession();
      setUser(session.user);
      setPreviewMode(Boolean(session.previewMode));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to load your account.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function signOut() {
    try {
      const session = await request<Session>("/auth/logout/", "POST", {});
      if (user) clearUserDrafts(user.id);
      setUser(session.user);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        if (user) clearUserDrafts(user.id);
        setUser(null);
      } else throw error;
    }
  }
  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, previewMode, error, refresh, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth requires AuthProvider");
  return context;
}
