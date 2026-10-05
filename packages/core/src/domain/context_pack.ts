import type { Agent } from "../schemas/agent.js";
import type { ContextPack } from "../schemas/inbox.js";
import type { ItemNoteLink, Note } from "../schemas/note.js";
import type { WorkItem } from "../schemas/work_item.js";
import { USER_ACTOR_ID, USER_DISPLAY_NAME } from "../schemas/enums.js";

function previewBody(body: string, lines = 3): string {
  return body.split("\n").slice(0, lines).join("\n");
}

export type BuildContextArgs = {
  item: WorkItem;
  notes: readonly Note[];
  links: readonly ItemNoteLink[];
  agents: readonly Agent[];
};

export function buildContextPack(args: BuildContextArgs): ContextPack {
  const { item, notes, links, agents } = args;
  const noteById = new Map(notes.map((n) => [n.id, n]));
  const roleOrder = { decision: 0, context: 1, reference: 2 } as const;
  const linked = links
    .filter((l) => l.item_id === item.id)
    .map((l) => {
      const note = noteById.get(l.note_id);
      if (!note) return null;
      return {
        id: note.id,
        title: note.title,
        role: l.role,
        body_preview: previewBody(note.body_md),
        body_md: note.body_md,
        _order: roleOrder[l.role],
      };
    })
    .filter((n): n is NonNullable<typeof n> => n !== null)
    .sort((a, b) => a._order - b._order || a.title.localeCompare(b.title));
  let assigneeDisplay: string | null = null;
  if (item.assignee_type === "user") {
    assigneeDisplay = USER_DISPLAY_NAME;
  } else if (item.assignee_type === "agent" && item.assignee_id) {
    assigneeDisplay =
      agents.find((a) => a.id === item.assignee_id)?.display_name ??
      item.assignee_id;
  }
  return {
    item_id: item.id,
    title: item.title,
    goal: item.goal,
    status: item.status,
    blocked_reason: item.blocked_reason,
    needs_you_reason: item.needs_you_reason,
    assignee_type: item.assignee_type,
    assignee_id:
      item.assignee_type === "user" ? USER_ACTOR_ID : item.assignee_id,
    assignee_display_name: assigneeDisplay,
    due_at: item.due_at,
    reminder_at: item.reminder_at,
    reminder_intent: item.reminder_intent,
    notes: linked.map(({ id, title, role, body_preview, body_md }) => ({
      id,
      title,
      role,
      body_preview,
      body_md,
    })),
  };
}

export function contextPackToMarkdown(pack: ContextPack): string {
  const lines: string[] = [];
  lines.push(`# ${pack.title}`);
  lines.push("");
  lines.push(`## Objetivo`);
  lines.push(pack.goal?.trim() ? pack.goal : "Sin objetivo — el agente no sabrá cuándo ha terminado");
  lines.push("");
  lines.push(`## Estado`);
  const reason =
    pack.status === "blocked"
      ? pack.blocked_reason
      : pack.status === "needs_you"
        ? pack.needs_you_reason
        : null;
  lines.push(reason ? `${pack.status}: ${reason}` : pack.status);
  lines.push("");
  lines.push(`## Dueño`);
  lines.push(pack.assignee_display_name ?? "Sin dueño");
  lines.push("");
  lines.push(`## Para cuándo`);
  lines.push(pack.due_at ?? "—");
  lines.push("");
  lines.push(`## Recordatorio`);
  if (pack.reminder_at) {
    lines.push(
      pack.reminder_intent
        ? `${pack.reminder_at} · ${pack.reminder_intent}`
        : pack.reminder_at,
    );
  } else {
    lines.push("—");
  }
  lines.push("");
  lines.push(`## Notas`);
  if (pack.notes.length === 0) {
    lines.push("(ninguna)");
  } else {
    for (const note of pack.notes) {
      lines.push(`### [${note.role}] ${note.title}`);
      lines.push(note.body_md || "(vacía)");
      lines.push("");
    }
  }
  return lines.join("\n");
}
