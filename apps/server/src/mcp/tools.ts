import {
  CreateItemInputSchema,
  CreateNoteInputSchema,
  InboxViewSchema,
  NoteRoleSchema,
  type RelayService,
  SetStatusInputSchema,
  UpdateItemInputSchema,
  UpdateNoteInputSchema,
} from "@relay/core";
import { z } from "zod";

const ActorParam = z.object({
  actor: z
    .object({
      id: z.string(),
      type: z.enum(["agent"]).optional(),
    })
    .optional(),
  actor_id: z.string().optional(),
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
      name: "items_list",
      description: "List all work items",
      inputSchema: z.object({}),
      handler: () => ({ items: svc.listItems() }),
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
      description: "Update a note",
      inputSchema: UpdateNoteInputSchema.extend({ id: z.string() }),
      handler: (raw) => {
        const parsed = UpdateNoteInputSchema.extend({ id: z.string() }).parse(raw);
        return { note: svc.updateNote(parsed.id, parsed) };
      },
    },
    {
      name: "notes_list",
      description: "List all notes",
      inputSchema: z.object({}),
      handler: () => ({ notes: svc.listNotes() }),
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
      description: "Context pack for an agent (goal, notes, reasons, reminder)",
      inputSchema: z.object({ id: z.string() }),
      handler: (raw) => {
        const { id } = z.object({ id: z.string() }).parse(raw);
        return {
          context: svc.getContext(id),
          markdown: svc.getContextMarkdown(id),
        };
      },
    },
    {
      name: "inbox_query",
      description: "Query an inbox view",
      inputSchema: z.object({ view: InboxViewSchema.default("attention") }),
      handler: (raw) => {
        const { view } = z
          .object({ view: InboxViewSchema.default("attention") })
          .parse(raw);
        return svc.inboxQuery(view);
      },
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
