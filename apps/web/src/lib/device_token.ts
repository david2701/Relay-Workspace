/**
 * Browser device token storage for `RELAY_REQUIRE_TOKEN=1`.
 *
 * **localStorage** (not sessionStorage): the token is a long-lived paired-device
 * credential (same model as a phone). sessionStorage would force re-pairing on
 * every tab close, which is poor UX for a home-server console. The token never
 * leaves this origin; revoke from Settings → Devices if the browser is shared.
 */
const STORAGE_KEY = "relay.device_token";

export function readDeviceToken(): string | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeDeviceToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearDeviceToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore quota / private mode
  }
}
