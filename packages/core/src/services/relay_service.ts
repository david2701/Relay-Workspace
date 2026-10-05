import {
  buildContextPack,
  contextPackToMarkdown,
} from "../domain/context_pack.js";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import { queryInbox } from "../domain/inbox_query.js";
import { recommendInbox } from "../domain/recommend.js";
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
  Recommendation,
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

  listItems(): WorkItem[] {
    return this.items.listAll();
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

  listNotes(): Note[] {
    return this.notes.listAll();
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

  updateNote(id: string, input: UpdateNoteInput): Note {
    const current = this.getNote(id);
    const note: Note = {
      ...current,
      title: input.title?.trim() ?? current.title,
      body_md: input.body_md ?? current.body_md,
      updated_at: nowIso(),
    };
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

  inboxQuery(view: InboxView, now?: Date): InboxQueryResult {
    const args: Parameters<typeof queryInbox>[0] = {
      items: this.items.listAll(),
      view,
    };
    if (now) args.now = now;
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

  /** Test/seed helper */
  resetData(): void {
    this.items.deleteAll();
    this.notes.deleteAll();
  }
}
