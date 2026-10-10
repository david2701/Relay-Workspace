import {
  FCM_TOKEN_SKEW_MS,
  isCachedTokenFresh,
  signRs256Jwt,
} from "./jwt.js";
import {
  FCM_CHANNEL_ID,
  type PushPayload,
  type PushSender,
  type PushSendResult,
} from "./types.js";

export type FcmServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

export type FcmClientOptions = {
  credentials: FcmServiceAccount;
  /** Override Google OAuth token URL (tests). */
  tokenUrl?: string;
  /** Override FCM send URL template; `{projectId}` substituted (tests). */
  sendUrlTemplate?: string;
  now?: () => number;
  fetchImpl?: typeof fetch;
};

export type FcmClient = PushSender & {
  getCachedAccessToken(): string | null;
  mintAccessToken(): Promise<string>;
};

const DEFAULT_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_SEND_TEMPLATE =
  "https://fcm.googleapis.com/v1/projects/{projectId}/messages:send";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

export function createFcmClient(opts: FcmClientOptions): FcmClient {
  const now = opts.now ?? Date.now;
  const fetchImpl = opts.fetchImpl ?? fetch;
  let cached: { value: string; expiresAtMs: number } | null = null;

  function sendUrl(): string {
    const template = opts.sendUrlTemplate ?? DEFAULT_SEND_TEMPLATE;
    return template.replace("{projectId}", opts.credentials.project_id);
  }

  async function mintAccessToken(): Promise<string> {
    const t = now();
    if (isCachedTokenFresh(cached, t)) return cached.value;
    const iat = Math.floor(t / 1000);
    const assertion = signRs256Jwt({
      privateKeyPem: opts.credentials.private_key,
      header: { typ: "JWT" },
      payload: {
        iss: opts.credentials.client_email,
        scope: FCM_SCOPE,
        aud: opts.tokenUrl ?? DEFAULT_TOKEN_URL,
        iat,
        exp: iat + 3600,
      },
    });
    const res = await fetchImpl(opts.tokenUrl ?? DEFAULT_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`FCM OAuth failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as {
      access_token: string;
      expires_in?: number;
    };
    const expiresInMs = (json.expires_in ?? 3600) * 1000;
    cached = {
      value: json.access_token,
      expiresAtMs: t + expiresInMs - FCM_TOKEN_SKEW_MS,
    };
    return json.access_token;
  }

  async function send(input: {
    token: string;
    environment: "sandbox" | "production";
    topic: string | null;
    payload: PushPayload;
  }): Promise<PushSendResult> {
    void input.environment;
    void input.topic;
    try {
      const accessToken = await mintAccessToken();
      const notification: Record<string, string> = {};
      if (input.payload.title) {
        notification.title = "Relay";
        notification.body = input.payload.title;
      } else {
        notification.title = "Relay";
      }
      const body = {
        message: {
          token: input.token,
          notification,
          data: {
            item_id: input.payload.item_id,
            reason: input.payload.reason,
          },
          android: {
            notification: {
              channel_id: FCM_CHANNEL_ID,
            },
          },
        },
      };
      const res = await fetchImpl(sendUrl(), {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (res.ok) return { ok: true };
      const raw = await res.text();
      let errorCode = "";
      try {
        const parsed = JSON.parse(raw) as {
          error?: { status?: string; details?: Array<{ errorCode?: string }> };
        };
        errorCode =
          parsed.error?.details?.[0]?.errorCode ??
          parsed.error?.status ??
          "";
      } catch {
        errorCode = raw;
      }
      const invalidToken =
        errorCode === "UNREGISTERED" ||
        errorCode === "NOT_FOUND" ||
        raw.includes("UNREGISTERED");
      return {
        ok: false,
        invalidToken,
        status: res.status,
        error: errorCode || `fcm_${res.status}`,
      };
    } catch (err) {
      return {
        ok: false,
        invalidToken: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    send,
    close: () => {
      cached = null;
    },
    getCachedAccessToken: () => cached?.value ?? null,
    mintAccessToken,
  };
}
