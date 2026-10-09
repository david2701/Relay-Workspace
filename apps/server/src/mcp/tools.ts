import {
  CreateItemInputSchema,
  CreateNoteInputSchema,
  InboxViewSchema,
  NoteRoleSchema,
  type RelayService,
  SearchQuerySchema,
  SetStatusInputSchema,
  UpdateItemInputSchema,
  UpdateNoteInputSchema,
  ValidationError,
} from "@relay/core";
import { z } from "zod";
import { MAX_AFTER_SEQ, parseEventPageQuery } from "../event_query.js";

const ActorParam = z.object({
  actor: z
    .object({
      id: z.string(),
      type: z.enum(["agent"]).optional(),
    })
    .optional(),
  actor_id: z.string().optional(),
});

const PageArgsSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

function actorOf(
  svc: RelayService,
  args: z.infer<typeof ActorParam>,
  headerActor?: string,
) {
  const raw: { type?: string; id?: string } = { type: "agent" };
  const id = args.actor?.id ?? args.actor_id ?? headerActor;
  if (id) raw.id = id;
  return svc.resolveActor(raw, "mcp");
}

export type McpToolDef = {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (args: unknown, headerActor?: string) => unknown;
};

export function createMcpTools(svc: RelayService): McpToolDef[] {
  return [
    {
      name: "agents_list",
      description:
        "List agents with last_seen_at, active presence, and assigned-item counts",
      inputSchema: z.object({}),
      handler: () => ({ agents: svc.listAgentSummaries() }),
    },
    {
      name: "agents_get",
      description:
        "Agent profile: presence, counts, current items, and paged handoffs",
      inputSchema: z.object({
        id: z.string(),
        after_seq: z.number().int().min(0).max(MAX_AFTER_SEQ).optional(),
        before_seq: z.number().int().min(0).max(MAX_AFTER_SEQ).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        current_items_limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: (raw) => {
        const record = (raw ?? {}) as Record<string, unknown>;
        const base = z.object({ id: z.string() }).safeParse(raw);
        if (!base.success) {
          throw new ValidationError("id is required");
        }
        const page = parseEventPageQuery({
          after_seq: record.after_seq as string | number | undefined,
          before_seq: record.before_seq as string | number | undefined,
          limit: record.limit as string | number | undefined,
        });
        const opts: {
          after_seq?: number;
          before_seq?: number;
          limit?: number;
          current_items_limit?: number;
        } = {};
        if (page.after_seq !== undefined) opts.after_seq = page.after_seq;
        if (page.before_seq !== undefined) opts.before_seq = page.before_seq;
        if (page.limit !== undefined) opts.limit = page.limit;
        if (record.current_items_limit !== undefined) {
          const currentPage = parseEventPageQuery({
            limit: record.current_items_limit as string | number | undefined,
          });
          if (currentPage.limit !== undefined) {
            opts.current_items_limit = currentPage.limit;
          }
        }
        return {
          agent: svc.getAgentProfile(
            base.data.id,
            Object.keys(opts).length > 0 ? opts : undefined,
          ),
        };
      },
    },
    {
      name: "items_list",
      description: "List work items (optional limit/cursor pagination)",
      inputSchema: PageArgsSchema,
      handler: (raw) => {
        const { limit, cursor } = PageArgsSchema.parse(raw ?? {});
        if (limit !== undefined) {
          const page = svc.listItems({
            limit,
            ...(cursor !== undefined ? { cursor } : {}),
          });
          return {
            items: page.items,
            next_cursor: page.meta.next_cursor,
            has_more: page.meta.has_more,
            total_count: page.meta.total_count,
          };
        }
        return { items: svc.listItems() };
      },
    },
    {
      name: "items_get",
      description: "Get a work item by id",
      inputSchema: z.object({ id: z.string() }),
      handler: (raw) => {
        const { id } = z.object({ id: z.string() }).parse(raw);
        return { item: svc.getItem(id) };
      },
    },
    {
      name: "items_create",
      description: "Create a work item (agent must identify via actor)",
      inputSchema: CreateItemInputSchema.and(ActorParam),
      handler: (raw, headerActor) => {
        const parsed = CreateItemInputSchema.and(ActorParam).parse(raw);
        const actor = actorOf(svc, parsed, headerActor);
        const item = svc.createItem(parsed, actor, "mcp");
        return { item };
      },
    },
    {
      name: "items_update",
      description: "Update work item fields",
      inputSchema: UpdateItemInputSchema.extend({ id: z.string() }).and(ActorParam),
      handler: (raw, headerActor) => {
        const parsed = UpdateItemInputSchema.extend({ id: z.string() })
          .and(ActorParam)
          .parse(raw);
        const actor = actorOf(svc, parsed, headerActor);
        const item = svc.updateItem(parsed.id, parsed, actor);
        return { item };
      },
    },
    {
      name: "items_set_status",
      description: "Set status; blocked/needs_you require reasons",
      inputSchema: SetStatusInputSchema.extend({ id: z.string() }).and(ActorParam),
      handler: (raw, headerActor) => {
        const parsed = SetStatusInputSchema.extend({ id: z.string() })
          .and(ActorParam)
          .parse(raw);
        const actor = actorOf(svc, parsed, headerActor);
        const item = svc.setStatus(parsed.id, parsed, actor, "mcp");
        return { item };
      },
    },
    {
      name: "items_complete",
      description: "Mark item done with actor stamp",
      inputSchema: z.object({ id: z.string() }).and(ActorParam),
      handler: (raw, headerActor) => {
        const parsed = z.object({ id: z.string() }).and(ActorParam).parse(raw);
        const actor = actorOf(svc, parsed, headerActor);
        return { item: svc.complete(parsed.id, actor, "mcp") };
      },
    },
    {
      name: "items_reopen",
      description: "Reopen a done/cancelled item",
      inputSchema: z.object({ id: z.string() }).and(ActorParam),
      handler: (raw, headerActor) => {
        const parsed = z.object({ id: z.string() }).and(ActorParam).parse(raw);
        const actor = actorOf(svc, parsed, headerActor);
        return { item: svc.reopen(parsed.id, actor) };
      },
    },
    {
      name: "items_delegate",
      description: "Assign to an agent and set status assigned",
      inputSchema: z
        .object({ id: z.string(), agent_id: z.string() })
        .and(ActorParam),
      handler: (raw, headerActor) => {
        const parsed = z
          .object({ id: z.string(), agent_id: z.string() })
          .and(ActorParam)
          .parse(raw);
        const actor = actorOf(svc, parsed, headerActor);
        return { item: svc.delegate(parsed.id, parsed.agent_id, actor, "mcp") };
      },
    },
    {
      name: "items_ask_user",
      description: "Set needs_you with reason; does not change assignee",
      inputSchema: z
        .object({ id: z.string(), reason: z.string().min(3) })
        .and(ActorParam),
      handler: (raw, headerActor) => {
        const parsed = z
          .object({ id: z.string(), reason: z.string().min(3) })
          .and(ActorParam)
          .parse(raw);
        const actor = actorOf(svc, parsed, headerActor);
        return { item: svc.askUser(parsed.id, parsed.reason, actor, "mcp") };
      },
    },
    {
      name: "notes_create",
      description: "Create a first-class note",
      inputSchema: CreateNoteInputSchema,
      handler: (raw) => ({ note: svc.createNote(CreateNoteInputSchema.parse(raw)) }),
    },
    {
      name: "notes_get",
      description: "Get a note by id",
      inputSchema: z.object({ id: z.string() }),
      handler: (raw) => {
        const { id } = z.object({ id: z.string() }).parse(raw);
        return { note: svc.getNote(id), links: svc.linksForNote(id) };
      },
    },
    {
      name: "notes_update",
      description: "Update a note (optional if_updated_at for optimistic concurrency)",
      inputSchema: UpdateNoteInputSchema.extend({
        id: z.string(),
        if_updated_at: z.string().optional(),
      }),
      handler: (raw) => {
        const parsed = UpdateNoteInputSchema.extend({
          id: z.string(),
          if_updated_at: z.string().optional(),
        }).parse(raw);
        const { id, if_updated_at, ...input } = parsed;
        return {
          note: svc.updateNote(
            id,
            input,
            if_updated_at !== undefined ? { if_updated_at } : undefined,
          ),
        };
      },
    },
    {
      name: "notes_list",
      description: "List notes (optional limit/cursor pagination)",
      inputSchema: PageArgsSchema,
      handler: (raw) => {
        const { limit, cursor } = PageArgsSchema.parse(raw ?? {});
        if (limit !== undefined) {
          const page = svc.listNotes({
            limit,
            ...(cursor !== undefined ? { cursor } : {}),
          });
          return {
            notes: page.items,
            next_cursor: page.meta.next_cursor,
            has_more: page.meta.has_more,
            total_count: page.meta.total_count,
          };
        }
        return { notes: svc.listNotes() };
      },
    },
    {
      name: "notes_search",
      description: "Search orphan (unlinked) notes by text query",
      inputSchema: z.object({
        q: z.string().min(1),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: (raw) => {
        const { q, limit } = z
          .object({
            q: z.string().min(1),
            limit: z.number().int().min(1).max(200).optional(),
          })
          .parse(raw);
        return svc.searchOrphanNotes(q, limit !== undefined ? { limit } : undefined);
      },
    },
    {
      name: "notes_link",
      description: "Link a note to an item with a role",
      inputSchema: z.object({
        item_id: z.string(),
        note_id: z.string(),
        role: NoteRoleSchema.default("context"),
      }),
      handler: (raw) => {
        const parsed = z
          .object({
            item_id: z.string(),
            note_id: z.string(),
            role: NoteRoleSchema.default("context"),
          })
          .parse(raw);
        return {
          link: svc.linkNote(parsed.item_id, parsed.note_id, parsed.role),
        };
      },
    },
    {
      name: "notes_unlink",
      description: "Unlink a note from an item",
      inputSchema: z.object({ item_id: z.string(), note_id: z.string() }),
      handler: (raw) => {
        const parsed = z
          .object({ item_id: z.string(), note_id: z.string() })
          .parse(raw);
        svc.unlinkNote(parsed.item_id, parsed.note_id);
        return { ok: true };
      },
    },
    {
      name: "context_get",
      description:
        "Context pack for an agent (goal, notes, reasons, reminder) plus recent item events",
      inputSchema: z.object({
        id: z.string(),
        event_limit: z.number().int().min(1).max(100).optional(),
      }),
      handler: (raw) => {
        const { id, event_limit } = z
          .object({
            id: z.string(),
            event_limit: z.number().int().min(1).max(100).optional(),
          })
          .parse(raw);
        return svc.getContextWithEvents(id, event_limit ?? 20);
      },
    },
    {
      name: "items_events",
      description:
        "Item event history (oldest first) for handoff / SSE resume; use after_seq + limit",
      inputSchema: z.object({
        id: z.string(),
        after_seq: z.number().int().min(0).max(MAX_AFTER_SEQ).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: (raw) => {
        const base = z.object({ id: z.string() }).safeParse(raw);
        if (!base.success) {
          throw new ValidationError("id is required");
        }
        const record = (raw ?? {}) as Record<string, unknown>;
        const page = parseEventPageQuery({
          after_seq: record.after_seq as string | number | undefined,
          before_seq: record.before_seq as string | number | undefined,
          limit: record.limit as string | number | undefined,
        });
        return svc.listEventsForItem(base.data.id, page);
      },
    },
    {
      name: "inbox_query",
      description:
        "Query an inbox view (optional limit/cursor pagination, after_seq or since sync)",
      inputSchema: z.object({
        view: InboxViewSchema.default("attention"),
        limit: z.number().int().min(1).max(200).optional(),
        cursor: z.string().optional(),
        since: z.string().optional(),
        after_seq: z.number().int().min(0).max(MAX_AFTER_SEQ).optional(),
      }),
      handler: (raw) => {
        const record = (raw ?? {}) as Record<string, unknown>;
        const viewParsed = InboxViewSchema.safeParse(
          record.view ?? "attention",
        );
        if (!viewParsed.success) {
          throw new ValidationError("view is invalid");
        }
        const page = parseEventPageQuery({
          after_seq: record.after_seq as string | number | undefined,
          before_seq: record.before_seq as string | number | undefined,
          limit: record.limit as string | number | undefined,
        });
        const opts: {
          limit?: number;
          cursor?: string;
          since?: string;
          after_seq?: number;
        } = {};
        if (page.limit !== undefined) opts.limit = page.limit;
        if (typeof record.cursor === "string") opts.cursor = record.cursor;
        if (page.after_seq !== undefined) opts.after_seq = page.after_seq;
        else if (typeof record.since === "string") opts.since = record.since;
        return Object.keys(opts).length > 0
          ? svc.inboxQuery(viewParsed.data, opts)
          : svc.inboxQuery(viewParsed.data);
      },
    },
    {
      name: "changes_list",
      description:
        "Global item_events page for sync/SSE replay ({ events, next_seq, has_more })",
      inputSchema: z.object({
        after_seq: z.number().int().min(0).max(MAX_AFTER_SEQ).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      handler: (raw) => {
        const record = (raw ?? {}) as Record<string, unknown>;
        const page = parseEventPageQuery({
          after_seq: record.after_seq as string | number | undefined,
          before_seq: record.before_seq as string | number | undefined,
          limit: record.limit as string | number | undefined,
        });
        return svc.listChanges(page);
      },
    },
    {
      name: "search",
      description:
        "Search work items (q, status, actor, due, from, to, view, label, limit, cursor)",
      inputSchema: SearchQuerySchema,
      handler: (raw) => svc.search(SearchQuerySchema.parse(raw ?? {})),
    },
    {
      name: "inbox_recommend",
      description: "Top N heuristic recommendations",
      inputSchema: z.object({ limit: z.number().int().min(1).max(10).default(3) }),
      handler: (raw) => {
        const { limit } = z
          .object({ limit: z.number().int().min(1).max(10).default(3) })
          .parse(raw);
        return { recommendations: svc.inboxRecommend(limit) };
      },
    },
  ];
}
