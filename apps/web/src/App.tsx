import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActorMark } from "./components/ActorMark";
import { DetailPanel } from "./components/DetailPanel";
import { ItemRow } from "./components/ItemRow";
import { ThemeSwitch } from "./components/ThemeSwitch";
import { VirtualItemList } from "./components/VirtualItemList";
import { usePoll } from "./hooks/usePoll";
import { useTheme } from "./hooks/useTheme";
import { markForOwner } from "./lib/actor_mark";
import { api } from "./lib/api";
import { copy } from "./lib/copy";
import { applyInboxDelta, isInboxDelta } from "./lib/inbox_merge";
import type {
  Agent,
  AppView,
  InboxResult,
  InboxView,
  Note,
  Recommendation,
  WorkItem,
} from "./lib/types";
import {
  assertNoDuplicateIds,
  buildViewSections,
  type LingerRow,
} from "./lib/view_model";
import "./components/ActorMark.css";
import "./App.css";

const VIEWS: { id: AppView; label: string }[] = [
  { id: "attention", label: copy.nav.attention },
  { id: "agent_wip", label: copy.nav.agent_wip },
  { id: "upcoming", label: copy.nav.upcoming },
  { id: "done", label: copy.nav.done },
  { id: "all", label: copy.nav.all },
  { id: "notes", label: copy.nav.notes },
];

function dismissedKey(id: string): string {
  return `relay.dismiss.${id}`;
}

export default function App() {
  const { theme, setTheme } = useTheme();
  const [view, setView] = useState<AppView>("attention");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [capture, setCapture] = useState("");
  const [pendingRows, setPendingRows] = useState<WorkItem[]>([]);
  const [lingerRows, setLingerRows] = useState<LingerRow[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [suggestedCollapsed, setSuggestedCollapsed] = useState(
    () => localStorage.getItem("relay.suggested.collapsed") === "1",
  );
  const [dismissTick, setDismissTick] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showHowto, setShowHowto] = useState(false);
  const [toast, setToast] = useState<{
    text: string;
    undo?: () => void;
  } | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [filter, setFilter] = useState("");
  const [gPending, setGPending] = useState(false);
  const captureRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prevUpdated = useRef<Map<string, string>>(new Map());
  const prevItems = useRef<Map<string, WorkItem>>(new Map());
  const prevView = useRef<InboxView>("attention");
  const viewEpoch = useRef(0);
  const hydratedView = useRef<InboxView | null>(null);
  const syncAge = useRef(0);
  const syncCursorRef = useRef<string | null>(null);
  const inboxStateRef = useRef<InboxResult | null>(null);
  const [tick, setTick] = useState(0);

  const selectView = useCallback((next: AppView) => {
    if (next === view) return;
    // Wipe linger synchronously so the first paint of the new view never
    // inherits rows from the previous lens (BUG-2).
    viewEpoch.current += 1;
    hydratedView.current = null;
    prevItems.current = new Map();
    prevUpdated.current = new Map();
    setLingerRows([]);
    setView(next);
  }, [view]);

  useEffect(() => {
    void api.agents().then((r) => setAgents(r.agents));
  }, []);

  const inboxView: InboxView = view === "notes" ? "attention" : view;

  // Reset incremental sync when the lens changes (usePoll also clears data).
  useEffect(() => {
    syncCursorRef.current = null;
    inboxStateRef.current = null;
  }, [inboxView]);

  const {
    data: inboxRaw,
    error,
    offline,
    lastOkAt,
    setData: setInboxRaw,
    reload,
  } = usePoll<InboxResult>(
    async () => {
      if (syncCursorRef.current && inboxStateRef.current) {
        try {
          const payload = await api.inbox(inboxView, {
            since: syncCursorRef.current,
          });
          if (isInboxDelta(payload)) {
            const merged = applyInboxDelta(inboxStateRef.current, payload);
            syncCursorRef.current = payload.sync_cursor;
            inboxStateRef.current = merged;
            return merged;
          }
          // Server returned a full snapshot (or pre-delta shape) — adopt it.
          const snap = payload as InboxResult;
          syncCursorRef.current = snap.sync_cursor ?? null;
          inboxStateRef.current = snap;
          return snap;
        } catch {
          // Fall through to full snapshot on delta errors.
        }
      }
      const snap = (await api.inbox(inboxView)) as InboxResult;
      syncCursorRef.current = snap.sync_cursor ?? null;
      inboxStateRef.current = snap;
      return snap;
    },
    [inboxView],
  );

  const setInbox = useCallback(
    (updater: ((prev: InboxResult | null) => InboxResult | null) | InboxResult | null) => {
      setInboxRaw((prev) => {
        const next =
          typeof updater === "function" ? updater(prev) : updater;
        if (next) inboxStateRef.current = next;
        return next;
      });
    },
    [setInboxRaw],
  );

  // Ignore a previous view's payload while the matching fetch is in flight.
  const inbox =
    inboxRaw && inboxRaw.view === inboxView ? inboxRaw : null;

  useEffect(() => {
    if (view !== "notes") return;
    void api.notes().then((r) => setNotes(r.notes));
  }, [view, lastOkAt]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedItem(null);
      return;
    }
    void api.getItem(selectedId).then((r) => setSelectedItem(r.item));
    const id = window.setInterval(() => {
      void api.getItem(selectedId).then((r) => {
        setSelectedItem((prev) => {
          if (prev && document.activeElement?.closest("[contenteditable], textarea, input")) {
            if (prev.updated_at !== r.item.updated_at) {
              flash(r.item.id);
            }
            return prev.title === r.item.title ? { ...r.item, title: prev.title } : r.item;
          }
          if (prev && prev.updated_at !== r.item.updated_at) flash(r.item.id);
          return r.item;
        });
      });
    }, 750);
    return () => window.clearInterval(id);
  }, [selectedId]);

  // Keep prevView in sync when the lens changes (linger already wiped in selectView).
  useEffect(() => {
    prevView.current = inboxView;
  }, [inboxView]);

  useEffect(() => {
    if (!inbox) return;
    const epoch = viewEpoch.current;
    const nextMap = new Map<string, string>();
    const nextItems = new Map<string, WorkItem>();
    for (const item of inbox.items) {
      const prev = prevUpdated.current.get(item.id);
      if (prev && prev !== item.updated_at) flash(item.id);
      nextMap.set(item.id, item.updated_at);
      nextItems.set(item.id, item);
    }
    // Drop linger once the item is present again in this view.
    setLingerRows((rows) =>
      rows.filter(
        (r) =>
          r.fromView === inboxView &&
          !nextItems.has(r.item.id) &&
          r.until > Date.now(),
      ),
    );
    // Only detect departures after this view has hydrated once — never treat
    // the first payload after a switch as "everything left" (BUG-2).
    const canLinger =
      hydratedView.current === inboxView && prevView.current === inboxView;
    if (canLinger) {
      const leftIds = [...prevItems.current.keys()].filter(
        (id) => !nextItems.has(id),
      );
      for (const id of leftIds) {
        const fromView = inboxView;
        const captureEpoch = epoch;
        void api.getItem(id).then(({ item }) => {
          if (viewEpoch.current !== captureEpoch) return;
          if (prevView.current !== fromView) return;
          if (prevItems.current.has(id)) return;
          const until = Date.now() + 2000;
          setLingerRows((rows) => [
            ...rows.filter((r) => r.item.id !== id),
            { item, fromView, until },
          ]);
          flash(item.id);
          window.setTimeout(() => {
            if (viewEpoch.current !== captureEpoch) return;
            setLingerRows((rows) => rows.filter((r) => r.item.id !== id));
          }, 2100);
        });
      }
    }
    prevUpdated.current = nextMap;
    prevItems.current = nextItems;
    prevView.current = inboxView;
    hydratedView.current = inboxView;
  }, [inbox, inboxView]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (lastOkAt) {
        syncAge.current = Math.max(0, Math.round((Date.now() - lastOkAt) / 1000));
        setTick((t) => t + 1);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [lastOkAt]);

  function flash(id: string) {
    setFlashIds((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      setFlashIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }, 800);
  }

  const viewSections = useMemo(() => {
    const sections = buildViewSections({
      inbox,
      inboxView,
      lingerRows,
      pendingRows,
      filter,
      now: Date.now(),
    });
    if (import.meta.env.DEV && sections.length > 0) {
      assertNoDuplicateIds(sections, inboxView);
    }
    return sections;
  }, [inbox, inboxView, lingerRows, pendingRows, filter, tick]);

  const flatItems = useMemo(
    () => viewSections.flatMap((s) => s.items),
    [viewSections],
  );

  // Rail Atención counter: when Atención is painted, use the rendered
  // Te necesita row count (same list as the header · N). Otherwise use
  // the last known server counter so the rail stays coherent off-view.
  const renderedNeedsYou = viewSections.find(
    (s) => s.key === "needs_you",
  )?.items.length;
  const needsYouCount =
    renderedNeedsYou !== undefined
      ? renderedNeedsYou
      : (inboxRaw?.counters.needs_you ?? 0);

  useEffect(() => {
    if (view !== "attention") return;
    void api.recommend().then((r) => setRecs(r.recommendations));
  }, [view, needsYouCount, dismissTick]);

  const visibleRecs = recs.filter(
    (r) => sessionStorage.getItem(dismissedKey(r.item_id)) !== "1",
  );

  const createItem = useCallback(
    async (openDetail: boolean) => {
      const title = capture.trim();
      if (!title || offline) return;
      const tempId = `itm_temp${Date.now().toString(36)}`;
      const optimistic: WorkItem = {
        id: tempId,
        title,
        goal: null,
        status: "inbox",
        assignee_type: "unassigned",
        assignee_id: null,
        due_at: null,
        reminder_at: null,
        reminder_intent: null,
        priority: "none",
        blocked_reason: null,
        needs_you_reason: null,
        source: "ui",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        completed_by_type: null,
        completed_by_id: null,
        last_actor_type: "user",
        last_actor_id: "david",
        list_id: null,
      };
      setPendingRows((p) => [optimistic, ...p]);
      setCapture("");
      try {
        const { item } = await api.createItem(title);
        setPendingRows((p) => p.filter((x) => x.id !== tempId));
        setInbox((prev) =>
          prev
            ? { ...prev, items: [item, ...prev.items.filter((i) => i.id !== item.id)] }
            : prev,
        );
        flash(item.id);
        if (openDetail) setSelectedId(item.id);
        captureRef.current?.focus();
      } catch {
        setPendingRows((p) =>
          p.map((x) =>
            x.id === tempId
              ? { ...x, title: `${title} — ${copy.capture.error}` }
              : x,
          ),
        );
      }
    },
    [capture, offline, setInbox],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable);
      if (e.key === "Escape") {
        if (showShortcuts) {
          setShowShortcuts(false);
          return;
        }
        if (document.activeElement === captureRef.current) {
          setCapture("");
          captureRef.current?.blur();
          return;
        }
        if (selectedId) {
          setSelectedId(null);
          return;
        }
      }
      if (typing) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        captureRef.current?.focus();
        return;
      }
      if (e.key === "?" ) {
        setShowShortcuts(true);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("view-filter")?.focus();
        return;
      }
      if (e.key === "g" || e.key === "G") {
        setGPending(true);
        window.setTimeout(() => setGPending(false), 800);
        return;
      }
      if (gPending) {
        const map: Record<string, AppView> = {
          a: "attention",
          g: "agent_wip",
          p: "upcoming",
          h: "done",
          t: "all",
          o: "notes",
        };
        const v = map[e.key.toLowerCase()];
        if (v) {
          selectView(v);
          setGPending(false);
        }
        return;
      }
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection(1);
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        moveSelection(-1);
      }
      if (e.key === "Enter" && selectedId) {
        // already open
      }
      if ((e.key === "x" || e.key === "X" || e.key === " ") && selectedId) {
        e.preventDefault();
        void completeSelected();
      }
      if ((e.key === "d" || e.key === "D") && selectedId) {
        // DetailPanel handles D via focus; trigger assign popover indirectly
      }
      if (e.key === "m" || e.key === "M") {
        if (selectedId) void api.assignMe(selectedId).then((r) => {
          setSelectedItem(r.item);
          flash(r.item.id);
        });
      }
      if (e.shiftKey && (e.key === "R" || e.key === "r") && selectedId) {
        void api.reopen(selectedId).then((r) => {
          setSelectedItem(r.item);
          flash(r.item.id);
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function moveSelection(delta: number) {
    if (flatItems.length === 0) return;
    const idx = flatItems.findIndex((i) => i.id === selectedId);
    const next = flatItems[Math.max(0, Math.min(flatItems.length - 1, (idx < 0 ? 0 : idx) + delta))];
    if (next) setSelectedId(next.id);
  }

  async function completeSelected() {
    if (!selectedId || offline) return;
    const { item } = await api.complete(selectedId);
    setSelectedItem(item);
    flash(item.id);
    setToast({
      text: copy.toastCompleted,
      undo: () => {
        void api.reopen(item.id).then((r) => {
          setSelectedItem(r.item);
          flash(r.item.id);
        });
      },
    });
    window.setTimeout(() => setToast(null), 5000);
    void reload();
  }

  const title =
    view === "notes"
      ? copy.nav.notes
      : VIEWS.find((v) => v.id === view)?.label ?? "Relay";

  return (
    <div className="app-shell">
      <nav className="rail" aria-label="Vistas">
        <div className="brand">Relay</div>
        <ul>
          {VIEWS.filter((v) => v.id !== "notes").map((v) => (
            <li key={v.id}>
              <button
                type="button"
                className={view === v.id ? "active" : ""}
                aria-current={view === v.id ? "page" : undefined}
                onClick={() => selectView(v.id)}
              >
                <span className="rail-label">{v.label}</span>
                {v.id === "attention" && needsYouCount > 0 ? (
                  <span
                    className="rail-count mono"
                    data-rail-counter="attention"
                    aria-label={`${needsYouCount} ítems te necesitan`}
                  >
                    {needsYouCount}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        <div className="rail-sep" />
        <button
          type="button"
          className={view === "notes" ? "active" : ""}
          onClick={() => selectView("notes")}
        >
          <span className="rail-label">{copy.nav.notes}</span>
        </button>
        <div className="rail-foot">
          <div className="mono sync-seal">
            {offline
              ? copy.sync.offline
              : copy.sync.ok(syncAge.current)}
          </div>
          <button type="button" className="linkish" onClick={() => setShowShortcuts(true)}>
            ? {copy.nav.shortcuts}
          </button>
          <ThemeSwitch theme={theme} onChange={setTheme} />
        </div>
      </nav>

      <main className="list-zone">
        <header className="list-head">
          <h2>{title}</h2>
          <input
            id="view-filter"
            className="view-filter"
            placeholder="Filtrar por título"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </header>

        {offline ? (
          <div className="banner offline" role="status">
            {copy.offline.banner}{" "}
            <button type="button" className="linkish" onClick={() => void reload()}>
              {copy.cta.retry}
            </button>{" "}
            <button
              type="button"
              className="linkish"
              onClick={() => setShowHowto((v) => !v)}
            >
              {copy.offline.howto}
            </button>
            {showHowto ? (
              <pre className="howto mono">{`relay api   →  http://127.0.0.1:7420
relay mcp   →  http://127.0.0.1:7420/mcp  ·  pnpm --filter @relay/server mcp:stdio
relay web   →  http://127.0.0.1:7421`}</pre>
            ) : null}
          </div>
        ) : null}

        {error && !offline ? (
          <div className="banner error" role="alert">
            No pudimos cargar esta vista.{" "}
            <button type="button" className="linkish" onClick={() => void reload()}>
              {copy.cta.retry}
            </button>
          </div>
        ) : null}

        {view !== "notes" ? (
          <div className="capture-wrap">
            <label className="sr-only" htmlFor="quick-capture">
              Nuevo ítem
            </label>
            <input
              id="quick-capture"
              ref={captureRef}
              className="quick-capture"
              placeholder={copy.capture.placeholder}
              value={capture}
              maxLength={200}
              disabled={offline}
              title={offline ? copy.offline.disabled : undefined}
              onChange={(e) => setCapture(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void createItem(false);
                }
                if (e.key === "Enter" && e.shiftKey) {
                  e.preventDefault();
                  void createItem(true);
                }
                if (e.key === "Escape") {
                  setCapture("");
                  captureRef.current?.blur();
                }
              }}
            />
            {capture.length >= 180 ? (
              <span className="mono cap-count">
                {capture.length}/200
              </span>
            ) : (
              <span className="mono cap-hint">N</span>
            )}
          </div>
        ) : null}

        {view === "attention" && visibleRecs.length > 0 ? (
          <section className="suggested" aria-label="Sugerido">
            <button
              type="button"
              className="suggested-head label-caps"
              onClick={() => {
                const next = !suggestedCollapsed;
                setSuggestedCollapsed(next);
                localStorage.setItem(
                  "relay.suggested.collapsed",
                  next ? "1" : "0",
                );
              }}
            >
              Sugerido · {visibleRecs.length}
            </button>
            {!suggestedCollapsed
              ? visibleRecs.map((r) => {
                  const item =
                    inbox?.items.find((i) => i.id === r.item_id) ??
                    flatItems.find((i) => i.id === r.item_id);
                  const mark = item
                    ? markForOwner(item, agents)
                    : { kind: "user" as const, name: "David", monogram: "D" };
                  return (
                    <div key={r.item_id} className="suggested-row" role="listitem">
                      <ActorMark
                        kind={mark.kind}
                        name={mark.name}
                        monogram={mark.monogram}
                        size={20}
                      />
                      <div className="sug-text">
                        <div className="sug-title">
                          {item?.title ?? r.item_id}
                        </div>
                        <div className="sug-reason">{r.reason}</div>
                      </div>
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => setSelectedId(r.item_id)}
                      >
                        {copy.cta.open}
                      </button>
                      <button
                        type="button"
                        className="icon-x"
                        aria-label={copy.cta.notNow}
                        onClick={() => {
                          sessionStorage.setItem(dismissedKey(r.item_id), "1");
                          setDismissTick((n) => n + 1);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })
              : null}
          </section>
        ) : null}

        {view === "notes" ? (
          <div className="notes-list">
            {notes.length === 0 ? (
              <Empty text={copy.empty.notes} />
            ) : (
              notes.map((n) => (
                <article key={n.id} className="note-card list-note">
                  <strong>{n.title}</strong>
                  <p>{n.body_md.slice(0, 120)}</p>
                </article>
              ))
            )}
          </div>
        ) : (
          <div
            ref={listRef}
            className="item-list"
            role="listbox"
            tabIndex={0}
            data-inbox-view={inbox?.view ?? ""}
            aria-activedescendant={selectedId ? `row-${selectedId}` : undefined}
          >
            {!inbox && !error ? <Skeleton /> : null}
            {inbox ? (
              <VirtualItemList
                scrollRef={listRef}
                sections={viewSections}
                agents={agents}
                selectedId={selectedId}
                flashIds={flashIds}
                showChatBadge={view === "all"}
                showCompletedBy={view === "done"}
                onSelect={setSelectedId}
              />
            ) : null}
            {inbox && flatItems.length === 0 ? (
              view === "attention" ? (
                <Empty
                  text={copy.empty.attention}
                  action={{
                    label: copy.empty.attentionCta,
                    onClick: () => selectView("agent_wip"),
                  }}
                />
              ) : (
                <Empty
                  text={
                    view === "agent_wip"
                      ? copy.empty.agent_wip
                      : view === "upcoming"
                        ? copy.empty.upcoming
                        : view === "done"
                          ? copy.empty.done
                          : copy.empty.all
                  }
                />
              )
            ) : null}
            {pendingRows
              .filter((p) => !flatItems.some((i) => i.id === p.id))
              .map((item) => (
                <div key={item.id}>
                  <ItemRow
                    item={item}
                    agents={agents}
                    selected={selectedId === item.id}
                    flash={flashIds.has(item.id)}
                    onSelect={() => setSelectedId(item.id)}
                  />
                  {view !== "all" ? (
                    <div className="elsewhere mono">
                      {copy.capture.created_elsewhere}
                    </div>
                  ) : null}
                </div>
              ))}
          </div>
        )}

        {toast ? (
          <div className="toast" role="status">
            {toast.text}{" "}
            {toast.undo ? (
              <button
                type="button"
                onClick={() => {
                  toast.undo?.();
                  setToast(null);
                }}
              >
                Deshacer (Z)
              </button>
            ) : null}
          </div>
        ) : null}
      </main>

      {selectedId && window.innerWidth < 1024 ? (
        <div className="detail-scrim" onClick={() => setSelectedId(null)} />
      ) : null}

      <DetailPanel
        item={selectedItem}
        agents={agents}
        offline={offline}
        onClose={() => setSelectedId(null)}
        onChange={(item) => {
          setSelectedItem(item);
          void reload();
        }}
        onFlash={flash}
      />

      {showShortcuts ? (
        <div className="modal-scrim" onClick={() => setShowShortcuts(false)}>
          <div
            className="shortcuts"
            role="dialog"
            aria-label="Atajos"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Atajos</h3>
            <ul className="mono">
              <li>N — captura</li>
              <li>J / K — fila siguiente / anterior</li>
              <li>Enter — abrir detalle</li>
              <li>X / Espacio — completar</li>
              <li>D — delegar · M — me lo quedo · L — vincular nota</li>
              <li>S — estado · Shift+R — reabrir</li>
              <li>G luego A/G/P/H/T/O — cambiar vista</li>
            </ul>
            <button type="button" className="btn-secondary" onClick={() => setShowShortcuts(false)}>
              Cerrar
            </button>
          </div>
        </div>
      ) : null}

      <div className="sr-only" aria-live="polite">
        {needsYouCount > 0
          ? `Hay ${needsYouCount} ítems que te necesitan`
          : ""}
      </div>
    </div>
  );
}

function Empty({
  text,
  action,
}: {
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="empty">
      <p>{text}</p>
      {action ? (
        <button type="button" className="linkish" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" className="skeleton">
      <span className="sr-only">Cargando</span>
      {["a", "b", "c", "d", "e", "f"].map((id, i) => (
        <div key={id} className="skel-row" style={{ width: `${50 + (i % 3) * 12}%` }} />
      ))}
    </div>
  );
}
