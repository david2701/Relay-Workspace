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
import { buildDecisionNoteTitle } from "../domain/decision_note_title.js";
import {
  applyStatusChange,
  askUser,
  completeItem,
  delegateItem,
  reopenItem,
  returnToAgent,
  stampActor,
  takeItem,
} from "../domain/transitions.js";
import {
  dateOnlyZoneIso,
  isDateOnlyInZone,
  toZoneParts,
} from "../domain/zone_time.js";
import { type Agent, DEFAULT_AGENTS } from "../schemas/agent.js";
import {
  type InboxView,
  type Source,
  USER_ACTOR_ID,
} from "../schemas/enums.js";
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
  ChangesPage,
  ItemEvent,
  ItemEventsPage,
  ItemEventType,
} from "../schemas/item_event.js";
import type {
  CreateNoteInput,
  ItemNoteLink,
  Note,
  NoteRole,
  UpdateNoteInput,
} from "../schemas/note.js";
import {
  DEFAULT_SETTINGS,
  type RelaySettings,
  SettingsSchema,
  type UpdateSettingsInput,
  UpdateSettingsSchema,
} from "../schemas/settings.js";
import type {
  Actor,
  AnswerItemInput,
  CreateItemInput,
  SetStatusInput,
  UpdateItemInput,
  WorkItem,
} from "../schemas/work_item.js";
import { openDatabase, type RelayDb, readSqliteDataVersion } from "../store/db.js";
import {
  appendItemEvent,
  itemIdsWithEventsAfter,
  latestEventSeq,
  listItemEvents,
  listRecentItemEvents,
} from "../store/event_log.js";
import { cleanupExpiredIdempotencyKeys } from "../store/idempotency.js";
import type { ListPageResult } from "../store/repositories.js";
import {
  AgentRepository,
  LinkRepository,
  NoteRepository,
  WorkItemRepository,
} from "../store/repositories.js";

/** Max characters stored in answered event payload.text. */
const ANSWER_EXCERPT_MAX = 200;

const SYSTEM_ACTOR: Actor = { type: "system", id: "relay" };

const TRACKED_ITEM_FIELDS = [
  "title",
  "goal",
  "due_at",
  "reminder_at",
  "reminder_intent",
  "priority",
  "assignee_type",
  "assignee_id",
  "blocked_reason",
  "needs_you_reason",
  "status",
] as const;

export type RelayServiceOptions = {
  dbPath: string;
  agents?: readonly Agent[];
};

export type InboxQueryOptions = {
  now?: Date;
  limit?: number;
  cursor?: string;
  since?: string;
  /** Preferred inbox delta cursor (global item_events.seq). */
  after_seq?: number;
};

export type EventPageOptions = {
  after_seq?: number;
  limit?: number;
};

export type AnswerResult = {
  item: WorkItem;
  note: Note;
  seq: number;
};

export type TakeResult = {
  item: WorkItem;
  seq: number;
};

export type ItemWriteOpts = {
  /** Optimistic concurrency; mismatch → ConflictError with current item. */
  if_updated_at?: string;
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
  private idempotencyCleanupTimer: ReturnType<typeof setInterval> | null = null;

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
    this.idempotencyCleanupTimer = setInterval(
      () => {
        cleanupExpiredIdempotencyKeys(this.db);
      },
      60 * 60 * 1000,
    );
    // Allow the process to exit while the timer is pending (tests / short-lived CLIs).
    if (
      this.idempotencyCleanupTimer &&
      typeof this.idempotencyCleanupTimer === "object" &&
      "unref" in this.idempotencyCleanupTimer
    ) {
      this.idempotencyCleanupTimer.unref();
    }
  }

  close(): void {
    if (this.idempotencyCleanupTimer) {
      clearInterval(this.idempotencyCleanupTimer);
      this.idempotencyCleanupTimer = null;
    }
    this.itemsCache = null;
    this.openItemsCache = null;
    this.cachedDataVersion = null;
    this.db.close();
  }

  /** Drop expired Idempotency-Key rows (also runs on open + hourly). */
  cleanupIdempotencyKeys(now?: Date): number {
    return cleanupExpiredIdempotencyKeys(this.db, now ?? new Date());
  }

  /**
   * Persist an updated item, honouring optional if_updated_at.
   * Must run inside runInWriteTx when combined with events.
   */
  private writeItem(
    next: WorkItem,
    opts?: ItemWriteOpts,
  ): void {
    if (opts?.if_updated_at !== undefined) {
      const ok = this.items.updateIfUnchanged(next, opts.if_updated_at);
      if (!ok) {
        const latest = this.items.get(next.id);
        throw new ConflictError(
          `WorkItem ${next.id} was modified (expected updated_at=${opts.if_updated_at})`,
          {
            current_updated_at: latest?.updated_at ?? next.updated_at,
            item: latest ?? next,
          },
        );
      }
      return;
    }
    this.items.upsert(next);
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

  /** Run a mutating write + event append in one IMMEDIATE transaction. */
  private runInWriteTx<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      this.afterLocalWrite();
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  private emitItemEvent(
    itemId: string,
    type: ItemEventType,
    actor: Actor,
    payload: Record<string, unknown> = {},
  ): ItemEvent {
    return appendItemEvent(this.db, { itemId, type, actor, payload });
  }

  private classifyUpdateEvent(
    current: WorkItem,
    next: WorkItem,
  ): { type: ItemEventType; payload: Record<string, unknown> } {
    const changed = TRACKED_ITEM_FIELDS.filter((key) => current[key] !== next[key]);
    const assigneeChanged =
      changed.includes("assignee_type") || changed.includes("assignee_id");
    const reminderChanged =
      changed.includes("reminder_at") || changed.includes("reminder_intent");
    const otherThanAssignee = changed.filter(
      (key) =>
        key !== "assignee_type" && key !== "assignee_id" && key !== "status",
    );
    if (assigneeChanged && otherThanAssignee.length === 0) {
      if (next.assignee_type === "agent") {
        return {
          type: "delegated",
          payload: {
            agent_id: next.assignee_id,
            from_assignee_type: current.assignee_type,
            from_assignee_id: current.assignee_id,
            status: next.status,
          },
        };
      }
      return {
        type: "assigned",
        payload: {
          assignee_type: next.assignee_type,
          assignee_id: next.assignee_id,
          from_assignee_type: current.assignee_type,
          from_assignee_id: current.assignee_id,
          status: next.status,
        },
      };
    }
    const otherThanReminder = changed.filter(
      (key) => key !== "reminder_at" && key !== "reminder_intent",
    );
    if (reminderChanged && otherThanReminder.length === 0) {
      return {
        type: "reminder_set",
        payload: {
          reminder_at: next.reminder_at,
          reminder_intent: next.reminder_intent,
        },
      };
    }
    return { type: "updated", payload: { changed } };
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
    const completedRaw = this.readMeta("onboarding_completed_at");
    const raw = {
      timezone: this.readMeta("timezone") ?? DEFAULT_SETTINGS.timezone,
      user_display_name:
        this.readMeta("user_display_name") ?? DEFAULT_SETTINGS.user_display_name,
      user_initial: this.readMeta("user_initial") ?? DEFAULT_SETTINGS.user_initial,
      onboarding_completed_at:
        completedRaw && completedRaw.length > 0 ? completedRaw : null,
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
    const timezoneChanged =
      patch.timezone !== undefined && patch.timezone !== current.timezone;
    if (timezoneChanged) {
      // PR2: re-anchor date-only (23:59) dues in one transaction.
      this.runInWriteTx(() => {
        this.writeMeta("timezone", merged.timezone);
        this.reanchorDateOnlyDues(current.timezone, merged.timezone);
      });
    } else if (patch.timezone !== undefined) {
      this.writeMeta("timezone", merged.timezone);
    }
    if (patch.user_display_name !== undefined) {
      this.writeMeta("user_display_name", merged.user_display_name);
    }
    if (patch.user_initial !== undefined) {
      this.writeMeta("user_initial", merged.user_initial);
    }
    if (patch.onboarding_completed_at !== undefined) {
      this.writeMeta(
        "onboarding_completed_at",
        patch.onboarding_completed_at ?? "",
      );
    }
    return this.getSettings();
  }

  /**
   * Test / prepare-onboarding helper: empty profile + incomplete onboarding.
   * Bypasses UpdateSettingsSchema so the display name can be cleared.
   */
  prepareOnboardingProfile(): void {
    this.writeMeta("user_display_name", "");
    this.writeMeta("user_initial", "");
    this.writeMeta("onboarding_completed_at", "");
  }

  /** Count of work items (for empty vs preloaded onboarding variant). */
  countWorkItems(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM work_items`)
      .get() as { n: number };
    return row.n;
  }

  /**
   * Move every non-cancelled `due_at` at 23:59 in `oldTz` to 23:59 of the
   * same calendar day in `newTz`. Reminder times and real clock times stay.
   */
  private reanchorDateOnlyDues(oldTz: string, newTz: string): void {
    const rows = this.db
      .prepare(
        `SELECT id, due_at FROM work_items
         WHERE due_at IS NOT NULL AND status != 'cancelled'`,
      )
      .all() as Array<{ id: string; due_at: string }>;
    const update = this.db.prepare(
      `UPDATE work_items SET due_at = ?, updated_at = ? WHERE id = ?`,
    );
    const wall = nowIso();
    for (const row of rows) {
      if (!isDateOnlyInZone(row.due_at, oldTz)) continue;
      const p = toZoneParts(new Date(row.due_at), oldTz);
      const next = dateOnlyZoneIso(p.y, p.m, p.d, newTz);
      if (next === row.due_at) continue;
      update.run(next, wall, row.id);
      this.emitItemEvent(row.id, "updated", SYSTEM_ACTOR, {
        changed: ["due_at"],
        reason: "timezone_reanchor",
      });
    }
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
    return this.runInWriteTx(() => {
      this.items.upsert(item);
      this.emitItemEvent(item.id, "created", actor, {
        title: item.title,
        status: item.status,
        assignee_type: item.assignee_type,
        assignee_id: item.assignee_id,
      });
      return item;
    });
  }

  updateItem(
    id: string,
    input: UpdateItemInput,
    actor: Actor,
    opts?: ItemWriteOpts,
  ): WorkItem {
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
    const event = this.classifyUpdateEvent(current, next);
    return this.runInWriteTx(() => {
      this.writeItem(next, opts);
      this.emitItemEvent(next.id, event.type, actor, event.payload);
      return next;
    });
  }

  setStatus(
    id: string,
    input: SetStatusInput,
    actor: Actor,
    source: Source,
    opts?: ItemWriteOpts,
  ): WorkItem {
    const current = this.getItem(id);
    const next = applyStatusChange({ item: current, input, actor, source });
    return this.runInWriteTx(() => {
      this.writeItem(next, opts);
      this.emitItemEvent(next.id, "status_changed", actor, {
        from: current.status,
        to: next.status,
        blocked_reason: next.blocked_reason,
        needs_you_reason: next.needs_you_reason,
      });
      return next;
    });
  }

  complete(id: string, actor: Actor, source: Source): WorkItem {
    const current = this.getItem(id);
    const next = completeItem({ item: current, actor, source });
    return this.runInWriteTx(() => {
      this.items.upsert(next);
      this.emitItemEvent(next.id, "status_changed", actor, {
        from: current.status,
        to: next.status,
      });
      return next;
    });
  }

  reopen(id: string, actor: Actor): WorkItem {
    const current = this.getItem(id);
    const next = reopenItem({ item: current, actor });
    return this.runInWriteTx(() => {
      this.items.upsert(next);
      this.emitItemEvent(next.id, "status_changed", actor, {
        from: current.status,
        to: next.status,
      });
      return next;
    });
  }

  delegate(id: string, agentId: string, actor: Actor, source: Source): WorkItem {
    if (!this.agents.get(agentId)) {
      throw new ValidationError(`Unknown agent id: ${agentId}`);
    }
    const current = this.getItem(id);
    const next = delegateItem({
      item: current,
      agentId,
      actor,
      source,
    });
    return this.runInWriteTx(() => {
      this.items.upsert(next);
      this.emitItemEvent(next.id, "delegated", actor, {
        agent_id: agentId,
        from_assignee_type: current.assignee_type,
        from_assignee_id: current.assignee_id,
        status: next.status,
      });
      return next;
    });
  }

  askUser(id: string, reason: string, actor: Actor, source: Source): WorkItem {
    const current = this.getItem(id);
    const next = askUser({
      item: current,
      reason,
      actor,
      source,
    });
    return this.runInWriteTx(() => {
      this.items.upsert(next);
      this.emitItemEvent(next.id, "status_changed", actor, {
        from: current.status,
        to: next.status,
        needs_you_reason: next.needs_you_reason,
      });
      return next;
    });
  }

  /**
   * «Responder» — create a decision note, emit `answered`, and optionally
   * return a needs_you item to its agent (`status_changed` → assigned).
   * All writes share one transaction (D5).
   */
  answer(
    id: string,
    input: AnswerItemInput,
    actor: Actor,
    source: Source,
    opts?: ItemWriteOpts,
  ): AnswerResult {
    const text = input.text.trim();
    if (text.length < 1 || text.length > 4000) {
      throw new ValidationError("text must be 1..4000 characters");
    }
    const current = this.getItem(id);
    const returnTo = input.return_to ?? "agent";
    const shouldReturn =
      returnTo === "agent" &&
      current.status === "needs_you" &&
      current.assignee_type === "agent" &&
      Boolean(current.assignee_id);
    const at = new Date();
    const noteTitle = buildDecisionNoteTitle(
      current.title,
      input.locale ?? "en",
    );
    const note: Note = {
      id: createId("nte"),
      title: noteTitle,
      body_md: text,
      created_at: nowIso(at),
      updated_at: nowIso(at),
    };
    const next: WorkItem = shouldReturn
      ? returnToAgent(current, actor, source, at)
      : stampActor(current, actor, at);
    const excerpt =
      text.length > ANSWER_EXCERPT_MAX
        ? text.slice(0, ANSWER_EXCERPT_MAX)
        : text;
    return this.runInWriteTx(() => {
      this.notes.upsert(note);
      this.links.link({
        item_id: id,
        note_id: note.id,
        role: "decision",
      });
      this.writeItem(next, opts);
      this.emitItemEvent(id, "answered", actor, {
        note_id: note.id,
        text: excerpt,
      });
      if (shouldReturn) {
        this.emitItemEvent(id, "status_changed", actor, {
          from: current.status,
          to: next.status,
        });
      }
      return { item: next, note, seq: latestEventSeq(this.db) };
    });
  }

  /**
   * «Lo hago yo» — assign to the user and set in_progress, emitting `taken`.
   * Idempotent when already user + in_progress. 409 if done/cancelled.
   */
  take(
    id: string,
    actor: Actor,
    source: Source,
    opts?: ItemWriteOpts,
  ): TakeResult {
    const current = this.getItem(id);
    if (
      current.assignee_type === "user" &&
      current.assignee_id === USER_ACTOR_ID &&
      current.status === "in_progress"
    ) {
      if (
        opts?.if_updated_at !== undefined &&
        opts.if_updated_at !== current.updated_at
      ) {
        throw new ConflictError(
          `WorkItem ${id} was modified (expected updated_at=${opts.if_updated_at})`,
          {
            current_updated_at: current.updated_at,
            item: current,
          },
        );
      }
      return { item: current, seq: latestEventSeq(this.db) };
    }
    const next = takeItem({
      item: current,
      actor,
      source,
      userId: USER_ACTOR_ID,
    });
    return this.runInWriteTx(() => {
      this.writeItem(next, opts);
      this.emitItemEvent(id, "taken", actor, {
        from_assignee_type: current.assignee_type,
        from_assignee_id: current.assignee_id,
        to_assignee_type: next.assignee_type,
        to_assignee_id: next.assignee_id,
        from_status: current.status,
        to_status: next.status,
      });
      return { item: next, seq: latestEventSeq(this.db) };
    });
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
    return this.runInWriteTx(() => {
      this.links.link(link);
      this.emitItemEvent(itemId, "note_linked", SYSTEM_ACTOR, {
        note_id: noteId,
        role,
      });
      return link;
    });
  }

  unlinkNote(itemId: string, noteId: string): void {
    const item = this.items.get(itemId);
    this.runInWriteTx(() => {
      this.links.unlink(itemId, noteId);
      if (item) {
        this.emitItemEvent(itemId, "note_unlinked", SYSTEM_ACTOR, {
          note_id: noteId,
        });
      }
    });
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

  /** Context pack plus recent item events (oldest first) for agent handoff. */
  getContextWithEvents(
    itemId: string,
    eventLimit = 20,
  ): { context: ContextPack; markdown: string; events: ItemEvent[] } {
    const context = this.getContext(itemId);
    return {
      context,
      markdown: contextPackToMarkdown(context),
      events: listRecentItemEvents(this.db, itemId, eventLimit),
    };
  }

  latestSeq(): number {
    return latestEventSeq(this.db);
  }

  listEventsForItem(itemId: string, opts?: EventPageOptions): ItemEventsPage {
    this.getItem(itemId);
    const afterSeq = opts?.after_seq ?? 0;
    const limit = opts?.limit ?? 100;
    const { events, has_more } = listItemEvents(this.db, {
      itemId,
      afterSeq,
      limit,
    });
    const next_seq =
      events.length > 0 ? (events[events.length - 1]?.seq ?? afterSeq) : afterSeq;
    return { events, next_seq, has_more };
  }

  listChanges(opts?: EventPageOptions): ChangesPage {
    const afterSeq = opts?.after_seq ?? 0;
    const limit = opts?.limit ?? 100;
    const { events, has_more } = listItemEvents(this.db, { afterSeq, limit });
    const next_seq =
      events.length > 0 ? (events[events.length - 1]?.seq ?? afterSeq) : afterSeq;
    return { events, next_seq, has_more };
  }

  inboxQuery(
    view: InboxView,
    opts?: InboxQueryOptions,
  ): InboxQueryResult | InboxSyncResult {
    const now = opts?.now ?? new Date();
    const timeZone = this.getSettings().timezone;
    const seq = this.latestSeq();
    if (opts?.after_seq !== undefined) {
      const changedIds = itemIdsWithEventsAfter(this.db, opts.after_seq);
      const syncArgs: Parameters<typeof buildInboxSync>[0] = {
        items: this.listAllItems(),
        view,
        changedIds,
        now,
        timeZone,
      };
      const delta = buildInboxSync(syncArgs);
      const cursor = this.stampSyncCursor(now);
      delta.sync_cursor = cursor;
      delta.server_time = cursor;
      delta.seq = seq;
      return delta;
    }
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
      delta.seq = seq;
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
    snap.seq = seq;
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

  /**
   * Demo/seed helper: set `updated_at` explicitly while emitting an `updated`
   * event so `after_seq` sync stays consistent with `since=` (Attention order).
   */
  stampItemUpdatedAt(id: string, updatedAt: string, actor: Actor): WorkItem {
    const current = this.getItem(id);
    const next: WorkItem = {
      ...current,
      updated_at: updatedAt,
      last_actor_type: actor.type,
      last_actor_id: actor.id,
    };
    return this.runInWriteTx(() => {
      this.items.upsert(next);
      this.emitItemEvent(next.id, "updated", actor, {
        changed: ["updated_at"],
        reason: "demo_backdate",
      });
      return next;
    });
  }

  /** Test/seed helper */
  resetData(): void {
    this.runInWriteTx(() => {
      this.items.deleteAll();
      this.notes.deleteAll();
      this.db.prepare(`UPDATE event_seq SET next_seq = 1 WHERE id = 1`).run();
    });
  }
}
