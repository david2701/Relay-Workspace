import { ActorMark, isStaleWorking, isWorking } from "./ActorMark";
import { StatusGlyph } from "./StatusGlyph";
import { copy } from "../lib/copy";
import { formatDue, formatRelative } from "../lib/format";
import type { Agent, WorkItem } from "../lib/types";
import "./ItemRow.css";

type Props = {
  item: WorkItem;
  agents: Agent[];
  selected: boolean;
  flash?: boolean;
  showChatBadge?: boolean;
  onSelect: () => void;
};

function witnessActor(item: WorkItem, agents: Agent[]) {
  if (item.status === "needs_you") {
    return { kind: "user" as const, name: "David", monogram: "D" };
  }
  if (item.assignee_type === "user") {
    return { kind: "user" as const, name: "David", monogram: "D" };
  }
  if (item.assignee_type === "agent" && item.assignee_id) {
    const a = agents.find((x) => x.id === item.assignee_id);
    return {
      kind: "agent" as const,
      name: a?.display_name ?? item.assignee_id,
      monogram: a?.monogram ?? "??",
    };
  }
  return { kind: "unassigned" as const, name: "Sin asignar", monogram: "" };
}

export function ItemRow({
  item,
  agents,
  selected,
  flash,
  showChatBadge,
  onSelect,
}: Props) {
  const witness = witnessActor(item, agents);
  const working = isWorking(item.status, item.assignee_type, item.updated_at);
  const stale = isStaleWorking(item.status, item.assignee_type, item.updated_at);
  const reasonLine =
    item.status === "needs_you" && item.needs_you_reason
      ? `${agents.find((a) => a.id === item.last_actor_id)?.display_name ?? "Agente"}: ${item.needs_you_reason}`
      : item.status === "blocked" && item.blocked_reason
        ? `Atascado: ${item.blocked_reason}`
        : null;
  const due = item.due_at ? formatDue(item.due_at) : null;
  const reminder =
    item.reminder_at && item.status !== "done" && item.status !== "cancelled"
      ? {
          time: formatDue(item.reminder_at).text.replace(/^Hoy /, "").replace(/^Mañana /, "Mañ "),
          intent: item.reminder_intent,
        }
      : null;

  const aria = [
    item.title,
    copy.statusLabel[item.status],
    reasonLine,
    witness.name,
    due?.text,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <div
      role="option"
      id={`row-${item.id}`}
      aria-selected={selected}
      aria-label={aria}
      className={[
        "item-row",
        selected ? "selected" : "",
        flash ? "flash" : "",
        item.status === "needs_you" ? "needs-you" : "",
        item.status === "done" || item.status === "cancelled" ? "terminal" : "",
        item.status === "cancelled" ? "cancelled" : "",
        reasonLine ? "with-reason" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onSelect}
      tabIndex={-1}
    >
      <span className="testigo-rule" aria-hidden />
      <StatusGlyph status={item.status} label={copy.statusLabel[item.status]} />
      <div className="item-main">
        <div className="item-title-line">
          <span className="item-title">{item.title}</span>
          {showChatBadge && item.source === "mcp" ? (
            <span className="chat-badge mono" title="Creado desde el chat">
              chat
            </span>
          ) : null}
        </div>
        {reasonLine ? <div className="item-reason">{reasonLine}</div> : null}
      </div>
      <div className="item-meta">
        {due && item.status !== "done" && item.status !== "cancelled" ? (
          <span className={`due-chip mono tone-${due.tone}`}>{due.text}</span>
        ) : null}
        {reminder ? (
          <span
            className="reminder-chip"
            title={reminder.intent ?? undefined}
          >
            <span className="mono">{reminder.time}</span>
            {reminder.intent ? (
              <span className="intent">
                {" "}
                · {reminder.intent.slice(0, 24)}
                {reminder.intent.length > 24 ? "…" : ""}
              </span>
            ) : null}
          </span>
        ) : null}
        {item.priority === "high" ? (
          <span className="prio" aria-label="Prioridad alta">
            ▲
          </span>
        ) : item.priority === "medium" ? (
          <span className="prio hollow" aria-label="Prioridad media">
            △
          </span>
        ) : null}
        <ActorMark
          kind={witness.kind}
          name={witness.name}
          monogram={witness.monogram}
          size={20}
          working={working || stale}
          stale={stale}
        />
        <span className="rel mono">{formatRelative(item.updated_at)}</span>
      </div>
    </div>
  );
}
