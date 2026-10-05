import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "./lib/api";
import { copy } from "./lib/copy";
import type {
  Agent,
  AppView,
  InboxResult,
  InboxView,
  Note,
  Recommendation,
  WorkItem,
} from "./lib/types";
import { usePoll } from "./hooks/usePoll";
import { useTheme } from "./hooks/useTheme";
import { DetailPanel } from "./components/DetailPanel";
import { ItemRow } from "./components/ItemRow";
import { ActorMark } from "./components/ActorMark";
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
  const prevUpdated = useRef<Map<string, string>>(new Map());
  const syncAge = useRef(0);
  const [, setTick] = useState(0);

  useEffect(() => {
    void api.agents().then((r) => setAgents(r.agents));
  }, []);

  const inboxView: InboxView = view === "notes" ? "attention" : view;

  const {
    data: inbox,
    error,
    offline,
    lastOkAt,
    setData: setInbox,
    reload,
  } = usePoll<InboxResult>(
    () => api.inbox(inboxView),
    [inboxView],
  );

  useEffect(() => {
    if (view !== "attention") return;
    void api.recommend().then((r) => setRecs(r.recommendations));
  }, [view, inbox?.counters.needs_you, dismissTick]);

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
            // keep editing fields; still update if id matches via parent flash
            if (prev.updated_at !== r.item.updated_at) {
              flash(r.item.id);
            }
            return prev.title === r.item.title ? { ...r.item, title: prev.title } : r.item;
          }
          if (prev && prev.updated_at !== r.item.updated_at) flash(r.item.id);
          return r.item;
        });
      });
    }, 2000);
    return () => window.clearInterval(id);
  }, [selectedId]);

  useEffect(() => {
    if (!inbox) return;
    const nextMap = new Map<string, string>();
    for (const item of inbox.items) {
      const prev = prevUpdated.current.get(item.id);
      if (prev && prev !== item.updated_at) flash(item.id);
      nextMap.set(item.id, item.updated_at);
    }
    prevUpdated.current = nextMap;
  }, [inbox]);

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

  const flatItems = useMemo(() => {
    if (!inbox) return pendingRows;
    const ids = new Set(inbox.items.map((i) => i.id));
    const extras = pendingRows.filter((p) => !ids.has(p.id));
    return [...extras, ...inbox.items].filter((i) =>
      filter.trim()
        ? i.title.toLowerCase().includes(filter.toLowerCase())
        : true,
    );
  }, [inbox, pendingRows, filter]);

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
          setView(v);
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
                onClick={() => setView(v.id)}
              >
                <span className="rail-label">{v.label}</span>
                {v.id === "attention" && (inbox?.counters.needs_you ?? 0) > 0 ? (
                  <span
                    className="rail-count mono"
                    aria-label={`${inbox?.counters.needs_you} ítems te necesitan`}
                  >
                    {inbox?.counters.needs_you}
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
          onClick={() => setView("notes")}
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
          <select
            aria-label="Tema"
            value={theme}
            onChange={(e) => setTheme(e.target.value as "light" | "dark" | "system")}
          >
            <option value="system">Sistema</option>
            <option value="light">Claro</option>
            <option value="dark">Oscuro</option>
          </select>
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
                  const agent =
                    item?.assignee_type === "agent"
                      ? agents.find((a) => a.id === item.assignee_id)
                      : null;
                  return (
                    <div key={r.item_id} className="suggested-row" role="listitem">
                      <ActorMark
                        kind={
                          item?.status === "needs_you"
                            ? "user"
                            : agent
                              ? "agent"
                              : "user"
                        }
                        name={agent?.display_name ?? "David"}
                        monogram={agent?.monogram ?? "D"}
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
            className="item-list"
            role="listbox"
            tabIndex={0}
            aria-activedescendant={selectedId ? `row-${selectedId}` : undefined}
          >
            {!inbox && !error ? <Skeleton /> : null}
            {inbox && view === "attention" && inbox.sections
              ? inbox.sections.map((section) => (
                  <Section
                    key={section.key}
                    label={
                      section.key === "needs_you"
                        ? copy.section.needs_you
                        : section.key === "blocked"
                          ? copy.section.blocked
                          : copy.section.today
                    }
                    count={section.items.length}
                  >
                    {section.items
                      .filter((i) =>
                        filter.trim()
                          ? i.title.toLowerCase().includes(filter.toLowerCase())
                          : true,
                      )
                      .map((item) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          agents={agents}
                          selected={selectedId === item.id}
                          flash={flashIds.has(item.id)}
                          showChatBadge={false}
                          onSelect={() => setSelectedId(item.id)}
                        />
                      ))}
                  </Section>
                ))
              : null}
            {inbox && view !== "attention"
              ? (inbox.groups ?? [{ key: "all", label: "", items: flatItems }]).map(
                  (group) => (
                    <Section
                      key={group.key || "all"}
                      label={group.label}
                      count={group.items.length}
                    >
                      {(group.items.length ? group.items : flatItems)
                        .filter((i) =>
                          filter.trim()
                            ? i.title
                                .toLowerCase()
                                .includes(filter.toLowerCase())
                            : true,
                        )
                        .map((item) => (
                          <ItemRow
                            key={item.id}
                            item={item}
                            agents={agents}
                            selected={selectedId === item.id}
                            flash={flashIds.has(item.id)}
                            showChatBadge={view === "all"}
                            showCompletedBy={view === "done"}
                            onSelect={() => setSelectedId(item.id)}
                          />
                        ))}
                    </Section>
                  ),
                )
              : null}
            {inbox &&
            flatItems.length === 0 &&
            pendingRows.length === 0 ? (
              view === "attention" ? (
                <Empty
                  text={copy.empty.attention}
                  action={{
                    label: copy.empty.attentionCta,
                    onClick: () => setView("agent_wip"),
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
              .filter((p) => !inbox?.items.some((i) => i.id === p.id))
              .map((item) => (
                <div key={item.id}>
                  <ItemRow
                    item={item}
                    agents={agents}
                    selected={selectedId === item.id}
                    flash={flashIds.has(item.id)}
                    onSelect={() => setSelectedId(item.id)}
                  />
                  {view !== "all" && view !== "attention" ? (
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
        {(inbox?.counters.needs_you ?? 0) > 0
          ? `Hay ${inbox?.counters.needs_you} ítems que te necesitan`
          : ""}
      </div>
    </div>
  );
}

function Section({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  if (!label && count === 0) return <>{children}</>;
  return (
    <div role="group" aria-label={label || undefined}>
      {label ? (
        <div className="section-label label-caps">
          {label}
          <span className="mono"> · {count}</span>
        </div>
      ) : null}
      {children}
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
