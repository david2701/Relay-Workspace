import { Bell } from "@phosphor-icons/react";
import { memo } from "react";
import { useActorLabels } from "../hooks/useActorLabels";
import { useT } from "../i18n/I18nProvider";
import { markForCompleter, markForWitness } from "../lib/actor_mark";
import { statusLabel } from "../lib/copy";
import {
  formatAbsolute,
  formatDue,
  formatDueForGroup,
  formatRelative,
  formatReminder,
  formatRowAccessibleDate,
} from "../lib/format";
import { terminalByKeys } from "../lib/terminal_by_label";
import type { Agent, SearchMatch, Status, WorkItem } from "../lib/types";
import { ActorMark, isStaleWorking, isWorking } from "./ActorMark";
import { MatchSnippet } from "./MatchSnippet";
import { StatusGlyph } from "./StatusGlyph";
import "./ItemRow.css";

function truncateIntent(intent: string | null | undefined): string | null {
  if (!intent) return null;
  const text = intent.trim();
  if (text.length <= 24) return text;
  const slice = text.slice(0, 24);
  const sp = slice.lastIndexOf(" ");
  const cut = sp >= 4 ? slice.slice(0, sp) : slice;
  return `${cut}…`;
}

type Props = {
  item: WorkItem;
  agents: Agent[];
  selected: boolean;
  flash?: boolean;
  showChatBadge?: boolean;
  showCompletedBy?: boolean;
  dueGroupKey?: string | undefined;
  match?: SearchMatch | undefined;
  onSelect: (id: string) => void;
};

export const ItemRow = memo(function ItemRow({
  item,
  agents,
  selected,
  flash,
  showChatBadge,
  showCompletedBy,
  dueGroupKey,
  match,
  onSelect,
}: Props) {
  const t = useT();
  const actorLabels = useActorLabels();
  const witness = markForWitness(item, agents, actorLabels);
  const working = isWorking(item.status, item.assignee_type, item.updated_at);
  const stale = isStaleWorking(item.status, item.assignee_type, item.updated_at);
  const sl = (s: Status) => statusLabel(t, s);
  const reasonLine =
    item.status === "needs_you" && item.needs_you_reason
      ? `${agents.find((a) => a.id === item.last_actor_id)?.display_name ?? actorLabels.agentFallback}: ${item.needs_you_reason}`
      : item.status === "blocked" && item.blocked_reason
        ? `${t("item.blockedPrefix")}${item.blocked_reason}`
        : null;
  const reminderRaw =
    item.reminder_at && item.status !== "done" && item.status !== "cancelled"
      ? {
          iso: item.reminder_at,
          time: formatReminder(item.reminder_at).text,
          intent: item.reminder_intent,
          past: new Date(item.reminder_at).getTime() < Date.now(),
        }
      : null;
  let due: { text: string; tone: "muted" | "warn" | "crit"; iso: string } | null =
    null;
  if (item.due_at && item.status !== "done" && item.status !== "cancelled") {
    if (!dueGroupKey) {
      const f = formatDue(item.due_at);
      due = { ...f, iso: item.due_at };
    } else if (!reminderRaw && dueGroupKey !== "none") {
      const f = formatDueForGroup(item.due_at, dueGroupKey);
      due = { ...f, iso: item.due_at };
    }
  }
  const reminder = reminderRaw
    ? {
        ...reminderRaw,
        intent: due?.text ? null : truncateIntent(reminderRaw.intent),
      }
    : null;

  const dueAria = due
    ? due.tone === "crit"
      ? due.text
      : t("row.due.label", {
          date: formatRowAccessibleDate(due.iso),
        })
    : null;
  const reminderAria = reminder
    ? reminder.past
      ? reminder.time
      : t("row.reminder.label", {
          date: formatRowAccessibleDate(reminder.iso),
        })
    : null;

  const showSnippet = match && match.field !== "title";
  // §1.15 order: title · status · reason · actor · due · reminder
  const aria = [
    item.title,
    sl(item.status),
    reasonLine,
    showSnippet ? match.snippet : null,
    witness.name,
    dueAria,
    reminderAria,
  ]
    .filter(Boolean)
    .join(". ");

  const reminderTitle = reminder
    ? [
        formatAbsolute(reminder.iso),
        reminder.intent ??
          (reminderRaw?.intent ? reminderRaw.intent.trim() : null),
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div
      role="option"
      id={`row-${item.id}`}
      aria-selected={selected}
      aria-label={aria}
      title={item.title}
      className={[
        "item-row",
        selected ? "selected" : "",
        flash ? "flash" : "",
        item.status === "needs_you" ? "needs-you" : "",
        item.status === "done" || item.status === "cancelled" ? "terminal" : "",
        item.status === "cancelled" ? "cancelled" : "",
        reasonLine ? "with-reason" : "",
        showSnippet ? "with-snippet" : "",
        due || reminder ? "with-times" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onSelect(item.id)}
      tabIndex={-1}
    >
      <span className="testigo-rule" aria-hidden />
      <StatusGlyph status={item.status} label={sl(item.status)} />
      <div className="item-main">
        <div className="item-title-line">
          <span className="item-title">{item.title}</span>
          {showChatBadge && item.source === "mcp" ? (
            <span className="chat-badge mono" title={t("item.chatBadge")}>
              chat
            </span>
          ) : null}
        </div>
        {reasonLine ? <div className="item-reason">{reasonLine}</div> : null}
        {showSnippet ? <MatchSnippet match={match} /> : null}
        {showCompletedBy &&
        (item.status === "done" || item.status === "cancelled") ? (
          <div className="item-reason completed-by-line">
            {(() => {
              const completer = markForCompleter(item, agents, actorLabels);
              if (!completer) return null;
              const rel = formatRelative(
                item.completed_at ?? item.updated_at,
              );
              const keys = terminalByKeys(item);
              const label =
                completer.kind === "user"
                  ? t(keys.byYou, { time: rel })
                  : t(keys.byName, { name: completer.name, time: rel });
              return (
                <>
                  <ActorMark
                    kind={completer.kind}
                    name={completer.name}
                    monogram={completer.monogram}
                    size={16}
                  />
                  <span>{label}</span>
                </>
              );
            })()}
          </div>
        ) : null}
      </div>
      <div className="item-meta">
        {due?.text &&
        item.status !== "done" &&
        item.status !== "cancelled" ? (
          <span
            className={`due-chip mono tone-${due.tone}`}
            title={formatAbsolute(due.iso)}
          >
            {due.text}
          </span>
        ) : null}
        {reminder ? (
          <span
            className="reminder-chip"
            title={reminderTitle || reminder.time}
            aria-label={reminderAria ?? undefined}
          >
            <Bell
              className="reminder-bell"
              size={12}
              weight="regular"
              aria-hidden="true"
            />
            <span className="reminder-text mono">{reminder.time}</span>
            {reminder.intent ? (
              <span className="intent"> · {reminder.intent}</span>
            ) : null}
          </span>
        ) : null}
        {item.priority === "high" ? (
          <span className="prio" aria-label={t("item.priorityHigh")}>
            ▲
          </span>
        ) : item.priority === "medium" ? (
          <span className="prio hollow" aria-label={t("item.priorityMedium")}>
            △
          </span>
        ) : null}
        <span className="item-mark">
          <ActorMark
            kind={witness.kind}
            name={witness.name}
            monogram={witness.monogram}
            size={20}
            working={working || stale}
            stale={stale}
          />
        </span>
        <span className="rel mono">{formatRelative(item.updated_at)}</span>
      </div>
    </div>
  );
});
