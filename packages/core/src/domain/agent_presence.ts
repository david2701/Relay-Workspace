import type { Agent } from "../schemas/agent.js";
import type { AgentCounts, AgentSummary } from "../schemas/agent_summary.js";
import type { Status } from "../schemas/enums.js";
import type { WorkItem } from "../schemas/work_item.js";

/**
 * Presence window for `active`: an agent is active when its latest mutating
 * action (`item_events` row with `actor_kind=agent` and matching `actor_id`)
 * is within this many minutes. Read-only MCP calls do not update presence.
 */
export const AGENT_ACTIVE_MINUTES = 15;

/** Rolling window for the `counts.done` bucket. */
export const AGENT_DONE_COUNT_DAYS = 7;

/** Default number of open items on the agent profile. */
export const DEFAULT_CURRENT_ITEMS_LIMIT = 10;

/** Default page size for agent handoffs. */
export const DEFAULT_HANDOFFS_LIMIT = 50;

const EMPTY_COUNTS: AgentCounts = {
  needs_you: 0,
  blocked: 0,
  in_progress: 0,
  assigned: 0,
  done: 0,
};

/** Status priority for profile `current_items` (lower = higher priority). */
const CURRENT_STATUS_RANK: Partial<Record<Status, number>> = {
  needs_you: 0,
  blocked: 1,
  in_progress: 2,
  assigned: 3,
};

export function emptyAgentCounts(): AgentCounts {
  return { ...EMPTY_COUNTS };
}

export function isAgentActive(
  lastSeenAt: string | null,
  now: Date = new Date(),
  activeMinutes: number = AGENT_ACTIVE_MINUTES,
): boolean {
  if (lastSeenAt === null) return false;
  const seenMs = Date.parse(lastSeenAt);
  if (Number.isNaN(seenMs)) return false;
  return now.getTime() - seenMs <= activeMinutes * 60_000;
}

export function doneCountCutoffIso(
  now: Date = new Date(),
  days: number = AGENT_DONE_COUNT_DAYS,
): string {
  return new Date(now.getTime() - days * 24 * 60 * 60_000).toISOString();
}

export function buildAgentSummary(input: {
  agent: Agent;
  last_seen_at: string | null;
  counts: AgentCounts;
  now?: Date;
}): AgentSummary {
  const now = input.now ?? new Date();
  return {
    ...input.agent,
    last_seen_at: input.last_seen_at,
    active: isAgentActive(input.last_seen_at, now),
    counts: input.counts,
  };
}

/**
 * Open items assigned to the agent, ordered by status priority then oldest
 * `updated_at` first (matches Atención: needs_you / blocked urgency).
 */
export function selectCurrentItems(
  items: readonly WorkItem[],
  agentId: string,
  limit: number = DEFAULT_CURRENT_ITEMS_LIMIT,
): WorkItem[] {
  return items
    .filter(
      (item) =>
        item.assignee_type === "agent" &&
        item.assignee_id === agentId &&
        CURRENT_STATUS_RANK[item.status] !== undefined,
    )
    .sort((a, b) => {
      const rankA = CURRENT_STATUS_RANK[a.status] ?? 99;
      const rankB = CURRENT_STATUS_RANK[b.status] ?? 99;
      if (rankA !== rankB) return rankA - rankB;
      return a.updated_at.localeCompare(b.updated_at);
    })
    .slice(0, limit);
}

/** Count assigned items into the five Team buckets. */
export function countAssignedByStatus(
  items: readonly WorkItem[],
  agentId: string,
  now: Date = new Date(),
): AgentCounts {
  const cutoff = doneCountCutoffIso(now);
  const counts = emptyAgentCounts();
  for (const item of items) {
    if (item.assignee_type !== "agent" || item.assignee_id !== agentId) {
      continue;
    }
    if (item.status === "needs_you") counts.needs_you += 1;
    else if (item.status === "blocked") counts.blocked += 1;
    else if (item.status === "in_progress") counts.in_progress += 1;
    else if (item.status === "assigned") counts.assigned += 1;
    else if (
      item.status === "done" &&
      item.completed_at !== null &&
      item.completed_at >= cutoff
    ) {
      counts.done += 1;
    }
  }
  return counts;
}
