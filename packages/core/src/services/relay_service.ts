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
import { openDatabase, type RelayDb } from "../store/db.js";
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
  }

  close(): void {
    this.db.close();
  }

  listAgents(): Agent[] {
    return this.agents.list();
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
      return this.items.listAll();
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
    return next;
  }

  setStatus(id: string, input: SetStatusInput, actor: Actor, source: Source): WorkItem {
    const current = this.getItem(id);
    const next = applyStatusChange({ item: current, input, actor, source });
    this.items.upsert(next);
    return next;
  }

  complete(id: string, actor: Actor, source: Source): WorkItem {
    const next = completeItem({ item: this.getItem(id), actor, source });
    this.items.upsert(next);
    return next;
  }

  reopen(id: string, actor: Actor): WorkItem {
    const next = reopenItem({ item: this.getItem(id), actor });
    this.items.upsert(next);
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
    const items = this.items.listAll();
    const now = opts?.now;
    if (opts?.since !== undefined) {
      const syncArgs: Parameters<typeof buildInboxSync>[0] = {
        items,
        view,
        since: opts.since,
      };
      if (now) syncArgs.now = now;
      return buildInboxSync(syncArgs);
    }
    const args: Parameters<typeof queryInbox>[0] = { items, view };
    if (now) args.now = now;
    if (opts?.limit !== undefined) args.limit = opts.limit;
    if (opts?.cursor !== undefined) args.cursor = opts.cursor;
    return queryInbox(args);
  }

  inboxRecommend(limit = 3, now?: Date): Recommendation[] {
    const args: Parameters<typeof recommendInbox>[0] = {
      items: this.items.listAll(),
      agents: this.agents.list(),
      limit,
    };
    if (now) args.now = now;
    return recommendInbox(args);
  }

  private searchDeps(now?: Date): SearchDeps {
    const items = this.items.listAll();
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
    const deps: SearchDeps = { db: this.db, items, notesById, linksByItem, linksByNote };
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
  }
}
