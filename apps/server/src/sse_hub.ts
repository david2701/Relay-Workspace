import type { ItemEvent, RelayService } from "@relay/core";

export type SseHubOptions = {
  /** Max concurrent SSE clients (default 50). */
  maxConnections?: number;
  /** Behind this many events → `resync` instead of full replay (default 5000). */
  resyncThreshold?: number;
  /** Cross-process MAX(seq) poll interval (default 250 ms). */
  watchIntervalMs?: number;
  /** SSE comment heartbeat interval (default 15_000 ms). */
  heartbeatIntervalMs?: number;
  /** Page size when replaying missed events (default 200). */
  replayPageSize?: number;
};

export type SseClientSink = {
  id: string;
  send: (chunk: string) => void;
  close: () => void;
};

export type SseAttachOptions = {
  /** Authenticated device id — used to close streams on revoke. */
  deviceId?: string | null;
};

export type SseHub = {
  readonly size: number;
  readonly maxConnections: number;
  attach(
    client: SseClientSink,
    afterSeq: number,
    opts?: SseAttachOptions,
  ): Promise<void>;
  detach(clientId: string): void;
  /** Close every open SSE connection for this device (revoke). */
  closeDevice(deviceId: string): void;
  /** Test helper: force one watcher tick. */
  pollOnce(): void;
  close(): void;
};

type LiveClient = SseClientSink & {
  /** Highest seq successfully written to this client. */
  cursor: number;
  /** Buffer while replay is in progress (subscribe-first handover). */
  buffer: ItemEvent[] | null;
  deviceId: string | null;
};

export function formatSseEvent(opts: {
  id?: number | string;
  event?: string;
  data?: string;
  retry?: number;
}): string {
  let out = "";
  if (opts.retry !== undefined) out += `retry: ${opts.retry}\n`;
  if (opts.id !== undefined) out += `id: ${opts.id}\n`;
  if (opts.event !== undefined) out += `event: ${opts.event}\n`;
  if (opts.data !== undefined) {
    for (const line of opts.data.split("\n")) {
      out += `data: ${line}\n`;
    }
  }
  out += "\n";
  return out;
}

export function formatHeartbeat(): string {
  return ": heartbeat\n\n";
}

/**
 * Process-wide SSE fan-out. Detects same-process and cross-process writes by
 * polling `latestSeq()` (SQLite MAX(seq)) on a short interval so clients never
 * need to poll HTTP themselves.
 */
export function createSseHub(
  svc: RelayService,
  options: SseHubOptions = {},
): SseHub {
  const maxConnections = options.maxConnections ?? 50;
  const resyncThreshold = options.resyncThreshold ?? 5000;
  const watchIntervalMs = options.watchIntervalMs ?? 250;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000;
  const replayPageSize = options.replayPageSize ?? 200;

  const clients = new Map<string, LiveClient>();
  let lastKnownSeq = svc.latestSeq();
  let watchTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  function ensureTimers(): void {
    if (watchTimer === null) {
      watchTimer = setInterval(() => {
        pollOnce();
      }, watchIntervalMs);
      if (typeof watchTimer === "object" && "unref" in watchTimer) {
        watchTimer.unref();
      }
    }
    if (heartbeatTimer === null) {
      heartbeatTimer = setInterval(() => {
        const chunk = formatHeartbeat();
        for (const client of clients.values()) {
          try {
            client.send(chunk);
          } catch {
            detach(client.id);
          }
        }
      }, heartbeatIntervalMs);
      if (typeof heartbeatTimer === "object" && "unref" in heartbeatTimer) {
        heartbeatTimer.unref();
      }
    }
  }

  function stopTimersIfIdle(): void {
    if (clients.size > 0) return;
    if (watchTimer !== null) {
      clearInterval(watchTimer);
      watchTimer = null;
    }
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function writeEvent(client: LiveClient, event: ItemEvent): void {
    if (event.seq <= client.cursor) return;
    client.send(
      formatSseEvent({
        id: event.seq,
        event: event.type,
        data: JSON.stringify(event),
      }),
    );
    client.cursor = event.seq;
  }

  function writeResync(
    client: LiveClient,
    afterSeq: number,
    headSeq: number,
  ): void {
    client.send(
      formatSseEvent({
        id: headSeq,
        event: "resync",
        data: JSON.stringify({
          reason: "too_far_behind",
          after_seq: afterSeq,
          head_seq: headSeq,
          threshold: resyncThreshold,
        }),
      }),
    );
    client.cursor = headSeq;
  }

  function fanOut(events: ItemEvent[]): void {
    if (events.length === 0) return;
    for (const client of [...clients.values()]) {
      if (client.buffer !== null) {
        client.buffer.push(...events);
        continue;
      }
      for (const event of events) {
        try {
          writeEvent(client, event);
        } catch {
          detach(client.id);
          break;
        }
      }
    }
  }

  function pollOnce(): void {
    const head = svc.latestSeq();
    if (head <= lastKnownSeq) {
      lastKnownSeq = head;
      return;
    }
    let after = lastKnownSeq;
    while (after < head) {
      const page = svc.listChanges({ after_seq: after, limit: replayPageSize });
      if (page.events.length === 0) break;
      fanOut(page.events);
      after = page.next_seq;
      if (!page.has_more) break;
    }
    lastKnownSeq = Math.max(lastKnownSeq, head, after);
  }

  async function replayTo(client: LiveClient, afterSeq: number): Promise<void> {
    const head = svc.latestSeq();
    if (head - afterSeq > resyncThreshold) {
      writeResync(client, afterSeq, head);
      return;
    }
    let cursor = afterSeq;
    for (;;) {
      const page = svc.listChanges({
        after_seq: cursor,
        limit: replayPageSize,
      });
      for (const event of page.events) {
        writeEvent(client, event);
      }
      if (page.events.length === 0) break;
      cursor = page.next_seq;
      // Yield so a concurrent watcher tick / write can land in the live buffer
      // between pages (correct replay→live handover under load).
      await Promise.resolve();
      if (!page.has_more) break;
    }
  }

  async function attach(
    client: SseClientSink,
    afterSeq: number,
    opts: SseAttachOptions = {},
  ): Promise<void> {
    const live: LiveClient = {
      ...client,
      cursor: afterSeq,
      buffer: [],
      deviceId: opts.deviceId ?? null,
    };
    clients.set(client.id, live);
    ensureTimers();
    client.send(formatSseEvent({ retry: 3000 }));
    try {
      // Subscribe-first: live buffer is already open; replay, then dedupe by seq.
      await replayTo(live, afterSeq);
      const buffered = live.buffer ?? [];
      live.buffer = null;
      for (const event of buffered) {
        writeEvent(live, event);
      }
      pollOnce();
    } catch (err) {
      detach(client.id);
      throw err;
    }
  }

  function detach(clientId: string): void {
    const client = clients.get(clientId);
    if (!client) return;
    clients.delete(clientId);
    try {
      client.close();
    } catch {
      // already closed
    }
    stopTimersIfIdle();
  }

  function closeDevice(deviceId: string): void {
    for (const client of [...clients.values()]) {
      if (client.deviceId === deviceId) {
        detach(client.id);
      }
    }
  }

  function close(): void {
    for (const id of [...clients.keys()]) {
      detach(id);
    }
    stopTimersIfIdle();
  }

  return {
    get size() {
      return clients.size;
    },
    maxConnections,
    attach,
    detach,
    closeDevice,
    pollOnce,
    close,
  };
}
