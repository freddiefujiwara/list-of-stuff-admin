// Persistence for the owner's sign-in session. At sign-in the Google
// ID token is exchanged for a 30-day owner session token, and that
// session token (plus the account email, for display only) is what
// gets saved in localStorage and read back at boot — the raw ID token
// expires after about an hour and is never stored.
//
// Production and staging are served from the same origin (paths
// /list-of-stuff-admin/ and /list-of-stuff-admin/staging/) and therefore share localStorage.
// Staging builds use ":staging"-suffixed keys — the convention the
// blog introduced for its list cache — so the two environments can
// never read or clear each other's saved session.
import { isStagingBuild } from "./staging-banner.js";

export const SESSION_TOKEN_STORAGE_KEY = "list-of-stuff-admin-session-token";
export const SESSION_EMAIL_STORAGE_KEY = "list-of-stuff-admin-session-email";

/** The storage key for this build; staging gets a ":staging" suffix. */
export function sessionKey(baseKey, staging = isStagingBuild()) {
  return staging ? `${baseKey}:staging` : baseKey;
}

function readValue(storage, key) {
  try {
    return storage?.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeValue(storage, key, value) {
  try {
    if (value) {
      storage?.setItem(key, value);
    } else {
      storage?.removeItem(key);
    }
  } catch {
    // Storage may be unavailable (private browsing, blocked
    // cookies); the session then stays in memory only.
  }
}

export function loadSavedSessionToken(
  storage = globalThis.localStorage,
  staging = isStagingBuild(),
) {
  return readValue(storage, sessionKey(SESSION_TOKEN_STORAGE_KEY, staging));
}

export function saveSessionToken(
  token,
  storage = globalThis.localStorage,
  staging = isStagingBuild(),
) {
  writeValue(storage, sessionKey(SESSION_TOKEN_STORAGE_KEY, staging), token);
}

export function loadSavedSessionEmail(
  storage = globalThis.localStorage,
  staging = isStagingBuild(),
) {
  return readValue(storage, sessionKey(SESSION_EMAIL_STORAGE_KEY, staging));
}

export function saveSessionEmail(
  email,
  storage = globalThis.localStorage,
  staging = isStagingBuild(),
) {
  writeValue(storage, sessionKey(SESSION_EMAIL_STORAGE_KEY, staging), email);
}

export function clearSavedSession(
  storage = globalThis.localStorage,
  staging = isStagingBuild(),
) {
  writeValue(storage, sessionKey(SESSION_TOKEN_STORAGE_KEY, staging), "");
  writeValue(storage, sessionKey(SESSION_EMAIL_STORAGE_KEY, staging), "");
}
