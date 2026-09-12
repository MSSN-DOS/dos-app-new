"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  ApiError,
  AuthUser,
  clearToken,
  getStoredUser,
  getToken,
  setStoredUser,
  setToken,
  apiFetch,
} from "@/lib/auth/client-fetch";

interface RegisterInput {
  fullName: string;
  identifier: string;
  password: string;
  role: "student" | "aspirant";
}

interface AuthResult {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<AuthResult>;
  register: (input: RegisterInput) => Promise<AuthResult>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Returns false during SSR and the first client render, true afterwards — lets us read
// localStorage (client-only) without a hydration mismatch and without calling setState in an effect.
const emptySubscribe = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  // Hydrate from localStorage once mounted. Done during render (not an effect) to satisfy the
  // react-hooks/set-state-in-effect rule; guarded so it only runs a single time.
  if (mounted && token === null && user === null) {
    const storedToken = getToken();
    const storedUser = getStoredUser();
    if (storedToken && storedUser) {
      setTokenState(storedToken);
      setUser(storedUser);
    }
  }

  const login = useCallback(async (identifier: string, password: string) => {
    const data = await apiFetch<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
    setToken(data.token);
    setStoredUser(data.user);
    setTokenState(data.token);
    setUser(data.user);
    return data;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const data = await apiFetch<{ token: string; user: AuthUser }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
    setToken(data.token);
    setStoredUser(data.user);
    setTokenState(data.token);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading: !mounted,
      isAuthenticated: mounted && Boolean(token && user),
      login,
      register,
      logout,
    }),
    [user, token, mounted, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

export type { ApiError };
