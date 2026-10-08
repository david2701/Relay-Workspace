type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
  position?: unknown;
};

/**
 * remark plugin: turn raw HTML nodes into text so they render literally
 * (V12-M3) without shifting source offsets (needed for toggleTask).
 */
export function remarkHtmlAsText() {
  return (tree: MdastNode) => {
    const walk = (node: MdastNode) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]!;
        if (child.type === "html" && typeof child.value === "string") {
          node.children[i] = {
            type: "text",
            value: child.value,
            position: child.position,
          };
        } else {
          walk(child);
        }
      }
    };
    walk(tree);
  };
}

/** Plain-text extract from markdown for list/card snippets. */
export function toPlainText(md: string, maxChars = 240): string {
  const plain = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "")
    .replace(/\[[ xX]\]\s*/g, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*\|.*\|?\s*$/gm, " ")
    .replace(/^\s*[-*_]{3,}\s*$/gm, " ")
    .replace(/[*_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (plain.length <= maxChars) return plain;
  return `${plain.slice(0, maxChars).trimEnd()}…`;
}

const TASK_MARKER = /\[[ xX]\]/;

/**
 * Toggle the GFM task marker on the line that contains `offset`.
 * Rewrites only `[ ]` ↔ `[x]` (one character of the marker body).
 */
export function toggleTask(md: string, offset: number): string {
  const safeOffset = Math.max(0, Math.min(offset, md.length));
  const lineStart = md.lastIndexOf("\n", safeOffset - 1) + 1;
  const lineEndIdx = md.indexOf("\n", safeOffset);
  const lineEnd = lineEndIdx === -1 ? md.length : lineEndIdx;
  const line = md.slice(lineStart, lineEnd);
  const match = TASK_MARKER.exec(line);
  if (!match || match.index === undefined) return md;
  const abs = lineStart + match.index;
  const current = md.slice(abs, abs + 3);
  const next = current[1] === " " ? "[x]" : "[ ]";
  return md.slice(0, abs) + next + md.slice(abs + 3);
}

/**
 * URL transform for react-markdown: allow http(s), mailto, and app-relative `/` paths.
 * Blocks javascript:, data:, file:, protocol-relative, and other schemes.
 */
export function sanitizeUrl(url: string): string {
  const trimmed = String(url ?? "").trim();
  if (!trimmed) return "";

  // App-relative paths only (not protocol-relative //…)
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  // Hash / query-only relative fragments are not used for note links
  if (trimmed.startsWith("#")) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "";
  }

  const protocol = parsed.protocol.toLowerCase();
  if (
    protocol === "http:" ||
    protocol === "https:" ||
    protocol === "mailto:"
  ) {
    return trimmed;
  }
  return "";
}

/** react-markdown `urlTransform` adapter. */
export function urlTransform(url: string): string {
  return sanitizeUrl(url);
}

export function isInternalPath(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

export const NOTE_DRAFT_PREFIX = "relay.note.draft.";
export const BODY_MD_MAX = 100_000;
export const BODY_MD_WARN = 90_000;

export type NoteDraft = {
  body_md: string;
  /** Client clock when the draft was written (ms). */
  written_at: number;
  /** Server `updated_at` the draft was based on, if known. */
  base_updated_at?: string;
};

export function draftKey(noteId: string): string {
  return `${NOTE_DRAFT_PREFIX}${noteId}`;
}

export function readNoteDraft(noteId: string): NoteDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(noteId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NoteDraft;
    if (typeof parsed?.body_md !== "string") return null;
    if (typeof parsed.written_at !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeNoteDraft(noteId: string, draft: NoteDraft): void {
  try {
    localStorage.setItem(draftKey(noteId), JSON.stringify(draft));
  } catch {
    // Quota / private mode — ignore
  }
}

export function clearNoteDraft(noteId: string): void {
  try {
    localStorage.removeItem(draftKey(noteId));
  } catch {
    // ignore
  }
}

/** True when a stored draft is newer than the server note and differs. */
export function draftIsNewer(
  draft: NoteDraft,
  serverUpdatedAt: string,
  serverBody: string,
): boolean {
  if (draft.body_md === serverBody) return false;
  const serverMs = Date.parse(serverUpdatedAt);
  if (Number.isNaN(serverMs)) return draft.body_md.length > 0;
  return draft.written_at > serverMs;
}
