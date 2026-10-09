export type PushReason = "needs_you" | "assigned" | "reminder";

export type PushPayload = {
  item_id: string;
  reason: PushReason;
  /** Truncated title; omitted when RELAY_PUSH_REDACT=1. */
  title?: string;
};

export type PushSendResult =
  | { ok: true }
  | {
      ok: false;
      /** Provider said the token is dead — clear it. */
      invalidToken: boolean;
      status?: number;
      error?: string;
    };

export type PushSender = {
  send(opts: {
    token: string;
    environment: "sandbox" | "production";
    topic: string | null;
    payload: PushPayload;
  }): Promise<PushSendResult>;
  close(): void;
};

/** Actionable notification category (answer / take on the client). */
export const APNS_CATEGORY_RELAY_ITEM = "RELAY_ITEM";
/** Android notification channel for item alerts. */
export const FCM_CHANNEL_ID = "relay_items";
