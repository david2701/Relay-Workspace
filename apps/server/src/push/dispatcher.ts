import {
  type DevicePushTarget,
  type ItemEvent,
  PUSH_TITLE_MAX_LENGTH,
  type RelayService,
  USER_ACTOR_ID,
} from "@relay/core";
import type { SseHub } from "../sse_hub.js";
import type { ApnsClient } from "./apns.js";
import type { PushRuntimeConfig } from "./config.js";
import type { FcmClient } from "./fcm.js";
import type { PushPayload, PushReason, PushSender } from "./types.js";

export type PushDispatcherOptions = {
  svc: RelayService;
  hub: SseHub;
  config: PushRuntimeConfig;
  apns?: ApnsClient | null;
  fcm?: FcmClient | null;
  log?: (line: string) => void;
  now?: () => number;
};

export type PushDispatcher = {
  /** Handle a batch of item_events (from the SSE hub subscription). */
  handleEvents(events: ItemEvent[]): Promise<void>;
  /** Test helper: force process pending without waiting. */
  flush(): Promise<void>;
  close(): void;
  /** Test helper: recent send count. */
  readonly sentCount: number;
};

type DedupeKey = string;

function truncateTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= PUSH_TITLE_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, PUSH_TITLE_MAX_LENGTH - 1)}…`;
}

function reasonFromEvent(event: ItemEvent): PushReason | null {
  if (event.type === "status_changed") {
    const to = event.payload.to;
    if (to === "needs_you") return "needs_you";
    return null;
  }
  if (event.type === "created") {
    if (event.payload.status === "needs_you") return "needs_you";
    if (
      event.payload.assignee_type === "user" ||
      event.payload.assignee_id === USER_ACTOR_ID
    ) {
      return "assigned";
    }
    return null;
  }
  if (event.type === "assigned") {
    if (
      event.payload.assignee_type === "user" ||
      event.payload.assignee_id === USER_ACTOR_ID
    ) {
      return "assigned";
    }
    return null;
  }
  if (event.type === "reminder_fired") return "reminder";
  return null;
}

function titleForEvent(
  event: ItemEvent,
  svc: RelayService,
  redact: boolean,
): string | undefined {
  if (redact) return undefined;
  const fromPayload = event.payload.title;
  if (typeof fromPayload === "string" && fromPayload.trim()) {
    return truncateTitle(fromPayload);
  }
  try {
    return truncateTitle(svc.getItem(event.item_id).title);
  } catch {
    return undefined;
  }
}

export function createPushDispatcher(
  opts: PushDispatcherOptions,
): PushDispatcher {
  const log = opts.log ?? ((line: string) => console.info(line));
  const now = opts.now ?? Date.now;
  const dedupe = new Map<DedupeKey, number>();
  let sentCount = 0;
  let closed = false;
  let chain: Promise<void> = Promise.resolve();

  const unsubscribe = opts.hub.subscribe((events) => {
    chain = chain
      .then(() => handleEvents(events))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log(`Push: dispatcher error: ${message}`);
      });
  });

  function pruneDedupe(t: number): void {
    for (const [key, at] of dedupe) {
      if (t - at > opts.config.dedupeWindowMs) dedupe.delete(key);
    }
  }

  function senderFor(platform: DevicePushTarget["platform"]): PushSender | null {
    if (platform === "apns") return opts.apns ?? null;
    if (platform === "fcm") return opts.fcm ?? null;
    return null;
  }

  async function deliverToDevice(
    target: DevicePushTarget,
    payload: PushPayload,
  ): Promise<void> {
    if (target.muted) return;
    if (
      opts.config.skipOpenSse &&
      opts.hub.hasDeviceStream(target.device_id)
    ) {
      return;
    }
    const t = now();
    const key = `${target.device_id}:${payload.item_id}:${payload.reason}`;
    pruneDedupe(t);
    const prev = dedupe.get(key);
    if (prev !== undefined && t - prev < opts.config.dedupeWindowMs) return;
    const sender = senderFor(target.platform);
    if (!sender) return;
    dedupe.set(key, t);
    const result = await sender.send({
      token: target.token,
      environment: target.environment,
      topic: target.topic,
      payload,
    });
    if (result.ok) {
      sentCount += 1;
      return;
    }
    if (result.invalidToken) {
      opts.svc.clearDevicePushByToken(target.token);
      log(
        `Push: cleared invalid ${target.platform} token for device ${target.device_id}`,
      );
      return;
    }
    log(
      `Push: send failed device=${target.device_id} reason=${payload.reason} error=${result.error ?? "unknown"}`,
    );
  }

  async function handleEvents(events: ItemEvent[]): Promise<void> {
    if (closed || !opts.config.enabled) return;
    for (const event of events) {
      const reason = reasonFromEvent(event);
      if (!reason) continue;
      const payload: PushPayload = {
        item_id: event.item_id,
        reason,
      };
      const title = titleForEvent(event, opts.svc, opts.config.redact);
      if (title !== undefined) payload.title = title;
      const targets = opts.svc.listDevicePushTargets();
      for (const target of targets) {
        await deliverToDevice(target, payload);
      }
    }
  }

  return {
    handleEvents,
    async flush() {
      await chain;
    },
    close() {
      closed = true;
      unsubscribe();
      opts.apns?.close();
      opts.fcm?.close();
    },
    get sentCount() {
      return sentCount;
    },
  };
}
