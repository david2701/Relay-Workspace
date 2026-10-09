# Agents API (Team / Equipo)

Catalog of agents plus presence, assigned-item counts, current work, and
handoff history for the native Team screens and web.

Base fields (`id`, `display_name`, `monogram`) are unchanged so existing
`GET /api/agents` consumers stay compatible.

## Presence

| Field | Source |
| --- | --- |
| `last_seen_at` | `MAX(item_events.created_at)` where `actor_kind = 'agent'` and `actor_id` is the agent. Every mutating HTTP/MCP path that stamps the agent as actor updates this. Read-only tools (e.g. `items_list`) do **not**. |
| `active` | `true` when `last_seen_at` is within **`AGENT_ACTIVE_MINUTES` (15)** of wall clock. Constant: `packages/core/src/domain/agent_presence.ts`. |

There is no separate online/connected socket signal in the store; presence is
derived only from the event log.

## Counts

`counts` buckets items with `assignee_type = agent` and `assignee_id = <agent>`:

| Key | Rule |
| --- | --- |
| `needs_you` | `status = needs_you` |
| `blocked` | `status = blocked` |
| `in_progress` | `status = in_progress` |
| `assigned` | `status = assigned` |
| `done` | `status = done` and `completed_at` within the last **7** days (`AGENT_DONE_COUNT_DAYS`) |

`cancelled` / `inbox` are not counted.

## Endpoints

### `GET /api/agents`

```json
{
  "agents": [
    {
      "id": "agent-code",
      "display_name": "Code agent",
      "monogram": "CO",
      "last_seen_at": "2026-10-09T12:00:00.000Z",
      "active": true,
      "counts": {
        "needs_you": 1,
        "blocked": 0,
        "in_progress": 1,
        "assigned": 0,
        "done": 0
      }
    }
  ]
}
```

### `GET /api/agents/:id`

Profile for one agent. Unknown id → `404`.

Query (shared validation via `parseEventPageQuery` — same rules as
[`docs/api/events.md`](./events.md)):

| Param | Default | Notes |
| --- | --- | --- |
| `limit` | 50 (max 200) | Handoffs page size. Invalid (`0`, negative, non-numeric, `>200`) → **400** `validation_error`. |
| `after_seq` | — | Only handoffs with `seq > after_seq`. Safe integer `0 … Number.MAX_SAFE_INTEGER`; invalid → **400**. |
| `before_seq` | — | Only handoffs with `seq < before_seq` (load older). Same integer rules as `after_seq`. |
| `current_items_limit` | 10 (max 200) | Open items on the profile (same `1…200` limit rules). |

```json
{
  "agent": {
    "id": "agent-code",
    "display_name": "Code agent",
    "monogram": "CO",
    "last_seen_at": "2026-10-09T12:00:00.000Z",
    "active": true,
    "counts": { "needs_you": 1, "blocked": 0, "in_progress": 1, "assigned": 0, "done": 0 },
    "current_items": [ /* WorkItem[], status priority: needs_you → blocked → in_progress → assigned */ ],
    "handoffs": [
      {
        "id": "evt_…",
        "seq": 12,
        "item_id": "itm_…",
        "type": "status_changed",
        "actor_kind": "agent",
        "actor_id": "agent-code",
        "payload": { "from": "assigned", "to": "needs_you", "needs_you_reason": "…" },
        "created_at": "2026-10-09T12:00:00.000Z",
        "item_title": "Choose the launch post headline"
      }
    ],
    "handoffs_next_seq": 12,
    "handoffs_has_more": false
  }
}
```

### Handoffs

Newest-first page of `item_events` where the agent is involved:

| Type | Included when |
| --- | --- |
| `delegated` | `actor_id` = agent or `payload.agent_id` = agent |
| `assigned` | agent is actor / `assignee_id` / `from_assignee_id` |
| `status_changed` | actor is this agent and `payload.to` ∈ `done`, `cancelled`, `needs_you`, `blocked` (payload includes `from` / `to`) |
| `answered` / `taken` | reserved (PR 1b); included when `actor_id` = agent **or** the item is currently assigned to the agent |

Each row includes `item_title`. Profile fields:

- `handoffs` — the event array (not nested), **newest first**
- `handoffs_next_seq` — same semantics as item `next_seq` in
  [`docs/api/events.md`](./events.md): the last `seq` **in this page** of this
  agent’s handoffs. Because the page is newest-first, that is the oldest seq in
  the page — pass it as the next `before_seq` to continue toward older handoffs.
  When the page is empty, `handoffs_next_seq` equals the request `before_seq` or
  `after_seq` (default `0`).
- `handoffs_has_more` — more older (or filtered) rows exist

User-only field updates (`updated`, `reminder_set`, …) and agent `status_changed` to `in_progress` / `assigned` are **not** handoffs.

## MCP

| Tool | Role |
| --- | --- |
| `agents_list` | Same as `GET /api/agents`. |
| `agents_get` | Same as `GET /api/agents/:id` (`id`, optional paging fields). |

## Missing vs Team designs

| Design signal | API |
| --- | --- |
| Connected / online / “N agentes conectados” | **missing** (use `active` + `last_seen_at` only) |
| Role line (“Lectura y escritura”) | **missing** (not in catalog) |
| Relative “3 h” / “ahora” labels | Client formats `last_seen_at` or handoff `created_at` |
| Yellow unread badge “1” | Client derives from `counts.needs_you` (or inbox) |
| Status chip icons (clock / minus) | Client maps from `counts` / `current_items[0].status` |
| Due / reminder row times on the card | From `current_items[].due_at` / `reminder_at` |
| “Te lo pasó” / needs-you handoff | `handoffs[]` with `type=status_changed`, `payload.to=needs_you` (actor = agent) |
| “Completado por…” | `handoffs[]` with `type=status_changed`, `payload.to=done` (actor = agent) |
| Handoff RD→É chip | Client maps `type` + `actor_*` / assignee payload |
| Keyboard shortcuts strip | **missing** (UI-only) |
