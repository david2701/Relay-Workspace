/**
 * Tracks whether the browser must pair before using the API.
 * 401 without/ with a stale token is an expected state, not an error.
 */
import { clearDeviceToken, readDeviceToken } from "./device_token";

export type PairingGateState = {
  /** Server wants device tokens (bind or explicit flag). */
  requireToken: boolean;
  requireTokenExplicit: boolean;
  /** UI should show the calm unpaired / register flow. */
  needsPairing: boolean;
  /** Health probe finished at least once. */
  ready: boolean;
};

type Listener = () => void;

let state: PairingGateState = {
  requireToken: false,
  requireTokenExplicit: false,
  needsPairing: false,
  ready: false,
};

const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getPairingGate(): PairingGateState {
  return state;
}

export function subscribePairingGate(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setPairingGate(patch: Partial<PairingGateState>): void {
  state = { ...state, ...patch };
  emit();
}

/** After a successful claim/register — token already in localStorage. */
export function markBrowserPaired(): void {
  state = { ...state, needsPairing: false, ready: true };
  emit();
}

/**
 * HTTP 401 on a protected route: clear any stored token and enter unpaired.
 * A 401 means auth is required — treat as expected unpaired, not an error.
 */
export function handleUnauthorizedResponse(hadStoredToken: boolean): void {
  if (hadStoredToken) clearDeviceToken();
  state = {
    ...state,
    needsPairing: true,
    ready: true,
    requireToken: true,
  };
  emit();
}

/** Forget the browser token and return to the calm unpaired state. */
export function markBrowserUnpaired(): void {
  clearDeviceToken();
  state = { ...state, needsPairing: true, ready: true };
  emit();
}

export async function refreshPairingGateFromHealth(
  health: {
    require_token?: boolean;
    require_token_explicit?: boolean;
  },
): Promise<void> {
  const requireToken = Boolean(health.require_token);
  const requireTokenExplicit = Boolean(health.require_token_explicit);
  const hasToken = readDeviceToken() !== null;
  state = {
    requireToken,
    requireTokenExplicit,
    needsPairing: requireToken && !hasToken,
    ready: true,
  };
  emit();
}
