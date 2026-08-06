import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  clearAuthSession,
  fetchAuthProfile,
  loadAuthToken,
  loadAuthUser,
  loginOpen,
  storeAuthSession,
} from "@/lib/api";
import {
  consumeAuthRedirect,
  readLoginErrorFromUrl,
} from "@/lib/microsoft-login";
import type { AuthUser } from "@/lib/types";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  isLoggingIn: boolean;
  login: (email: string, name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => loadAuthToken() || null);
  const [user, setUser] = useState<AuthUser | null>(() => loadAuthUser());
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const handleExpired = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener("e-sign-auth-expired", handleExpired);
    return () => window.removeEventListener("e-sign-auth-expired", handleExpired);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const redirected = consumeAuthRedirect();
      if (redirected?.token) {
        storeAuthSession(redirected.token, redirected.user);
        if (!cancelled) {
          setToken(redirected.token);
          setUser(redirected.user);
          setIsBootstrapping(false);
          toast.success(`Welcome, ${redirected.user.name || redirected.user.email}`);
        }
        return;
      }

      const loginError = readLoginErrorFromUrl();
      if (loginError) toast.error(loginError);

      const existingToken = loadAuthToken();
      if (!existingToken) {
        if (!cancelled) setIsBootstrapping(false);
        return;
      }

      try {
        const profile = await fetchAuthProfile();
        if (!cancelled) {
          setToken(existingToken);
          setUser(profile.user);
          storeAuthSession(existingToken, profile.user);
        }
      } catch {
        clearAuthSession();
        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, name?: string) => {
    setIsLoggingIn(true);
    try {
      const session = await loginOpen(email, name);
      storeAuthSession(session.token, session.user);
      setToken(session.token);
      setUser(session.user);
      toast.success(`Welcome, ${session.user.name}`);
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearAuthSession();
    setToken(null);
    setUser(null);
    toast.message("Signed out");
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      isBootstrapping,
      isLoggingIn,
      login,
      logout,
    }),
    [user, token, isBootstrapping, isLoggingIn, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
