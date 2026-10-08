import { useCallback, useEffect, useId, useState } from "react";
import { api } from "../lib/api";
import { formatRelative } from "../lib/format";
import {
  clearNoteDraft,
  draftIsNewer,
  readNoteDraft,
  toggleTask,
} from "../lib/markdown";
import type { Note } from "../lib/types";
import { Markdown } from "./Markdown";
import { NoteEditor } from "./NoteEditor";
import "./NoteView.css";

type Props = {
  noteId: string;
  offline: boolean;
  /** When opened from an item's NoteCard. */
  returnLabel?: string;
  onBack: () => void;
  onNoteChange?: (note: Note) => void;
};

export function NoteView({
  noteId,
  offline,
  returnLabel,
  onBack,
  onNoteChange,
}: Props) {
  const titleId = useId();
  const [note, setNote] = useState<Note | null>(null);
  const [linkCount, setLinkCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState<string | null>(null);
  const [editorInitial, setEditorInitial] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { note: n, links } = await api.getNote(noteId);
      setNote(n);
      setLinkCount(links.length);
      onNoteChange?.(n);

      const draft = readNoteDraft(noteId);
      if (draft && draftIsNewer(draft, n.updated_at, n.body_md)) {
        setDraftPrompt(draft.body_md);
      } else {
        setDraftPrompt(null);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [noteId, onNoteChange]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editing) return;
      const t = e.target as HTMLElement | null;
      const typing =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable);
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onBack();
        return;
      }
      if (typing) return;
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        e.stopPropagation();
        setEditorInitial(undefined);
        setEditing(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, onBack]);

  async function onToggleTask(offset: number) {
    if (!note || offline) return;
    const nextBody = toggleTask(note.body_md, offset);
    if (nextBody === note.body_md) return;
    const optimistic = { ...note, body_md: nextBody };
    setNote(optimistic);
    try {
      const { note: saved } = await api.updateNote(
        note.id,
        { body_md: nextBody },
        { if_updated_at: note.updated_at },
      );
      setNote(saved);
      onNoteChange?.(saved);
      clearNoteDraft(note.id);
    } catch {
      setNote(note);
    }
  }

  if (loading) {
    return (
      <aside className="detail-zone note-view" aria-busy="true">
        <div className="note-skel">
          <div className="note-skel-bar" />
          <div className="note-skel-bar" />
          <div className="note-skel-bar short" />
        </div>
      </aside>
    );
  }

  if (error || !note) {
    return (
      <aside className="detail-zone note-view">
        <p className="note-error">
          No se pudo cargar la nota.{" "}
          <button type="button" className="linkish" onClick={() => void load()}>
            Reintentar
          </button>
        </p>
      </aside>
    );
  }

  if (editing) {
    return (
      <aside className="detail-zone note-view is-editing">
        <header className="note-view-head">
          <button type="button" className="linkish" onClick={onBack}>
            {returnLabel ?? "← Cerrar"}
          </button>
        </header>
        <h2 id={titleId} className="note-title">
          {note.title}
        </h2>
        <NoteEditor
          note={note}
          offline={offline}
          {...(editorInitial !== undefined
            ? { initialBody: editorInitial }
            : {})}
          onExit={(n) => {
            setNote(n);
            setEditing(false);
            setDraftPrompt(null);
            onNoteChange?.(n);
          }}
          onSaved={(n) => {
            setNote(n);
            onNoteChange?.(n);
          }}
        />
      </aside>
    );
  }

  const empty = !note.body_md.trim();

  return (
    <aside className="detail-zone note-view">
      <header className="note-view-head">
        <button type="button" className="linkish" onClick={onBack}>
          {returnLabel ?? "← Cerrar"}
        </button>
        <div className="note-view-actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={offline}
            onClick={() => {
              setEditorInitial(undefined);
              setEditing(true);
            }}
          >
            Editar <kbd className="mono">E</kbd>
          </button>
        </div>
      </header>

      <article aria-labelledby={titleId}>
        <h2 id={titleId} className="note-title">
          {note.title}
        </h2>
        {/* P2: Note has no authorship — date only, never ActorMark */}
        <p className="note-meta mono">
          Actualizada {formatRelative(note.updated_at)}
          {linkCount > 0
            ? ` · ${linkCount} ítem${linkCount === 1 ? "" : "s"} vinculado${linkCount === 1 ? "" : "s"}`
            : ""}
        </p>

        {draftPrompt !== null ? (
          <div className="note-draft-banner">
            Hay cambios sin guardar de antes.{" "}
            <button
              type="button"
              className="linkish"
              onClick={() => {
                setEditorInitial(draftPrompt);
                setDraftPrompt(null);
                setEditing(true);
              }}
            >
              Recuperar
            </button>
            {" · "}
            <button
              type="button"
              className="linkish"
              onClick={() => {
                clearNoteDraft(note.id);
                setDraftPrompt(null);
              }}
            >
              Descartar
            </button>
          </div>
        ) : null}

        {empty ? (
          <p className="note-empty">Esta nota está vacía. Escribe con E.</p>
        ) : (
          <div
            onDoubleClick={() => {
              if (!offline) {
                setEditorInitial(undefined);
                setEditing(true);
              }
            }}
          >
            <Markdown
              source={note.body_md}
              readOnly={offline}
              {...(offline ? {} : { onToggleTask })}
            />
          </div>
        )}
      </article>
    </aside>
  );
}
