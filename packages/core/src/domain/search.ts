import { USER_ACTOR_ID } from "../schemas/enums.js";
import type {
  SearchMatch,
  SearchMatchField,
  SearchQuery,
  SearchResult,
} from "../schemas/inbox.js";
import type { Note } from "../schemas/note.js";
import type { WorkItem } from "../schemas/work_item.js";
import type { RelayDb } from "../store/db.js";
import { decodeCursor, encodeCursor } from "./cursor.js";
import { itemIdsInView } from "./inbox_query.js";
import {
  addParisDays,
  endOfParisDay,
  fromParisWall,
  startOfParisDay,
  toParisParts,
} from "./paris_time.js";

const MATCH_PRIORITY: readonly SearchMatchField[] = [
  "title",
  "needs_you_reason",
  "blocked_reason",
  "reminder_intent",
  "goal",
  "note",
] as const;

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function toPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~]+/g, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeFtsToken(token: string): string {
  return token
    .split("")
    .filter((ch) => ch !== '"' && ch !== "'")
    .join("")
    .replace(/[^\w]+/g, " ")
    .trim();
}

/** Build FTS5 AND-of-prefix query from free text. */
export function buildFtsMatchQuery(q: string): string | null {
  const words = stripDiacritics(q)
    .split(/\s+/)
    .map(escapeFtsToken)
    .filter((w) => w.length > 0);
  if (words.length === 0) return null;
  return words.map((w) => `"${w}"*`).join(" AND ");
}

function findMatchRanges(
  haystack: string,
  needles: readonly string[],
): { snippet: string; ranges: Array<[number, number]> } | null {
  const plain = haystack;
  const lower = stripDiacritics(plain);
  let first = -1;
  let firstLen = 0;
  for (const needle of needles) {
    if (!needle) continue;
    const idx = lower.indexOf(stripDiacritics(needle));
    if (idx >= 0 && (first < 0 || idx < first)) {
      first = idx;
      firstLen = needle.length;
    }
  }
  if (first < 0) return null;
  const max = 120;
  let start = Math.max(0, first - 40);
  const end = Math.min(plain.length, start + max);
  if (end - start < max) start = Math.max(0, end - max);
  let snippet = plain.slice(start, end);
  if (start > 0) snippet = `…${snippet}`;
  if (end < plain.length) snippet = `${snippet}…`;
  const offset = start > 0 ? 1 : 0;
  const relStart = first - start + offset;
  const relEnd = relStart + firstLen;
  const ranges: Array<[number, number]> = [];
  if (relStart >= 0 && relEnd <= snippet.length) {
    ranges.push([relStart, relEnd]);
  }
  if (snippet.length > 120) snippet = snippet.slice(0, 120);
  return { snippet, ranges };
}

function fieldText(item: WorkItem, field: SearchMatchField): string | null {
  if (field === "title") return item.title;
  if (field === "goal") return item.goal;
  if (field === "blocked_reason") return item.blocked_reason;
  if (field === "needs_you_reason") return item.needs_you_reason;
  if (field === "reminder_intent") return item.reminder_intent;
  return null;
}

/** Ball-holder (visible witness): needs_you → david, else assignee. */
export function ballHolderId(item: WorkItem): string | null {
  if (item.status === "needs_you") return USER_ACTOR_ID;
  if (item.assignee_type === "user") return USER_ACTOR_ID;
  if (item.assignee_type === "agent") return item.assignee_id;
  return null;
}

function parseDayBound(value: string, end: boolean): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (end) return endOfParisDay(fromParisWall({ y, m: mo, d, hh: 12, mm: 0 }));
    return startOfParisDay(fromParisWall({ y, m: mo, d, hh: 12, mm: 0 }));
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return end ? endOfParisDay(dt) : startOfParisDay(dt);
}

function matchesDue(item: WorkItem, query: SearchQuery, now: Date): boolean {
  if (!query.due) return true;
  const due = item.due_at ? new Date(item.due_at) : null;
  if (query.due === "none") return due === null;
  if (due === null) return false;
  const startToday = startOfParisDay(now);
  const endToday = endOfParisDay(now);
  if (query.due === "overdue") return due.getTime() < startToday.getTime();
  if (query.due === "today") {
    return due.getTime() >= startToday.getTime() && due.getTime() <= endToday.getTime();
  }
  if (query.due === "week") {
    const endWeek = addParisDays(endToday, 7);
    return due.getTime() >= startToday.getTime() && due.getTime() <= endWeek.getTime();
  }
  if (query.due === "range") {
    const from = query.from ? parseDayBound(query.from, false) : null;
    const to = query.to ? parseDayBound(query.to, true) : null;
    if (from && due.getTime() < from.getTime()) return false;
    if (to && due.getTime() > to.getTime()) return false;
    return true;
  }
  return true;
}

function matchesFacets(item: WorkItem, query: SearchQuery, now: Date): boolean {
  if (query.status && query.status.length > 0) {
    if (!query.status.includes(item.status)) return false;
  }
  if (query.actor && query.actor.length > 0) {
    const holder = ballHolderId(item);
    if (!holder || !query.actor.includes(holder)) return false;
  }
  if (!matchesDue(item, query, now)) return false;
  return true;
}

type FtsHit = { entity_id: string; entity_type: string };

function ftsSearch(db: RelayDb, matchQuery: string, entityType?: "item" | "note"): FtsHit[] {
  if (entityType) {
    return db
      .prepare(
        `SELECT entity_id, entity_type FROM search_fts
         WHERE entity_type = ? AND search_fts MATCH ?
         ORDER BY rank`,
      )
      .all(entityType, matchQuery) as FtsHit[];
  }
  return db
    .prepare(
      `SELECT entity_id, entity_type FROM search_fts
       WHERE search_fts MATCH ?
       ORDER BY rank`,
    )
    .all(matchQuery) as FtsHit[];
}

export type SearchNotesResult = {
  notes: Array<{ note: Note; match: SearchMatch }>;
  total: number;
};

function buildFieldMatch(
  text: string,
  field: SearchMatchField,
  needles: readonly string[],
  noteId?: string,
): SearchMatch | null {
  const found = findMatchRanges(text, needles);
  if (!found) return null;
  const match: SearchMatch = {
    field,
    snippet: found.snippet,
    ranges: found.ranges,
  };
  if (noteId) match.note_id = noteId as SearchMatch["note_id"];
  return match;
}

function bestItemMatch(
  item: WorkItem,
  needles: readonly string[],
  linkedNotes: readonly Note[],
): SearchMatch | null {
  if (needles.length === 0) {
    return {
      field: "title",
      snippet: item.title.slice(0, 120),
      ranges: [],
    };
  }
  for (const field of MATCH_PRIORITY) {
    if (field === "note") {
      for (const note of linkedNotes) {
        const titleMatch = buildFieldMatch(note.title, "note", needles, note.id);
        if (titleMatch) return titleMatch;
        const bodyMatch = buildFieldMatch(
          toPlainText(note.body_md),
          "note",
          needles,
          note.id,
        );
        if (bodyMatch) return bodyMatch;
      }
      continue;
    }
    const text = fieldText(item, field);
    if (!text) continue;
    const match = buildFieldMatch(text, field, needles);
    if (match) return match;
  }
  return null;
}

export type SearchDeps = {
  db: RelayDb;
  items: readonly WorkItem[];
  notesById: Map<string, Note>;
  linksByItem: Map<string, string[]>;
  linksByNote: Map<string, string[]>;
  now?: Date;
};

function needlesFromQuery(q: string | undefined): string[] {
  if (!q) return [];
  return stripDiacritics(q)
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

export function searchItems(deps: SearchDeps, query: SearchQuery): SearchResult {
  void query.label; // reserved facet — ignored
  const now = deps.now ?? new Date();
  const needles = needlesFromQuery(query.q);
  const matchQuery = query.q ? buildFtsMatchQuery(query.q) : null;

  let candidateIds: Set<string> | null = null;
  const noteHits = new Map<string, string>(); // itemId -> noteId

  if (matchQuery) {
    candidateIds = new Set();
    const hits = ftsSearch(deps.db, matchQuery);
    for (const hit of hits) {
      if (hit.entity_type === "item") {
        candidateIds.add(hit.entity_id);
      } else if (hit.entity_type === "note") {
        const itemIds = deps.linksByNote.get(hit.entity_id) ?? [];
        for (const itemId of itemIds) {
          candidateIds.add(itemId);
          if (!noteHits.has(itemId)) noteHits.set(itemId, hit.entity_id);
        }
      }
    }
  }

  let viewIds: Set<string> | null = null;
  if (query.view) {
    viewIds = itemIdsInView(deps.items, query.view, now);
  }

  type Ranked = {
    item: WorkItem;
    match: SearchMatch;
    priority: number;
  };
  const ranked: Ranked[] = [];

  for (const item of deps.items) {
    if (candidateIds && !candidateIds.has(item.id)) continue;
    if (viewIds && !viewIds.has(item.id)) continue;
    if (!matchesFacets(item, query, now)) continue;
    const noteIds = deps.linksByItem.get(item.id) ?? [];
    const linkedNotes = noteIds
      .map((id) => deps.notesById.get(id))
      .filter((n): n is Note => n !== undefined);
    const match = bestItemMatch(item, needles, linkedNotes);
    if (!match) {
      if (needles.length > 0) continue;
      ranked.push({
        item,
        match: { field: "title", snippet: item.title.slice(0, 120), ranges: [] },
        priority: 0,
      });
      continue;
    }
    const priority = MATCH_PRIORITY.indexOf(match.field);
    ranked.push({ item, match, priority: priority < 0 ? 99 : priority });
  }

  ranked.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.item.updated_at.localeCompare(a.item.updated_at);
  });

  const total = ranked.length;
  let start = 0;
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    const cursorId = cursor?.id ?? (query.cursor.startsWith("itm_") ? query.cursor : null);
    if (cursorId) {
      const idx = ranked.findIndex((r) => r.item.id === cursorId);
      start = idx >= 0 ? idx + 1 : 0;
    }
  }
  const limit = query.limit ?? total;
  const page = ranked.slice(start, start + limit);
  const hasMore = start + limit < total;
  const last = page[page.length - 1];
  const result: SearchResult = {
    items: page.map((r) => ({ item: r.item, match: r.match })),
    total,
  };
  if (hasMore && last) {
    result.next_cursor = encodeCursor({
      id: last.item.id,
      updated_at: last.item.updated_at,
    });
  }
  return result;
}

/** Search orphan (unlinked) notes for /notes?q= */
export function searchNotes(
  deps: SearchDeps,
  q: string,
  opts?: { limit?: number },
): SearchNotesResult {
  const needles = needlesFromQuery(q);
  const matchQuery = buildFtsMatchQuery(q);
  if (!matchQuery) return { notes: [], total: 0 };
  const hits = ftsSearch(deps.db, matchQuery, "note");
  const out: SearchNotesResult["notes"] = [];
  for (const hit of hits) {
    const links = deps.linksByNote.get(hit.entity_id) ?? [];
    if (links.length > 0) continue;
    const note = deps.notesById.get(hit.entity_id);
    if (!note) continue;
    const titleMatch = buildFieldMatch(note.title, "note", needles, note.id);
    const bodyMatch =
      titleMatch ??
      buildFieldMatch(toPlainText(note.body_md), "note", needles, note.id);
    if (!bodyMatch) continue;
    out.push({ note, match: bodyMatch });
  }
  const limit = opts?.limit ?? out.length;
  return { notes: out.slice(0, limit), total: out.length };
}

/** Exported for tests / date facet helpers. */
export function parisDayBounds(now: Date): { start: Date; end: Date; parts: ReturnType<typeof toParisParts> } {
  return {
    start: startOfParisDay(now),
    end: endOfParisDay(now),
    parts: toParisParts(now),
  };
}
