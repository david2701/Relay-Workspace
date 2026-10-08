import type { Agent } from "../schemas/agent.js";
import type { Recommendation } from "../schemas/inbox.js";
import type { WorkItem } from "../schemas/work_item.js";
import { hoursBetween, THRESHOLDS } from "./time.js";

function agentName(agents: readonly Agent[], id: string | null): string {
  if (!id) return "el agente";
  return agents.find((a) => a.id === id)?.display_name ?? id;
}

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
          reason: `Te espera desde hace ${formatHours(waiting)}`,
        });
      }
    }
    if (item.status === "blocked" && item.blocked_reason) {
      push(item, {
        kind: "blocked",
        score: 90,
        reason: `Atascado: ${item.blocked_reason}`,
      });
    }
    if (item.due_at) {
      const due = new Date(item.due_at);
      const hours = hoursBetween(now, due);
      if (hours < 0) {
        const overdueHours = -hours;
        const dayLabel =
          overdueHours < 24 && isSameLocalDay(due, now)
            ? `hoy a las ${formatTime(item.due_at)}`
            : overdueHours < 48
              ? "ayer"
              : `hace ${formatHours(overdueHours)}`;
        push(item, {
          kind: "overdue",
          score: 95 + overdueHours,
          reason: `Venció ${dayLabel}`,
        });
      } else if (hours <= THRESHOLDS.dueSoonHours) {
        const when = isSameLocalDay(due, now) ? "hoy" : "mañana";
        push(item, {
          kind: "due_soon",
          score: 80 - hours,
          reason: `Vence ${when} a las ${formatTime(item.due_at)}`,
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
          reason: intent
            ? `Aviso en ${rel}: ${intent}`
            : `Aviso en ${rel}`,
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
          reason: `Sin avances de ${agentName(args.agents, item.assignee_id)} desde hace ${formatHours(stale)}`,
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
