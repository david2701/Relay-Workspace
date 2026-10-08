import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "../lib/api";
import {
  clearNoteDraft,
  draftIsNewer,
  readNoteDraft,
  toggleTask,
} from "../lib/markdown";
import { formatNoteMetaLine } from "../lib/note_meta";
import type { Note } from "../lib/types";
import { useT } from "../i18n/I18nProvider";
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
  const t = useT();
  const titleId = useId();
  const [note, setNote] = useState<Note | null>(null);
  const [linkCount, setLinkCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState<string | null>(null);
  const [editorInitial, setEditorInitial] = useState<string | undefined>();
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const onNoteChangeRef = useRef(onNoteChange);
  onNoteChangeRef.current = onNoteChange;

  const load = useCallback(async () => {
    // Never unmount the editor for a poll-driven reload (V12-M11 / BUG-R2-4).
    const soft = editingRef.current;
    if (!soft) {
      setLoading(true);
    }
    setError(false);
    try {
      const { note: n, links } = await api.getNote(noteId);
      if (editingRef.current) {
        // Dirty/focused editor owns the draft — only refresh link count.
        setLinkCount(links.length);
        return;
      }
      setNote(n);
      setLinkCount(links.length);
      onNoteChangeRef.current?.(n);

      const draft = readNoteDraft(noteId);
      if (draft && draftIsNewer(draft, n.updated_at, n.body_md)) {
        setDraftPrompt(draft.body_md);
      } else {
        setDraftPrompt(null);
      }
    } catch {
      if (!editingRef.current) setError(true);
    } finally {
      if (!soft) setLoading(false);
    }
  }, [noteId]);

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
      onNoteChangeRef.current?.(saved);
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
          {t("note.loadError")}{" "}
          <button type="button" className="linkish" onClick={() => void load()}>
            {t("cta.retry")}
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
            {returnLabel ?? t("note.close")}
          </button>
        </header>
        <h2 id={titleId} className="note-title">
          {note.title}
        </h2>
        <NoteEditor
          key={note.id}
          note={note}
          offline={offline}
          {...(editorInitial !== undefined
            ? { initialBody: editorInitial }
            : {})}
          onExit={(n) => {
            setNote(n);
            setEditing(false);
            setDraftPrompt(null);
            onNoteChangeRef.current?.(n);
          }}
          onSaved={(n) => {
            setNote(n);
            onNoteChangeRef.current?.(n);
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
          {returnLabel ?? t("note.close")}
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
            {t("note.edit")} <kbd className="mono">E</kbd>
          </button>
        </div>
      </header>

      <article aria-labelledby={titleId}>
        <h2 id={titleId} className="note-title">
          {note.title}
        </h2>
        {/* §6 P2: Note has no authorship — date only, never ActorMark */}
        <p className="note-meta mono">
          {formatNoteMetaLine(t, note.updated_at, linkCount)}
        </p>

        {draftPrompt !== null ? (
          <div className="note-draft-banner">
            {t("note.draftUnsaved")}{" "}
            <button
              type="button"
              className="linkish"
              onClick={() => {
                setEditorInitial(draftPrompt);
                setDraftPrompt(null);
                setEditing(true);
              }}
            >
              {t("note.recoverDraft")}
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
              {t("note.discardDraft")}
            </button>
          </div>
        ) : null}

        {empty ? (
          <p className="note-empty">{t("note.empty")}</p>
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
