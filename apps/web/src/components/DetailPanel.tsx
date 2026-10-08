import { Bell, CalendarBlank, LinkSimple, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import {
  markForActor,
  markForCompleter,
  markForOwner,
} from "../lib/actor_mark";
import { api } from "../lib/api";
import { copy } from "../lib/copy";
import { formatAbsolute, formatRelative } from "../lib/format";
import { toPlainText } from "../lib/markdown";
import type {
  Agent,
  ContextPack,
  LinkedNote,
  NoteRole,
  Status,
  WorkItem,
} from "../lib/types";
import { ActorMark, isStaleWorking, isWorking } from "./ActorMark";
import { DateTimePicker } from "./DateTimePicker";
import { StatusGlyph } from "./StatusGlyph";
import "./DetailPanel.css";

type Props = {
  item: WorkItem | null;
  agents: Agent[];
  offline: boolean;
  onClose: () => void;
  onChange: (item: WorkItem) => void;
  onFlash: (id: string) => void;
  /** Open due / reminder picker (T / Shift+T). */
  openPicker?: "due" | "reminder" | null;
  onOpenPickerHandled?: (() => void) | undefined;
  onOpenNote?: (noteId: string) => void;
};

const STATUSES: Status[] = [
  "inbox",
  "assigned",
  "in_progress",
  "blocked",
  "needs_you",
  "done",
  "cancelled",
];

export function DetailPanel({
  item,
  agents,
  offline,
  onClose,
  onChange,
  onFlash,
  openPicker = null,
  onOpenPickerHandled,
  onOpenNote,
}: Props) {
  const [notes, setNotes] = useState<LinkedNote[]>([]);
  const [allNotes, setAllNotes] = useState<{ id: string; title: string }[]>([]);
  const [showLinker, setShowLinker] = useState(false);
  const [linkerQ, setLinkerQ] = useState("");
  const [linkRole, setLinkRole] = useState<NoteRole>("context");
  const [showAgentView, setShowAgentView] = useState(false);
  const [context, setContext] = useState<{
    pack: ContextPack;
    markdown: string;
  } | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [reasonMode, setReasonMode] = useState<"blocked" | "needs_you" | null>(
    null,
  );
  const [reasonText, setReasonText] = useState("");
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!item) return;
    setShowAgentView(false);
    setReply("");
    void api.itemNotes(item.id).then((r) => setNotes(r.notes));
  }, [item?.id, item?.updated_at]);

  const agent = useMemo(() => {
    if (!item?.assignee_id) return null;
    return agents.find((a) => a.id === item.assignee_id) ?? null;
  }, [agents, item]);

  if (!item) {
    return (
      <aside className="detail-zone" aria-label="Detalle del ítem">
        <div className="detail-empty">{copy.detailEmpty}</div>
        <ul className="detail-empty-keys mono" aria-label="Atajos rápidos">
          <li>
            <kbd>N</kbd> captura
          </li>
          <li>
            <kbd>J</kbd>/<kbd>K</kbd> navega
          </li>
          <li>
            <kbd>Enter</kbd> abre
          </li>
          <li>
            <kbd>X</kbd> completa
          </li>
          <li>
            <kbd>D</kbd> delega
          </li>
          <li>
            <kbd>?</kbd> atajos
          </li>
        </ul>
      </aside>
    );
  }

  async function patch(patch: Record<string, unknown>) {
    if (offline) return;
    const { item: next } = await api.updateItem(item!.id, patch);
    onChange(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1000);
  }

  async function chooseStatus(status: Status) {
    if (status === "blocked" || status === "needs_you") {
      setReasonMode(status);
      setReasonText(
        status === "blocked"
          ? (item!.blocked_reason ?? "")
          : (item!.needs_you_reason ?? ""),
      );
      return;
    }
    if (status === "done") {
      const { item: next } = await api.complete(item!.id);
      onChange(next);
      onFlash(next.id);
      setStatusOpen(false);
      return;
    }
    const { item: next } = await api.setStatus(item!.id, status);
    onChange(next);
    onFlash(next.id);
    setStatusOpen(false);
  }

  async function confirmReason() {
    if (!reasonMode || reasonText.trim().length < 3) return;
    const reasons: { blocked_reason?: string; needs_you_reason?: string } = {};
    if (reasonMode === "blocked") reasons.blocked_reason = reasonText.trim();
    if (reasonMode === "needs_you") reasons.needs_you_reason = reasonText.trim();
    const { item: next } = await api.setStatus(item!.id, reasonMode, reasons);
    onChange(next);
    onFlash(next.id);
    setReasonMode(null);
    setStatusOpen(false);
  }

  async function saveDecisionNote(text: string) {
    if (!text.trim()) return;
    const title = `Decisión: ${(item!.needs_you_reason ?? "respuesta").slice(0, 60)}`;
    const { note } = await api.createNote(title, text.trim());
    await api.linkNote(item!.id, note.id, "decision");
    const linked = await api.itemNotes(item!.id);
    setNotes(linked.notes);
  }

  async function returnToAgent() {
    await saveDecisionNote(reply);
    const { item: next } = await api.setStatus(item!.id, "assigned");
    onChange(next);
    onFlash(next.id);
  }

  async function doMyself() {
    await saveDecisionNote(reply);
    await api.assignMe(item!.id);
    const { item: next } = await api.setStatus(item!.id, "in_progress");
    onChange(next);
    onFlash(next.id);
  }

  async function openAgentView() {
    const r = await api.context(item!.id);
    setContext({ pack: r.context, markdown: r.markdown });
    setShowAgentView(true);
  }

  async function openLinker() {
    const r = await api.notes();
    setAllNotes(r.notes.map((n) => ({ id: n.id, title: n.title })));
    setShowLinker(true);
  }

  async function linkSelected(noteId: string) {
    await api.linkNote(item!.id, noteId, linkRole);
    const linked = await api.itemNotes(item!.id);
    setNotes(linked.notes);
    setShowLinker(false);
    setLinkerQ("");
  }

  async function createAndLink() {
    if (!linkerQ.trim()) return;
    const { note } = await api.createNote(linkerQ.trim());
    await api.linkNote(item!.id, note.id, linkRole);
    const linked = await api.itemNotes(item!.id);
    setNotes(linked.notes);
    setShowLinker(false);
    setLinkerQ("");
  }

  const lastActorName =
    item.last_actor_type === "user"
      ? "Tú"
      : agents.find((a) => a.id === item.last_actor_id)?.display_name ??
        item.last_actor_id;

  const grouped = {
    decision: notes.filter((n) => n.role === "decision"),
    context: notes.filter((n) => n.role === "context"),
    reference: notes.filter((n) => n.role === "reference"),
  };

  if (showAgentView && context) {
    return (
      <aside className="detail-zone" aria-label="Detalle del ítem">
        <header className="detail-head">
          <button type="button" onClick={() => setShowAgentView(false)}>
            ← Volver
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(context.markdown);
            }}
          >
            {copy.context.copyMd}
          </button>
        </header>
        <div className="agent-view">
          <h1>{context.pack.title}</h1>
          <section>
            <div className="label-caps">Objetivo</div>
            <p>
              {context.pack.goal?.trim()
                ? context.pack.goal
                : copy.context.noGoal}
            </p>
          </section>
          <section>
            <div className="label-caps">Estado</div>
            <p>
              {copy.statusLabel[context.pack.status as Status] ??
                context.pack.status}{" "}
              <span className="mono">({context.pack.status})</span>
              {context.pack.needs_you_reason
                ? ` — ${context.pack.needs_you_reason}`
                : ""}
              {context.pack.blocked_reason
                ? ` — ${context.pack.blocked_reason}`
                : ""}
            </p>
          </section>
          <section>
            <div className="label-caps">Dueño</div>
            <p>{context.pack.assignee_display_name ?? "Sin dueño"}</p>
          </section>
          <section>
            <div className="label-caps">Para cuándo</div>
            <p className="mono">
              {context.pack.due_at
                ? formatAbsolute(context.pack.due_at)
                : "—"}
            </p>
          </section>
          <section>
            <div className="label-caps">Recordatorio</div>
            <p>
              {context.pack.reminder_at ? (
                <>
                  <span className="mono">
                    {formatAbsolute(context.pack.reminder_at)}
                  </span>
                  {context.pack.reminder_intent
                    ? ` · ${context.pack.reminder_intent}`
                    : ""}
                </>
              ) : (
                "—"
              )}
            </p>
          </section>
          <section>
            <div className="label-caps">Notas</div>
            {context.pack.notes.map((n) => (
              <article key={n.id} className="note-card">
                <strong>
                  [{n.role}] {n.title}
                </strong>
                <pre>{n.body_preview}</pre>
              </article>
            ))}
          </section>
        </div>
      </aside>
    );
  }

  return (
    <aside className="detail-zone" aria-label="Detalle del ítem">
      <header className="detail-head">
        <div className="status-wrap">
          <button
            type="button"
            className="status-btn"
            aria-haspopup="menu"
            aria-expanded={statusOpen}
            onClick={() => setStatusOpen((v) => !v)}
            disabled={offline}
          >
            <StatusGlyph
              status={item.status}
              label={copy.statusLabel[item.status]}
            />
            {copy.statusLabel[item.status]}
          </button>
          {statusOpen ? (
            <div className="popover" role="menu">
              {reasonMode ? (
                <div className="reason-form">
                  <div className="label-caps">
                    {reasonMode === "blocked"
                      ? copy.reason.blockedTitle
                      : copy.reason.needsYouTitle}
                  </div>
                  <textarea
                    autoFocus
                    rows={3}
                    value={reasonText}
                    placeholder={
                      reasonMode === "blocked"
                        ? copy.reason.blockedPlaceholder
                        : copy.reason.needsYouPlaceholder
                    }
                    onChange={(e) => setReasonText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        void confirmReason();
                      }
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setReasonMode(null);
                      }
                    }}
                  />
                  {reasonText.trim().length < 3 ? (
                    <div className="field-error">{copy.reason.required}</div>
                  ) : null}
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={reasonText.trim().length < 3}
                    onClick={() => void confirmReason()}
                  >
                    {reasonMode === "blocked"
                      ? copy.reason.confirmBlocked
                      : copy.reason.confirmNeedsYou}
                  </button>
                </div>
              ) : (
                STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="menuitem"
                    onClick={() => void chooseStatus(s)}
                  >
                    <StatusGlyph status={s} label={copy.statusLabel[s]} />
                    {copy.statusLabel[s]}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Cerrar"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>

      <h1
        className="detail-title"
        contentEditable={!offline}
        suppressContentEditableWarning
        onBlur={(e) => {
          const t = e.currentTarget.textContent?.trim() ?? "";
          if (t && t !== item.title) void patch({ title: t });
        }}
      >
        {item.title}
      </h1>
      {saved ? <div className="saved mono">{copy.cta.open && "Guardado"}</div> : null}

      {(item.status === "needs_you" || item.status === "blocked") && (
        <div
          className={`reason-banner ${item.status}`}
          role="region"
          aria-label={copy.statusLabel[item.status]}
        >
          <div className="rb-title">
            {item.status === "needs_you"
              ? `${agents.find((a) => a.id === item.last_actor_id)?.display_name ?? "Agente"} necesita tu decisión · ${formatRelative(item.updated_at)}`
              : `Atascado · ${formatRelative(item.updated_at)}`}
          </div>
          <div className="rb-body">
            {item.status === "needs_you"
              ? item.needs_you_reason
              : item.blocked_reason}
          </div>
          {item.status === "needs_you" ? (
            <>
              <label className="reply-label">
                {copy.reason.reply}
                <textarea
                  autoFocus
                  rows={2}
                  value={reply}
                  placeholder={copy.reason.replyPlaceholder}
                  onChange={(e) => setReply(e.target.value)}
                />
              </label>
              <div className="rb-actions">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={offline || !agent}
                  onClick={() => void returnToAgent()}
                >
                  {copy.cta.returnTo(agent?.display_name ?? "agente")}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={offline}
                  onClick={() => void doMyself()}
                >
                  {copy.cta.doMyself}
                </button>
              </div>
            </>
          ) : (
            <div className="rb-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={offline}
                onClick={() => void chooseStatus("in_progress")}
              >
                {copy.cta.unblock}
              </button>
            </div>
          )}
        </div>
      )}

      {(item.status === "done" || item.status === "cancelled") && (
        <div className="reason-banner terminal" role="region">
          <div className="rb-title completed-by">
            {(() => {
              const completer = markForCompleter(item, agents);
              if (!completer) return null;
              return (
                <>
                  <ActorMark
                    kind={completer.kind}
                    name={completer.name}
                    monogram={completer.monogram}
                    size={20}
                  />
                  <span>
                    {completer.kind === "user"
                      ? `Completado por ti · ${item.completed_at ? formatAbsolute(item.completed_at) : ""}`
                      : `Completado por ${completer.name} · ${item.completed_at ? formatAbsolute(item.completed_at) : ""}`}
                  </span>
                </>
              );
            })()}
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={async () => {
              const { item: next } = await api.reopen(item.id);
              onChange(next);
            }}
          >
            {copy.cta.reopen}
          </button>
        </div>
      )}

      <section className="detail-section">
        <div className="label-caps">Traspaso</div>
        <div className="kv">
          <span>Dueño</span>
          <span className="kv-val">
            {item.assignee_type === "unassigned" ? (
              <>Sin dueño</>
            ) : (
              <>
                {(() => {
                  const owner = markForOwner(item, agents);
                  return (
                    <ActorMark
                      kind={owner.kind}
                      name={owner.name}
                      monogram={owner.monogram}
                      size={24}
                      working={isWorking(
                        item.status,
                        item.assignee_type,
                        item.updated_at,
                      )}
                      stale={isStaleWorking(
                        item.status,
                        item.assignee_type,
                        item.updated_at,
                      )}
                    />
                  );
                })()}{" "}
                {item.assignee_type === "user" ? "Tú" : agent?.display_name}
              </>
            )}
            <button
              type="button"
              className="linkish"
              disabled={offline}
              onClick={() => setDelegateOpen((v) => !v)}
            >
              Cambiar
            </button>
          </span>
        </div>
        {delegateOpen ? (
          <div className="popover delegate-pop">
            {(item.goal == null || item.goal.trim() === "") &&
            notes.length === 0 ? (
              <div className="blind-warn">
                {copy.delegate.blind}
                <div className="rb-actions">
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => {
                      setDelegateOpen(false);
                      document.getElementById("goal-field")?.focus();
                    }}
                  >
                    {copy.delegate.addGoal}
                  </button>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => {
                      setDelegateOpen(false);
                      void openLinker();
                    }}
                  >
                    {copy.delegate.linkNote}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="mono subtle">
              Objetivo: {item.goal?.trim() ? item.goal.slice(0, 40) : "Falta"} ·
              Notas: {notes.length}
            </div>
            {agents.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={async () => {
                  const { item: next } = await api.delegate(item.id, a.id);
                  onChange(next);
                  setDelegateOpen(false);
                  onFlash(next.id);
                }}
              >
                <ActorMark
                  kind="agent"
                  name={a.display_name}
                  monogram={a.monogram}
                  size={20}
                />
                {a.display_name}
              </button>
            ))}
          </div>
        ) : null}
        <div className="kv">
          <span>Último cambio</span>
          <span className="kv-val">
            {(() => {
              const last = markForActor(
                item.last_actor_type,
                item.last_actor_id,
                agents,
              );
              return (
                <>
                  <ActorMark
                    kind={last.kind}
                    name={last.name}
                    monogram={last.monogram}
                    size={20}
                  />{" "}
                  {lastActorName} · {formatRelative(item.updated_at)}
                </>
              );
            })()}
          </span>
        </div>
        <div className="rb-actions" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={offline}
            onClick={() => setDelegateOpen(true)}
          >
            {copy.cta.delegate}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={offline}
            onClick={async () => {
              const { item: next } = await api.assignMe(item.id);
              onChange(next);
            }}
          >
            {copy.cta.assignMe}
          </button>
        </div>
      </section>

      <section className="detail-section">
        <div className="label-caps">{copy.field.goal}</div>
        <textarea
          id="goal-field"
          className="goal-field"
          rows={3}
          disabled={offline}
          defaultValue={item.goal ?? ""}
          key={`${item.id}-goal-${item.updated_at}`}
          placeholder={copy.field.goalPlaceholder}
          onBlur={(e) => {
            const v = e.target.value;
            if (v !== (item.goal ?? "")) void patch({ goal: v || null });
          }}
        />
        {!item.goal?.trim() && item.assignee_type === "agent" ? (
          <div className="hint-warn">{copy.field.goalMissing}</div>
        ) : null}
      </section>

      <section className="detail-section">
        <div className="label-caps">Recordatorio</div>
        <div className="reminder-grid">
          <DateTimePicker
            label={copy.field.due}
            icon={<CalendarBlank size={14} />}
            kind="due"
            value={item.due_at}
            allowDateOnly
            disabled={offline}
            readOnly={item.status === "done" || item.status === "cancelled"}
            requestOpen={openPicker === "due"}
            onRequestOpenHandled={onOpenPickerHandled}
            onCommit={async (iso) => {
              if (iso !== item.due_at) await patch({ due_at: iso });
            }}
          />
          <DateTimePicker
            label={copy.field.reminder}
            icon={<Bell size={14} />}
            kind="reminder"
            value={item.reminder_at}
            relatedDueAt={item.due_at}
            disabled={offline}
            readOnly={item.status === "done" || item.status === "cancelled"}
            requestOpen={openPicker === "reminder"}
            onRequestOpenHandled={onOpenPickerHandled}
            onCommit={async (iso) => {
              if (iso !== item.reminder_at) await patch({ reminder_at: iso });
            }}
          />
          <label className="span2">
            {copy.field.intent}
            <input
              type="text"
              maxLength={80}
              disabled={offline}
              defaultValue={item.reminder_intent ?? ""}
              key={`${item.id}-intent`}
              placeholder={copy.field.intentPlaceholder}
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== (item.reminder_intent ?? "")) {
                  void patch({ reminder_intent: v || null });
                }
              }}
            />
          </label>
        </div>
        {item.reminder_at && !item.reminder_intent?.trim() ? (
          <div className="hint-soft">{copy.field.intentMissing}</div>
        ) : null}
      </section>

      <section className="detail-section">
        <div className="section-head">
          <div className="label-caps">{copy.context.title}</div>
          <button
            type="button"
            className="linkish"
            disabled={offline}
            onClick={() => void openLinker()}
          >
            <LinkSimple size={14} /> {copy.cta.linkNote}
          </button>
        </div>
        {notes.length === 0 ? (
          <p className="empty-inline">{copy.context.empty}</p>
        ) : (
          (["decision", "context", "reference"] as const).map((role) =>
            grouped[role].length ? (
              <div key={role} className="note-group">
                <div className="label-caps">
                  {role === "decision"
                    ? "Decisión"
                    : role === "context"
                      ? "Contexto"
                      : "Referencia"}
                </div>
                {grouped[role].map((n) => (
                  <article
                    key={n.id}
                    className="note-card note-card-openable"
                    role={onOpenNote ? "button" : undefined}
                    tabIndex={onOpenNote ? 0 : undefined}
                    onClick={() => onOpenNote?.(n.id)}
                    onKeyDown={(e) => {
                      if (!onOpenNote) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenNote(n.id);
                      }
                    }}
                  >
                    <div className="note-card-head">
                      <strong>{n.title}</strong>
                      <button
                        type="button"
                        className="linkish"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await api.unlinkNote(item.id, n.id);
                          setNotes((prev) => prev.filter((x) => x.id !== n.id));
                        }}
                      >
                        Quitar
                      </button>
                    </div>
                    <p className="note-extract">{toPlainText(n.body_md)}</p>
                    <div className="mono subtle">
                      {formatRelative(n.updated_at)}
                    </div>
                  </article>
                ))}
              </div>
            ) : null,
          )
        )}
        <button
          type="button"
          className="linkish agent-view-link"
          onClick={() => void openAgentView()}
        >
          {copy.context.agentView} →
        </button>
        {showLinker ? (
          <div className="popover linker">
            <input
              autoFocus
              value={linkerQ}
              placeholder="Busca una nota o escribe un título nuevo"
              onChange={(e) => setLinkerQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const hit = allNotes.find((n) =>
                    n.title.toLowerCase().includes(linkerQ.toLowerCase()),
                  );
                  if (hit && linkerQ.trim()) void linkSelected(hit.id);
                  else void createAndLink();
                }
                if (e.key === "Escape") setShowLinker(false);
              }}
            />
            <div className="role-seg">
              {(["context", "reference", "decision"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={linkRole === r ? "on" : ""}
                  onClick={() => setLinkRole(r)}
                >
                  {r === "context"
                    ? "Contexto"
                    : r === "reference"
                      ? "Referencia"
                      : "Decisión"}
                </button>
              ))}
            </div>
            <ul>
              {allNotes
                .filter((n) =>
                  n.title.toLowerCase().includes(linkerQ.toLowerCase()),
                )
                .slice(0, 8)
                .map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => void linkSelected(n.id)}>
                      {n.title}
                    </button>
                  </li>
                ))}
              {linkerQ.trim() ? (
                <li>
                  <button type="button" onClick={() => void createAndLink()}>
                    Crear nota «{linkerQ.trim()}»
                  </button>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </section>

      <footer className="detail-foot mono">
        id {item.id} ·{" "}
        {item.source === "mcp"
          ? `Creado desde el chat por ${agents.find((a) => a.id === item.last_actor_id)?.display_name ?? "agente"} · ${formatAbsolute(item.created_at)}`
          : `Creado por ti en Relay · ${formatAbsolute(item.created_at)}`}
      </footer>
    </aside>
  );
}
