import type { Agent } from "../schemas/agent.js";
import type { Recommendation } from "../schemas/inbox.js";
import type { WorkItem } from "../schemas/work_item.js";
import { hoursBetween, THRESHOLDS } from "./time.js";

function agentName(agents: readonly Agent[], id: string | null): string {
  if (!id) return "";
  return agents.find((a) => a.id === id)?.display_name ?? id;
}

/** Compact duration token for UI/MCP (`3 h`, `2 d`) — locale-neutral. */
function formatHours(hours: number): string {
  const h = Math.max(1, Math.round(hours));
  if (h < 48) return `${h} h`;
  const d = Math.round(h / 24);
  return `${d} d`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export type RecommendArgs = {
  items: readonly WorkItem[];
  agents: readonly Agent[];
  now?: Date;
  limit?: number;
};

export function recommendInbox(args: RecommendArgs): Recommendation[] {
  const now = args.now ?? new Date();
  const limit = args.limit ?? 3;
  const candidates: Recommendation[] = [];
  function push(
    item: WorkItem,
    partial: Omit<Recommendation, "item_id" | "title">,
  ) {
    candidates.push({
      item_id: item.id,
      title: item.title,
      ...partial,
    });
  }
  for (const item of args.items) {
    if (item.status === "done" || item.status === "cancelled") continue;
    if (item.status === "needs_you") {
      const waiting = hoursBetween(new Date(item.updated_at), now);
      if (waiting > THRESHOLDS.needsYouSuggestHours) {
        push(item, {
          kind: "needs_you_waiting",
          score: 100 + waiting,
          reason_code: "rec.needs_you_waiting",
          reason_params: { rel: formatHours(waiting) },
        });
      }
    }
    if (item.status === "blocked" && item.blocked_reason) {
      push(item, {
        kind: "blocked",
        score: 90,
        reason_code: "rec.blocked",
        reason_params: { reason: item.blocked_reason },
      });
    }
    if (item.due_at) {
      const due = new Date(item.due_at);
      const hours = hoursBetween(now, due);
      if (hours < 0) {
        const overdueHours = -hours;
        if (overdueHours < 24 && isSameLocalDay(due, now)) {
          push(item, {
            kind: "overdue",
            score: 95 + overdueHours,
            reason_code: "rec.overdue.today",
            reason_params: { time: formatTime(item.due_at) },
          });
        } else if (overdueHours < 48) {
          push(item, {
            kind: "overdue",
            score: 95 + overdueHours,
            reason_code: "rec.overdue.yesterday",
            reason_params: {},
          });
        } else {
          push(item, {
            kind: "overdue",
            score: 95 + overdueHours,
            reason_code: "rec.overdue.ago",
            reason_params: { rel: formatHours(overdueHours) },
          });
        }
      } else if (hours <= THRESHOLDS.dueSoonHours) {
        const sameDay = isSameLocalDay(due, now);
        push(item, {
          kind: "due_soon",
          score: 80 - hours,
          reason_code: sameDay ? "rec.due_soon.today" : "rec.due_soon.tomorrow",
          reason_params: { time: formatTime(item.due_at) },
        });
      }
    }
    if (item.reminder_at) {
      const rem = new Date(item.reminder_at);
      const hours = hoursBetween(now, rem);
      if (hours >= 0 && hours <= THRESHOLDS.reminderSoonHours) {
        const mins = Math.max(1, Math.round(hours * 60));
        const rel = mins < 60 ? `${mins} min` : `${Math.round(hours)} h`;
        const intent = item.reminder_intent?.trim();
        push(item, {
          kind: "reminder_soon",
          score: 85 - hours,
          reason_code: intent
            ? "rec.reminder_soon"
            : "rec.reminder_soon_no_intent",
          reason_params: intent ? { rel, intent } : { rel },
        });
      }
    }
    if (
      item.status === "in_progress" &&
      item.assignee_type === "agent" &&
      item.assignee_id
    ) {
      const stale = hoursBetween(new Date(item.updated_at), now);
      if (stale > THRESHOLDS.staleHours) {
        push(item, {
          kind: "stale_wip",
          score: 70 + stale,
          reason_code: "rec.stale_wip",
          reason_params: {
            agent: agentName(args.agents, item.assignee_id),
            rel: formatHours(stale),
          },
        });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: Recommendation[] = [];
  for (const c of candidates) {
    if (seen.has(c.item_id)) continue;
    seen.add(c.item_id);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}
