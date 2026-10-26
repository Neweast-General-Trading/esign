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
  exchangeIntranetLink,
  exchangeSsoToken,
  fetchAuthProfile,
  loadAuthToken,
  loadAuthUser,
  loginOpen,
  storeAuthSession,
} from "@/lib/api";
import { consumeIntranetLinkFromQuery } from "@/lib/intranet-link-auth";
import {
  consumeAuthRedirect,
  consumeTokenFromQuery,
  readLoginErrorFromUrl,
  startMicrosoftLogin,
} from "@/lib/microsoft-login";
import type { AuthUser } from "@/lib/types";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  isLoggingIn: boolean;
  login: (email: string, name?: string) => Promise<void>;
  loginWithMicrosoft: () => void;
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
      const loginError = readLoginErrorFromUrl();
      if (loginError) toast.error(loginError);

      // 1) Microsoft OAuth callback hash
      const redirected = consumeAuthRedirect();
      if (redirected?.token) {
        const sessionUser: AuthUser = {
          ...redirected.user,
          authSource: "microsoft",
        };
        storeAuthSession(redirected.token, sessionUser);
        if (!cancelled) {
          setToken(redirected.token);
          setUser(sessionUser);
          setIsBootstrapping(false);
          toast.success(`Welcome, ${sessionUser.name || sessionUser.email}`);
        }
        return;
      }

      // 2) Intranet OTP link (?uSrId=&LoTp=&co=)
      const intranetLink = consumeIntranetLinkFromQuery();
      if (intranetLink) {
        try {
          const session = await exchangeIntranetLink(intranetLink);
          if (cancelled) return;
          const sessionUser: AuthUser = {
            ...session.user,
            authSource: "intranet",
          };
          storeAuthSession(session.token, sessionUser);
          setToken(session.token);
          setUser(sessionUser);
          setIsBootstrapping(false);
          toast.success(`Welcome, ${sessionUser.name || sessionUser.email}`);
          return;
        } catch {
          if (!cancelled) {
            toast.error("Invalid or expired Intranet login link");
          }
        }
      }

      // 3) Shared Intranet JWT (?token= / ?jwt=)
      const sharedToken = consumeTokenFromQuery();
      if (sharedToken) {
        try {
          const session = await exchangeSsoToken(sharedToken);
          if (cancelled) return;
          const sessionUser: AuthUser = {
            ...session.user,
            authSource: "intranet",
          };
          storeAuthSession(session.token, sessionUser);
          setToken(session.token);
          setUser(sessionUser);
          setIsBootstrapping(false);
          toast.success(`Welcome, ${sessionUser.name || sessionUser.email}`);
          return;
        } catch {
          if (!cancelled) {
            toast.error("Could not sign in with the Intranet session");
          }
        }
      }

      // 4) Existing stored session
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

  const loginWithMicrosoft = useCallback(() => {
    setIsLoggingIn(true);
    startMicrosoftLogin({ silent: false });
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
      loginWithMicrosoft,
      logout,
    }),
    [user, token, isBootstrapping, isLoggingIn, login, loginWithMicrosoft, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
