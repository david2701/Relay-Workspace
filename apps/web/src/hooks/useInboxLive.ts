import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { readDeviceToken } from "../lib/device_token";
import {
  applyInboxDelta,
  ensureAttentionSections,
  isInboxDelta,
} from "../lib/inbox_merge";
import {
  ATTENTION_PAGE_SIZE,
  INBOX_PAGE_SIZE,
} from "../lib/inbox_page";
import type { InboxResult, InboxView, ItemEvent } from "../lib/types";

const OFFLINE_FAILS = 3;
const RECONNECT_BASE_MS = 3000;

export type SyncState = "connected" | "reconnecting" | "offline";

export type UseInboxLiveResult = {
  data: InboxResult | null;
  error: string | null;
  offline: boolean;
  syncState: SyncState;
  lastOkAt: number | null;
  seq: number;
  reload: () => Promise<void>;
  setData: (
    updater:
      | ((prev: InboxResult | null) => InboxResult | null)
      | InboxResult
      | null,
  ) => void;
  /** Item ids touched by the latest SSE batch (for detail refresh). */
  lastEventItemIds: string[];
};

function streamUrl(afterSeq: number, accessToken?: string): string {
  const params = new URLSearchParams();
  if (afterSeq > 0) params.set("after_seq", String(afterSeq));
  if (accessToken) params.set("access_token", accessToken);
  const qs = params.toString();
  return qs.length > 0
    ? `${api.base}/api/stream?${qs}`
    : `${api.base}/api/stream`;
}

async function resolveStreamUrl(afterSeq: number): Promise<string> {
  if (!readDeviceToken()) return streamUrl(afterSeq);
  try {
    const ticket = await api.mintStreamTicket();
    return streamUrl(afterSeq, ticket.access_token);
  } catch {
    // Fall back without ticket (loopback / tokens not required).
    return streamUrl(afterSeq);
  }
}

const EVENT_TYPES = [
  "created",
  "updated",
  "status_changed",
  "assigned",
  "delegated",
  "note_linked",
  "note_unlinked",
  "reminder_set",
  "answered",
  "taken",
  "resync",
] as const;

/**
 * Inbox snapshot + SSE-driven deltas. No polling loop for normal operation;
 * EventSource reconnects with Last-Event-ID / after_seq to recover gaps.
 */
export function useInboxLive(inboxView: InboxView): UseInboxLiveResult {
  const [data, setDataState] = useState<InboxResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("reconnecting");
  const [lastOkAt, setLastOkAt] = useState<number | null>(null);
  const [seq, setSeq] = useState(0);
  const [lastEventItemIds, setLastEventItemIds] = useState<string[]>([]);

  const inboxStateRef = useRef<InboxResult | null>(null);
  const seqRef = useRef(0);
  const fails = useRef(0);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const pendingReload = useRef(false);
  const pendingDelta = useRef(false);
  const esRef = useRef<EventSource | null>(null);
  const inboxViewRef = useRef(inboxView);
  inboxViewRef.current = inboxView;

  const setData = useCallback(
    (
      updater:
        | ((prev: InboxResult | null) => InboxResult | null)
        | InboxResult
        | null,
    ) => {
      setDataState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (next) inboxStateRef.current = next;
        return next;
      });
    },
    [],
  );

  const reload = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    if (inFlight.current) {
      pendingReload.current = true;
      return;
    }
    const gen = generation.current;
    inFlight.current = true;
    try {
      const view = inboxViewRef.current;
      const pageSize =
        view === "attention" ? ATTENTION_PAGE_SIZE : INBOX_PAGE_SIZE;
      const snap = ensureAttentionSections(
        (await api.inbox(view, { limit: pageSize })) as InboxResult,
      );
      if (gen !== generation.current) return;
      inboxStateRef.current = snap;
      setDataState(snap);
      if (typeof snap.seq === "number") {
        seqRef.current = snap.seq;
        setSeq(snap.seq);
      }
      fails.current = 0;
      setError(null);
      setSyncState("connected");
      setLastOkAt(Date.now());
    } catch (err) {
      if (gen !== generation.current) return;
      fails.current += 1;
      setError(err instanceof Error ? err.message : "Error");
      setSyncState(fails.current >= OFFLINE_FAILS ? "offline" : "reconnecting");
    } finally {
      inFlight.current = false;
      if (pendingReload.current && gen === generation.current) {
        pendingReload.current = false;
        void reload();
      }
    }
  }, []);

  const handleStreamSignalRef = useRef<
    (opts: { event?: ItemEvent; resync?: boolean }) => Promise<void>
  >(async () => {});

  handleStreamSignalRef.current = async (opts) => {
    if (inFlight.current) {
      pendingDelta.current = true;
      return;
    }
    const gen = generation.current;
    inFlight.current = true;
    try {
      if (opts.resync) {
        await reload();
        return;
      }
      const view = inboxViewRef.current;
      const current = inboxStateRef.current;
      const ev = opts.event;
      const prevSeq = seqRef.current;
      if (ev) {
        setLastEventItemIds([ev.item_id]);
        if (ev.seq > seqRef.current) {
          seqRef.current = ev.seq;
          setSeq(ev.seq);
        }
      }
      if (!current) {
        await reload();
        return;
      }
      try {
        const payload = await api.inbox(view, { after_seq: prevSeq });
        if (gen !== generation.current) return;
        if (isInboxDelta(payload)) {
          const merged = applyInboxDelta(current, payload);
          if (typeof payload.seq === "number") {
            seqRef.current = Math.max(seqRef.current, payload.seq);
            setSeq(seqRef.current);
          }
          inboxStateRef.current = merged;
          setDataState(merged);
          fails.current = 0;
          setError(null);
          setSyncState("connected");
          setLastOkAt(Date.now());
          return;
        }
      } catch {
        // Fall through.
      }
      if (gen !== generation.current) return;
      await reload();
    } catch (err) {
      if (gen !== generation.current) return;
      fails.current += 1;
      setError(err instanceof Error ? err.message : "Error");
      setSyncState(fails.current >= OFFLINE_FAILS ? "offline" : "reconnecting");
    } finally {
      inFlight.current = false;
      if (pendingReload.current && gen === generation.current) {
        pendingReload.current = false;
        void reload();
      } else if (pendingDelta.current && gen === generation.current) {
        pendingDelta.current = false;
        void handleStreamSignalRef.current({});
      }
    }
  };

  // Initial load + EventSource lifecycle (recreate when lens changes).
  useEffect(() => {
    generation.current += 1;
    const gen = generation.current;
    inboxStateRef.current = null;
    seqRef.current = 0;
    setDataState(null);
    setSeq(0);
    setLastEventItemIds([]);
    setSyncState("reconnecting");

    let closed = false;
    let reconnectTimer: number | null = null;

    const openStream = () => {
      if (closed || gen !== generation.current) return;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      void resolveStreamUrl(seqRef.current).then((url) => {
        if (closed || gen !== generation.current) return;
        const es = new EventSource(url);
        esRef.current = es;

        es.onopen = () => {
          if (closed || gen !== generation.current) return;
          fails.current = 0;
          setSyncState("connected");
          setLastOkAt(Date.now());
          setError(null);
        };

        const onPayload = (ev: MessageEvent, type: string) => {
          if (closed || gen !== generation.current) return;
          if (type === "resync") {
            void handleStreamSignalRef.current({ resync: true });
            return;
          }
          try {
            const parsed = JSON.parse(String(ev.data)) as ItemEvent;
            if (typeof parsed.seq === "number") {
              void handleStreamSignalRef.current({ event: parsed });
            }
          } catch {
            // ignore malformed frames
          }
        };

        for (const t of EVENT_TYPES) {
          es.addEventListener(t, (ev) => {
            onPayload(ev as MessageEvent, t);
          });
        }
        es.onmessage = (ev) => onPayload(ev, "message");

        es.onerror = () => {
          if (closed || gen !== generation.current) return;
          fails.current += 1;
          if (fails.current >= OFFLINE_FAILS) {
            setSyncState("offline");
          } else {
            setSyncState("reconnecting");
          }
          if (es.readyState === EventSource.CLOSED) {
            esRef.current = null;
            if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
            reconnectTimer = window.setTimeout(() => {
              openStream();
            }, RECONNECT_BASE_MS);
          }
        };
      });
    };

    void (async () => {
      try {
        const view = inboxView;
        const pageSize =
          view === "attention" ? ATTENTION_PAGE_SIZE : INBOX_PAGE_SIZE;
        const snap = ensureAttentionSections(
          (await api.inbox(view, { limit: pageSize })) as InboxResult,
        );
        if (gen !== generation.current) return;
        inboxStateRef.current = snap;
        setDataState(snap);
        if (typeof snap.seq === "number") {
          seqRef.current = snap.seq;
          setSeq(snap.seq);
        }
        fails.current = 0;
        setError(null);
        setSyncState("connected");
        setLastOkAt(Date.now());
        openStream();
      } catch (err) {
        if (gen !== generation.current) return;
        fails.current += 1;
        setError(err instanceof Error ? err.message : "Error");
        setSyncState(
          fails.current >= OFFLINE_FAILS ? "offline" : "reconnecting",
        );
        openStream();
      }
    })();

    const onVisibility = () => {
      if (!document.hidden) void reload();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [inboxView, reload]);

  return {
    data,
    error,
    offline: syncState === "offline",
    syncState,
    lastOkAt,
    seq,
    reload,
    setData,
    lastEventItemIds,
  };
}
