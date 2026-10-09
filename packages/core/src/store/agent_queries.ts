import type { AgentHandoff } from "../schemas/agent_summary.js";
import type { ItemEvent } from "../schemas/item_event.js";
import type { RelayDb } from "./db.js";

type EventRow = {
  id: string;
  seq: number;
  item_id: string;
  type: string;
  actor_kind: string;
  actor_id: string;
  payload: string;
  created_at: string;
  item_title: string;
};

function rowToHandoff(row: EventRow): AgentHandoff {
  return {
    id: row.id,
    seq: row.seq,
    item_id: row.item_id,
    type: row.type as ItemEvent["type"],
    actor_kind: row.actor_kind as ItemEvent["actor_kind"],
    actor_id: row.actor_id,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    created_at: row.created_at,
    item_title: row.item_title,
  };
}

/**
 * Latest `item_events.created_at` where this agent was the actor.
 * Mutating HTTP/MCP paths stamp the agent as actor; read-only tools do not.
 */
export function latestAgentEventAt(
  db: RelayDb,
  agentId: string,
): string | null {
  const row = db
    .prepare(
      `SELECT MAX(created_at) AS last_seen_at
       FROM item_events
       WHERE actor_kind = 'agent' AND actor_id = ?`,
    )
    .get(agentId) as { last_seen_at: string | null } | undefined;
  return row?.last_seen_at ?? null;
}

export type ListAgentHandoffsOpts = {
  agentId: string;
  afterSeq?: number;
  beforeSeq?: number;
  limit?: number;
};

/**
 * Handoff-relevant events for an agent, newest first.
 *
 * - `delegated` / `assigned` involving the agent
 * - `status_changed` by this agent to done / cancelled / needs_you / blocked
 * - `answered` / `taken` on items assigned to the agent (or acted by the agent)
 */
export function listAgentHandoffs(
  db: RelayDb,
  opts: ListAgentHandoffsOpts,
): { handoffs: AgentHandoff[]; has_more: boolean } {
  const limit = opts.limit ?? 50;
  const afterSeq = opts.afterSeq;
  const beforeSeq = opts.beforeSeq;
  const agentId = opts.agentId;
  const rows = db
    .prepare(
      `SELECT e.id, e.seq, e.item_id, e.type, e.actor_kind, e.actor_id,
              e.payload, e.created_at, w.title AS item_title
       FROM item_events e
       JOIN work_items w ON w.id = e.item_id
       WHERE (
           (
             e.type = 'delegated'
             AND (
               e.actor_id = ?
               OR json_extract(e.payload, '$.agent_id') = ?
             )
           )
           OR (
             e.type = 'assigned'
             AND (
               e.actor_id = ?
               OR json_extract(e.payload, '$.assignee_id') = ?
               OR json_extract(e.payload, '$.from_assignee_id') = ?
             )
           )
           OR (
             e.type = 'status_changed'
             AND e.actor_kind = 'agent'
             AND e.actor_id = ?
             AND json_extract(e.payload, '$.to') IN (
               'done', 'cancelled', 'needs_you', 'blocked'
             )
           )
           OR (
             e.type IN ('answered', 'taken')
             AND (
               e.actor_id = ?
               OR (w.assignee_type = 'agent' AND w.assignee_id = ?)
             )
           )
         )
         AND (? IS NULL OR e.seq > ?)
         AND (? IS NULL OR e.seq < ?)
       ORDER BY e.seq DESC
       LIMIT ?`,
    )
    .all(
      agentId,
      agentId,
      agentId,
      agentId,
      agentId,
      agentId,
      agentId,
      agentId,
      afterSeq ?? null,
      afterSeq ?? null,
      beforeSeq ?? null,
      beforeSeq ?? null,
      limit + 1,
    ) as EventRow[];
  const has_more = rows.length > limit;
  const page = has_more ? rows.slice(0, limit) : rows;
  return { handoffs: page.map(rowToHandoff), has_more };
}
