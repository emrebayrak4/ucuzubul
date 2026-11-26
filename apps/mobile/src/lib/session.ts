import * as SecureStore from "expo-secure-store";

/**
 * Native session storage.
 * The API's primary auth is the httpOnly cookie `pc_session`. React Native's networking stack keeps cookies
 * (NSHTTPCookieStorage on iOS, OkHttp cookie jar on Android), so cookie auth works as a fallback.
 * Primary native mode (implemented by A04): requests carry `x-pricora-client: native`, login/register return
 * `sessionToken`; we keep it in the Keychain/Keystore and send `Authorization: Bearer <token>` (no CSRF needed).
 */
const TOKEN_KEY = "pricora.session.token";
const BIOMETRIC_KEY = "pricora.biometric.enabled";

let memoryToken: string | null = null;
let loaded = false;

export async function loadSessionToken(): Promise<string | null> {
  if (loaded) return memoryToken;
  try {
    memoryToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    memoryToken = null;
  }
  loaded = true;
  return memoryToken;
}

export function getSessionTokenSync(): string | null {
  return memoryToken;
}

export async function setSessionToken(token: string | null): Promise<void> {
  memoryToken = token;
  loaded = true;
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Secure storage unavailable (e.g. some emulators): keep the in-memory token for this session only.
  }
}

export async function getBiometricEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(BIOMETRIC_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) await SecureStore.setItemAsync(BIOMETRIC_KEY, "1");
    else await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
  } catch {
    // ignore
  }
}

/** Reads an optional `sessionToken` string from an auth response without widening contract types. */
export function extractSessionToken(response: unknown): string | null {
  if (response && typeof response === "object" && "sessionToken" in response) {
    const t = (response as { sessionToken?: unknown }).sessionToken;
    return typeof t === "string" && t.length > 0 ? t : null;
  }
  return null;
}
