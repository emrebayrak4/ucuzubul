import * as LocalAuthentication from "expo-local-authentication";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { LoginRequest, PublicUser, RegisterRequest } from "@pricora/contracts";
import { api, setUnauthorizedHandler } from "./api";
import { clearUserQueries } from "./query";
import {
  extractSessionToken,
  getBiometricEnabled,
  loadSessionToken,
  setBiometricEnabled as persistBiometric,
  setSessionToken,
} from "./session";

interface AuthState {
  user: PublicUser | null;
  /** True until the first /auth/me resolves (or fails). */
  loading: boolean;
  login: (body: LoginRequest) => Promise<PublicUser>;
  register: (body: RegisterRequest) => Promise<PublicUser>;
  logout: () => Promise<void>;
  /** Clears local session state without calling the API (after account deletion / 401). */
  signOutLocally: () => Promise<void>;
  refresh: () => Promise<void>;
  biometricEnabled: boolean;
  setBiometricEnabled: (enabled: boolean) => Promise<boolean>;
  locked: boolean;
  unlock: () => Promise<boolean>;
}

const AuthContext = createContext<AuthState | null>(null);
export const ME_KEY = ["auth", "me"] as const;

type MeData = { user: PublicUser | null; csrfToken: string };

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [tokenLoaded, setTokenLoaded] = useState(false);
  const [biometricEnabled, setBio] = useState(false);
  const [locked, setLocked] = useState(false);
  const bioChecked = useRef(false);

  useEffect(() => {
    void Promise.all([loadSessionToken(), getBiometricEnabled()]).then(([, bio]) => {
      setBio(bio);
      setTokenLoaded(true);
    });
  }, []);

  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: ({ signal }) => api.auth.me({ signal }),
    enabled: tokenLoaded,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const user = me.data?.user ?? null;

  const signOutLocally = useCallback(async () => {
    await setSessionToken(null);
    api.setCsrfToken(null);
    clearUserQueries();
    qc.setQueryData<MeData>(ME_KEY, (prev) => ({ user: null, csrfToken: prev?.csrfToken ?? "" }));
  }, [qc]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (qc.getQueryData<MeData>(ME_KEY)?.user) void signOutLocally();
    });
    return () => setUnauthorizedHandler(null);
  }, [qc, signOutLocally]);

  // Biometric lock: once per cold start, and again when the app returns from background.
  useEffect(() => {
    if (!user || !biometricEnabled || bioChecked.current) return;
    bioChecked.current = true;
    setLocked(true);
  }, [user, biometricEnabled]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background" && biometricEnabled && user) setLocked(true);
    });
    return () => sub.remove();
  }, [biometricEnabled, user]);

  const unlock = useCallback(async () => {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock Pricora" });
    if (res.success) setLocked(false);
    return res.success;
  }, []);

  const setBiometricEnabled = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const [hasHw, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!hasHw || !enrolled) return false;
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: "Confirm to enable biometric unlock" });
      if (!res.success) return false;
    }
    await persistBiometric(enabled);
    setBio(enabled);
    return true;
  }, []);

  const onSession = useCallback(
    async (res: { user: PublicUser; csrfToken: string }) => {
      await setSessionToken(extractSessionToken(res));
      api.setCsrfToken(res.csrfToken);
      qc.setQueryData<MeData>(ME_KEY, { user: res.user, csrfToken: res.csrfToken });
      await qc.invalidateQueries({ queryKey: ["me"] });
      return res.user;
    },
    [qc],
  );

  const login = useCallback(async (body: LoginRequest) => onSession(await api.auth.login(body)), [onSession]);
  const register = useCallback(async (body: RegisterRequest) => onSession(await api.auth.register(body)), [onSession]);
  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Session may already be gone server-side; clear locally regardless.
    }
    await signOutLocally();
  }, [signOutLocally]);
  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ME_KEY });
  }, [qc]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading: !tokenLoaded || me.isPending,
      login,
      register,
      logout,
      signOutLocally,
      refresh,
      biometricEnabled,
      setBiometricEnabled,
      locked: locked && !!user,
      unlock,
    }),
    [user, tokenLoaded, me.isPending, login, register, logout, signOutLocally, refresh, biometricEnabled, setBiometricEnabled, locked, unlock],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const a = useContext(AuthContext);
  if (!a) throw new Error("useAuth must be used inside AuthProvider");
  return a;
}
