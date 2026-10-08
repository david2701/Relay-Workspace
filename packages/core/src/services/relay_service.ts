import {
  buildContextPack,
  contextPackToMarkdown,
} from "../domain/context_pack.js";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.js";
import { buildInboxSync, queryInbox } from "../domain/inbox_query.js";
import type { PageParams } from "../domain/page.js";
import { recommendInbox } from "../domain/recommend.js";
import { type SearchDeps, searchItems, searchNotes } from "../domain/search.js";
import { nowIso } from "../domain/time.js";
import {
  applyStatusChange,
  askUser,
  completeItem,
  delegateItem,
  reopenItem,
  stampActor,
} from "../domain/transitions.js";
import { type Agent, DEFAULT_AGENTS } from "../schemas/agent.js";
import {
  type InboxView,
  type Source,
  USER_ACTOR_ID,
} from "../schemas/enums.js";
import {
  DEFAULT_SETTINGS,
  SettingsSchema,
  type RelaySettings,
  UpdateSettingsSchema,
  type UpdateSettingsInput,
} from "../schemas/settings.js";
import { createId } from "../schemas/ids.js";
import type {
  ContextPack,
  InboxQueryResult,
  InboxSyncResult,
  Recommendation,
  SearchQuery,
  SearchResult,
} from "../schemas/inbox.js";
import type {
  CreateNoteInput,
  ItemNoteLink,
  Note,
  NoteRole,
  UpdateNoteInput,
} from "../schemas/note.js";
import type {
  Actor,
  CreateItemInput,
  SetStatusInput,
  UpdateItemInput,
  WorkItem,
} from "../schemas/work_item.js";
import { openDatabase, type RelayDb, readSqliteDataVersion } from "../store/db.js";
import type { ListPageResult } from "../store/repositories.js";
import {
  AgentRepository,
  LinkRepository,
  NoteRepository,
  WorkItemRepository,
} from "../store/repositories.js";

export type RelayServiceOptions = {
  dbPath: string;
  agents?: readonly Agent[];
};

export type InboxQueryOptions = {
  now?: Date;
  limit?: number;
  cursor?: string;
  since?: string;
};

export class RelayService {
  readonly db: RelayDb;
  private readonly items: WorkItemRepository;
  private readonly notes: NoteRepository;
  private readonly links: LinkRepository;
  private readonly agents: AgentRepository;
  /** Avoid re-reading 10k SQLite rows on every inbox/search poll. */
  private itemsCache: WorkItem[] | null = null;
  /** Open rows only — Todo snapshot path skips done/cancelled. */
  private openItemsCache: WorkItem[] | null = null;
  /**
   * SQLite `PRAGMA data_version` — changes on any commit (this process or
   * another). The pragma itself is cheap; we only reload rows when it moves.
   */
  private cachedDataVersion: number | null = null;

  constructor(options: RelayServiceOptions) {
    this.db = openDatabase(options.dbPath);
    this.items = new WorkItemRepository(this.db);
    this.notes = new NoteRepository(this.db);
    this.links = new LinkRepository(this.db);
    this.agents = new AgentRepository(this.db);
    if (options.agents) {
      // already seeded by openDatabase; optional override unused in P0
      void DEFAULT_AGENTS;
    }
    this.cachedDataVersion = readSqliteDataVersion(this.db);
  }

  close(): void {
    this.itemsCache = null;
    this.openItemsCache = null;
    this.cachedDataVersion = null;
    this.db.close();
  }

  /**
   * Drop in-process item caches when another connection committed
   * (mcp:stdio, second RelayService, or raw SQL). No-op when unchanged.
   */
  private ensureCachesFresh(): void {
    const ver = readSqliteDataVersion(this.db);
    if (this.cachedDataVersion !== null && ver !== this.cachedDataVersion) {
      this.itemsCache = null;
      this.openItemsCache = null;
    }
    this.cachedDataVersion = ver;
  }

  private listAllItems(): WorkItem[] {
    this.ensureCachesFresh();
    if (!this.itemsCache) {
      this.itemsCache = this.items.listAll();
    }
    return this.itemsCache;
  }

  private listOpenItems(): WorkItem[] {
    this.ensureCachesFresh();
    if (!this.openItemsCache) {
      this.openItemsCache = this.items.listOpen();
    }
    return this.openItemsCache;
  }

  private invalidateItemsCache(): void {
    this.itemsCache = null;
    this.openItemsCache = null;
  }

  /** After a local write: drop caches and adopt the new data_version. */
  private afterLocalWrite(): void {
    this.invalidateItemsCache();
    this.cachedDataVersion = readSqliteDataVersion(this.db);
  }

  /**
   * Wall-clock cursor persisted in `relay_meta` so every process shares the
   * watermark. Meta-only writes bump data_version — adopt it without
   * discarding item caches (rows are unchanged).
   */
  private stampSyncCursor(now?: Date): string {
    const wall = nowIso(now ?? new Date());
    this.db
      .prepare(
        `INSERT INTO relay_meta(key, value) VALUES ('sync_cursor', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(wall);
    this.cachedDataVersion = readSqliteDataVersion(this.db);
    return wall;
  }

  listAgents(): Agent[] {
    return this.agents.list();
  }

  private readMeta(key: string): string | null {
    const row = this.db
      .prepare(`SELECT value FROM relay_meta WHERE key = ?`)
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private writeMeta(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO relay_meta(key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  getSettings(): RelaySettings {
    const raw = {
      timezone: this.readMeta("timezone") ?? DEFAULT_SETTINGS.timezone,
      user_display_name:
        this.readMeta("user_display_name") ?? DEFAULT_SETTINGS.user_display_name,
      user_initial: this.readMeta("user_initial") ?? DEFAULT_SETTINGS.user_initial,
    };
    return SettingsSchema.parse(raw);
  }

  updateSettings(input: UpdateSettingsInput): RelaySettings {
    const patch = UpdateSettingsSchema.parse(input);
    const current = this.getSettings();
    const merged = SettingsSchema.parse({ ...current, ...patch });
    try {
      Intl.DateTimeFormat(undefined, { timeZone: merged.timezone });
    } catch {
      throw new ValidationError(`Invalid IANA timezone: ${merged.timezone}`);
    }
    if (patch.timezone !== undefined) {
      this.writeMeta("timezone", merged.timezone);
    }
    if (patch.user_display_name !== undefined) {
      this.writeMeta("user_display_name", merged.user_display_name);
    }
    if (patch.user_initial !== undefined) {
      this.writeMeta("user_initial", merged.user_initial);
    }
    return merged;
  }

  resolveActor(
    raw: { type?: string | undefined; id?: string | undefined } | undefined,
    source: Source,
  ): Actor {
    if (source === "ui") {
      return { type: "user", id: USER_ACTOR_ID };
    }
    if (source === "system") {
      return { type: "system", id: "relay" };
    }
    const id = raw?.id?.trim();
    if (!id) {
      throw new ValidationError(
        "MCP actor required: pass actor.id (agent catalog id) or X-Relay-Actor header",
      );
    }
    if (id === USER_ACTOR_ID || raw?.type === "user") {
      throw new ValidationError("MCP actors must be agents (AC10); user mutations use the web UI");
    }
    const agent = this.agents.get(id);
    if (!agent) {
      throw new ValidationError(`Unknown agent id: ${id}`);
    }
    return { type: "agent", id: agent.id };
  }

  listItems(): WorkItem[];
  listItems(params: PageParams): ListPageResult<WorkItem>;
  listItems(params?: PageParams): WorkItem[] | ListPageResult<WorkItem> {
    if (!params || (params.limit === undefined && params.cursor === undefined)) {
      return this.listAllItems();
    }
    return this.items.listPage(params);
  }

  getItem(id: string): WorkItem {
    const item = this.items.get(id);
    if (!item) throw new NotFoundError("WorkItem", id);
    return item;
  }

  createItem(input: CreateItemInput, actor: Actor, source: Source): WorkItem {
    const at = nowIso();
    let status = input.status ?? "inbox";
    const assigneeType = input.assignee_type ?? "unassigned";
    let assigneeId = input.assignee_id ?? null;
    if (assigneeType === "agent" && !assigneeId) {
      throw new ValidationError("assignee_id required when assignee_type=agent");
    }
    if (assigneeType === "agent" && assigneeId && !this.agents.get(assigneeId)) {
      throw new ValidationError(`Unknown agent id: ${assigneeId}`);
    }
    if (assigneeType === "user") {
      assigneeId = USER_ACTOR_ID;
    }
    if (status === "blocked" && (!input.blocked_reason || input.blocked_reason.trim().length < 3)) {
      throw new ValidationError("blocked_reason is required (min 3 characters)");
    }
    if (
      status === "needs_you" &&
      (!input.needs_you_reason || input.needs_you_reason.trim().length < 3)
    ) {
      throw new ValidationError("needs_you_reason is required (min 3 characters)");
    }
    if (assigneeType !== "unassigned" && status === "inbox") {
      status = "assigned";
    }
    const item: WorkItem = {
      id: createId("itm"),
      title: input.title.trim(),
      goal: input.goal?.trim() ?? null,
      status,
      assignee_type: assigneeType,
      assignee_id: assigneeId,
      due_at: input.due_at ?? null,
      reminder_at: input.reminder_at ?? null,
      reminder_intent: input.reminder_intent ?? null,
      priority: input.priority ?? "none",
      blocked_reason: input.blocked_reason?.trim() ?? null,
      needs_you_reason: input.needs_you_reason?.trim() ?? null,
      source,
      created_at: at,
      updated_at: at,
      started_at: status === "in_progress" ? at : null,
      completed_at: null,
      completed_by_type: null,
      completed_by_id: null,
      last_actor_type: actor.type,
      last_actor_id: actor.id,
      list_id: null,
    };
    this.items.upsert(item);
    this.afterLocalWrite();
    return item;
  }

  updateItem(id: string, input: UpdateItemInput, actor: Actor): WorkItem {
    const current = this.getItem(id);
    const assigneeType = input.assignee_type ?? current.assignee_type;
    let assigneeId =
      input.assignee_id !== undefined ? input.assignee_id : current.assignee_id;
    if (assigneeType === "agent") {
      if (!assigneeId) throw new ValidationError("assignee_id required for agent");
      if (!this.agents.get(assigneeId)) {
        throw new ValidationError(`Unknown agent id: ${assigneeId}`);
      }
    }
    if (assigneeType === "user") assigneeId = USER_ACTOR_ID;
    if (assigneeType === "unassigned") assigneeId = null;
    let status = current.status;
    if (
      status === "inbox" &&
      assigneeType !== "unassigned" &&
      (input.assignee_type !== undefined || input.assignee_id !== undefined)
    ) {
      status = "assigned";
    }
    const next: WorkItem = stampActor(
      {
        ...current,
        title: input.title?.trim() ?? current.title,
        goal:
          input.goal !== undefined ? (input.goal?.trim() ?? null) : current.goal,
        due_at: input.due_at !== undefined ? input.due_at : current.due_at,
        reminder_at:
          input.reminder_at !== undefined ? input.reminder_at : current.reminder_at,
        reminder_intent:
          input.reminder_intent !== undefined
            ? input.reminder_intent
            : current.reminder_intent,
        priority: input.priority ?? current.priority,
        assignee_type: assigneeType,
        assignee_id: assigneeId,
        blocked_reason:
          input.blocked_reason !== undefined
            ? input.blocked_reason
            : current.blocked_reason,
        needs_you_reason:
          input.needs_you_reason !== undefined
            ? input.needs_you_reason
            : current.needs_you_reason,
        status,
      },
      actor,
    );
    this.items.upsert(next);
    this.afterLocalWrite();
    return next;
  }

  setStatus(id: string, input: SetStatusInput, actor: Actor, source: Source): WorkItem {
    const current = this.getItem(id);
    const next = applyStatusChange({ item: current, input, actor, source });
    this.items.upsert(next);
    this.afterLocalWrite();
    return next;
  }

  complete(id: string, actor: Actor, source: Source): WorkItem {
    const next = completeItem({ item: this.getItem(id), actor, source });
    this.items.upsert(next);
    this.afterLocalWrite();
    return next;
  }

  reopen(id: string, actor: Actor): WorkItem {
    const next = reopenItem({ item: this.getItem(id), actor });
    this.items.upsert(next);
    this.afterLocalWrite();
    return next;
  }

  delegate(id: string, agentId: string, actor: Actor, source: Source): WorkItem {
    if (!this.agents.get(agentId)) {
      throw new ValidationError(`Unknown agent id: ${agentId}`);
    }
    const next = delegateItem({
      item: this.getItem(id),
      agentId,
      actor,
      source,
    });
    this.items.upsert(next);
    this.afterLocalWrite();
    return next;
  }

  askUser(id: string, reason: string, actor: Actor, source: Source): WorkItem {
    const next = askUser({
      item: this.getItem(id),
      reason,
      actor,
      source,
    });
    this.items.upsert(next);
    this.afterLocalWrite();
    return next;
  }

  listNotes(): Note[];
  listNotes(params: PageParams): ListPageResult<Note>;
  listNotes(params?: PageParams): Note[] | ListPageResult<Note> {
    if (!params || (params.limit === undefined && params.cursor === undefined)) {
      return this.notes.listAll();
    }
    return this.notes.listPage(params);
  }

  getNote(id: string): Note {
    const note = this.notes.get(id);
    if (!note) throw new NotFoundError("Note", id);
    return note;
  }

  createNote(input: CreateNoteInput): Note {
    const at = nowIso();
    const note: Note = {
      id: createId("nte"),
      title: input.title.trim(),
      body_md: input.body_md ?? "",
      created_at: at,
      updated_at: at,
    };
    this.notes.upsert(note);
    return note;
  }

  updateNote(
    id: string,
    input: UpdateNoteInput,
    opts?: { if_updated_at?: string },
  ): Note {
    const current = this.getNote(id);
    const note: Note = {
      ...current,
      title: input.title?.trim() ?? current.title,
      body_md: input.body_md ?? current.body_md,
      updated_at: nowIso(),
    };
    if (opts?.if_updated_at !== undefined) {
      const ok = this.notes.updateIfUnchanged(note, opts.if_updated_at);
      if (!ok) {
        const latest = this.notes.get(id);
        throw new ConflictError(
          `Note ${id} was modified (expected updated_at=${opts.if_updated_at})`,
          { current_updated_at: latest?.updated_at ?? current.updated_at },
        );
      }
      return note;
    }
    this.notes.upsert(note);
    return note;
  }

  linkNote(itemId: string, noteId: string, role: NoteRole = "context"): ItemNoteLink {
    this.getItem(itemId);
    this.getNote(noteId);
    const link: ItemNoteLink = { item_id: itemId, note_id: noteId, role };
    this.links.link(link);
    return link;
  }

  unlinkNote(itemId: string, noteId: string): void {
    this.links.unlink(itemId, noteId);
  }

  linksForItem(itemId: string): ItemNoteLink[] {
    return this.links.listForItem(itemId);
  }

  linksForNote(noteId: string): ItemNoteLink[] {
    return this.links.listForNote(noteId);
  }

  getContext(itemId: string): ContextPack {
    const item = this.getItem(itemId);
    const links = this.links.listForItem(itemId);
    const notes = links
      .map((l) => this.notes.get(l.note_id))
      .filter((n): n is Note => n !== null);
    return buildContextPack({
      item,
      notes,
      links,
      agents: this.agents.list(),
    });
  }

  getContextMarkdown(itemId: string): string {
    return contextPackToMarkdown(this.getContext(itemId));
  }

  inboxQuery(
    view: InboxView,
    opts?: InboxQueryOptions,
  ): InboxQueryResult | InboxSyncResult {
    const now = opts?.now ?? new Date();
    const timeZone = this.getSettings().timezone;
    if (opts?.since !== undefined) {
      // Delta sync needs the full table so completions leave the view via removed_ids.
      // ensureCachesFresh (via listAllItems) picks up mcp:stdio / SQL writers.
      const syncArgs: Parameters<typeof buildInboxSync>[0] = {
        items: this.listAllItems(),
        view,
        since: opts.since,
        now,
        timeZone,
      };
      const delta = buildInboxSync(syncArgs);
      const cursor = this.stampSyncCursor(now);
      delta.sync_cursor = cursor;
      delta.server_time = cursor;
      return delta;
    }
    // Todo snapshot: open rows only (skip ~36% done/cancelled) + fast group_counts.
    const items = view === "all" ? this.listOpenItems() : this.listAllItems();
    const args: Parameters<typeof queryInbox>[0] = {
      items,
      view,
      now,
      timeZone,
    };
    if (opts?.limit !== undefined) args.limit = opts.limit;
    if (opts?.cursor !== undefined) args.cursor = opts.cursor;
    const snap = queryInbox(args);
    const cursor = this.stampSyncCursor(now);
    snap.sync_cursor = cursor;
    snap.server_time = cursor;
    return snap;
  }

  inboxRecommend(limit = 3, now?: Date): Recommendation[] {
    const args: Parameters<typeof recommendInbox>[0] = {
      items: this.listAllItems(),
      agents: this.agents.list(),
      limit,
    };
    if (now) args.now = now;
    return recommendInbox(args);
  }

  private searchDeps(now?: Date): SearchDeps {
    const items = this.listAllItems();
    const notes = this.notes.listAll();
    const notesById = new Map(notes.map((n) => [n.id, n]));
    const allLinks = this.links.listAll();
    const linksByItem = new Map<string, string[]>();
    const linksByNote = new Map<string, string[]>();
    for (const link of allLinks) {
      const itemList = linksByItem.get(link.item_id) ?? [];
      itemList.push(link.note_id);
      linksByItem.set(link.item_id, itemList);
      const noteList = linksByNote.get(link.note_id) ?? [];
      noteList.push(link.item_id);
      linksByNote.set(link.note_id, noteList);
    }
    const deps: SearchDeps = {
      db: this.db,
      items,
      notesById,
      linksByItem,
      linksByNote,
      timeZone: this.getSettings().timezone,
    };
    if (now) deps.now = now;
    return deps;
  }

  search(params: SearchQuery, now?: Date): SearchResult {
    return searchItems(this.searchDeps(now), params);
  }

  searchOrphanNotes(q: string, opts?: { limit?: number; now?: Date }) {
    const noteOpts: { limit?: number } = {};
    if (opts?.limit !== undefined) noteOpts.limit = opts.limit;
    return searchNotes(this.searchDeps(opts?.now), q, noteOpts);
  }

  /** Test/seed helper */
  resetData(): void {
    this.items.deleteAll();
    this.notes.deleteAll();
    this.afterLocalWrite();
  }
}
