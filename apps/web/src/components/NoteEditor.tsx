import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useI18n, useT } from "../i18n/I18nProvider";
import { ApiError, api } from "../lib/api";
import {
  BODY_MD_MAX,
  BODY_MD_WARN,
  clearNoteDraft,
  writeNoteDraft,
} from "../lib/markdown";
import type { Note } from "../lib/types";
import { Markdown } from "./Markdown";
import "./NoteEditor.css";

type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

type Props = {
  note: Note;
  offline: boolean;
  initialBody?: string;
  onExit: (note: Note) => void;
  onSaved: (note: Note) => void;
};

function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
): { next: string; selStart: number; selEnd: number } {
  const selected = value.slice(start, end);
  const next =
    value.slice(0, start) + before + selected + after + value.slice(end);
  if (selected) {
    return {
      next,
      selStart: start + before.length,
      selEnd: start + before.length + selected.length,
    };
  }
  const cursor = start + before.length;
  return { next, selStart: cursor, selEnd: cursor };
}

export function NoteEditor({
  note,
  offline,
  initialBody,
  onExit,
  onSaved,
}: Props) {
  const t = useT();
  const { intlLocale } = useI18n();
  const statusId = useId();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState(initialBody ?? note.body_md);
  const [mode, setMode] = useState<"write" | "preview" | "theirs">("write");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(note.updated_at);
  const [serverBody, setServerBody] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(note);
  const debounceRef = useRef<number | null>(null);
  const savedTimerRef = useRef<number | null>(null);
  const bodyRef = useRef(body);
  bodyRef.current = body;

  useEffect(() => {
    taRef.current?.focus();
    const el = taRef.current;
    if (el) {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, []);

  const persistDraft = useCallback(
    (text: string) => {
      writeNoteDraft(note.id, {
        body_md: text,
        written_at: Date.now(),
        base_updated_at: baseUpdatedAt,
      });
    },
    [note.id, baseUpdatedAt],
  );

  const save = useCallback(
    async (opts?: { force?: boolean; exit?: boolean }) => {
      if (offline) return savedNote;
      const text = bodyRef.current;
      if (text.length > BODY_MD_MAX) return savedNote;
      setStatus("saving");
      try {
        const { note: next } = await api.updateNote(
          note.id,
          { body_md: text },
          opts?.force ? undefined : { if_updated_at: baseUpdatedAt },
        );
        setSavedNote(next);
        setBaseUpdatedAt(next.updated_at);
        clearNoteDraft(note.id);
        onSaved(next);
        setStatus("saved");
        if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
        savedTimerRef.current = window.setTimeout(() => {
          setStatus((s) => (s === "saved" ? "idle" : s));
        }, 1000);
        return next;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setStatus("conflict");
          try {
            const { note: current } = await api.getNote(note.id);
            setServerBody(current.body_md);
            setBaseUpdatedAt(current.updated_at);
          } catch {
            if (err.current_updated_at) {
              setBaseUpdatedAt(err.current_updated_at);
            }
            setServerBody(null);
          }
          throw err;
        }
        setStatus("error");
        throw err;
      }
    },
    [offline, note.id, baseUpdatedAt, onSaved, savedNote],
  );

  const scheduleSave = useCallback(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void save().catch(() => {
        /* status already set */
      });
    }, 800);
  }, [save]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    };
  }, []);

  function applyEdit(
    next: string,
    selStart: number,
    selEnd: number,
  ) {
    const clipped = next.slice(0, BODY_MD_MAX);
    setBody(clipped);
    persistDraft(clipped);
    setStatus((s) => (s === "conflict" ? s : "idle"));
    scheduleSave();
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value.slice(0, BODY_MD_MAX);
    setBody(next);
    persistDraft(next);
    if (status === "conflict") {
      /* keep conflict banner; still allow typing */
    } else {
      setStatus("idle");
    }
    scheduleSave();
  }

  async function exit() {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    try {
      const next = await save();
      onExit(next);
    } catch {
      /* stay in editor on conflict/error — text preserved */
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      void exit();
      return;
    }
    if (mod && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      void exit();
      return;
    }
    if (mod && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      e.stopPropagation();
      const el = taRef.current;
      if (!el) return;
      const { next, selEnd } = wrapSelection(
        body,
        el.selectionStart,
        el.selectionEnd,
        "[",
        "]()",
      );
      // Text caret between the parentheses: [selection](|)
      const cursor = selEnd + 2; // after "]("
      applyEdit(next, cursor, cursor);
      return;
    }
    if (mod && (e.key === "b" || e.key === "B")) {
      e.preventDefault();
      e.stopPropagation();
      const el = taRef.current!;
      const r = wrapSelection(body, el.selectionStart, el.selectionEnd, "**", "**");
      applyEdit(r.next, r.selStart, r.selEnd);
      return;
    }
    if (mod && (e.key === "i" || e.key === "I") && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      const el = taRef.current!;
      const r = wrapSelection(body, el.selectionStart, el.selectionEnd, "*", "*");
      applyEdit(r.next, r.selStart, r.selEnd);
      return;
    }
    if (mod && (e.key === "e" || e.key === "E")) {
      e.preventDefault();
      e.stopPropagation();
      const el = taRef.current!;
      const r = wrapSelection(body, el.selectionStart, el.selectionEnd, "`", "`");
      applyEdit(r.next, r.selStart, r.selEnd);
    }
  }

  const statusText =
    status === "saving"
      ? t("note.saving")
      : status === "saved"
        ? t("detail.saved")
        : status === "error"
          ? t("note.saveError")
          : "";

  return (
    <div className="note-editor">
      <div className="note-editor-bar">
        <div className="note-mode-seg" role="tablist" aria-label={t("note.modeAria")}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "write"}
            className={mode === "write" ? "on" : ""}
            onClick={() => setMode("write")}
          >
            {t("note.write")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "preview"}
            className={mode === "preview" ? "on" : ""}
            onClick={() => setMode("preview")}
          >
            {t("note.preview")}
          </button>
          {status === "conflict" && serverBody !== null ? (
            <button
              type="button"
              role="tab"
              aria-selected={mode === "theirs"}
              className={mode === "theirs" ? "on" : ""}
              onClick={() => setMode("theirs")}
            >
              {t("note.theirsVersion")}
            </button>
          ) : null}
        </div>
        <span
          id={statusId}
          className={`note-save-status mono${status === "error" ? " is-err" : ""}${status === "saved" ? " is-saved" : ""}`}
          aria-live="polite"
          {...(status === "error" ? { role: "alert" as const } : {})}
        >
          {statusText}
          {status === "error" ? (
            <>
              {" "}
              <button
                type="button"
                className="linkish"
                onClick={() => {
                  void save().catch(() => undefined);
                }}
              >
                {t("cta.retry")}
              </button>
            </>
          ) : null}
        </span>
        <button type="button" className="btn-secondary note-done" onClick={() => void exit()}>
          {t("picker.done")}
        </button>
      </div>

      {status === "conflict" ? (
        <div className="note-conflict" role="alert">
          <span>{t("note.conflictBody")}</span>
          <span className="note-conflict-actions">
            <button
              type="button"
              className="linkish"
              onClick={() => setMode("theirs")}
              disabled={serverBody === null}
            >
              {t("note.viewTheirs")}
            </button>
            {" · "}
            <button
              type="button"
              className="linkish"
              onClick={() => {
                void save({ force: true }).catch(() => undefined);
              }}
            >
              {t("note.keepMine")}
            </button>
          </span>
        </div>
      ) : null}

      {body.length >= BODY_MD_WARN ? (
        <div className="note-limit mono">
          {body.length.toLocaleString(intlLocale)} /{" "}
          {BODY_MD_MAX.toLocaleString(intlLocale)}
        </div>
      ) : null}

      {mode === "write" ? (
        <textarea
          ref={taRef}
          className="note-textarea"
          aria-label={t("note.bodyAria")}
          aria-describedby={statusId}
          value={body}
          onChange={onChange}
          onKeyDown={onKeyDown}
          disabled={offline}
          rows={12}
        />
      ) : mode === "theirs" && serverBody !== null ? (
        <Markdown source={serverBody} readOnly />
      ) : (
        <Markdown source={body} readOnly />
      )}
    </div>
  );
}
