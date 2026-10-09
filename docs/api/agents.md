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

Query:

| Param | Default | Notes |
| --- | --- | --- |
| `limit` | 50 (max 200) | Handoffs page size |
| `after_seq` | — | Only handoffs with `seq > after_seq` |
| `before_seq` | — | Only handoffs with `seq < before_seq` (load older) |
| `current_items_limit` | 10 (max 200) | Open items on the profile |

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
    "handoffs": {
      "handoffs": [
        {
          "id": "evt_…",
          "seq": 12,
          "item_id": "itm_…",
          "type": "delegated",
          "actor_kind": "user",
          "actor_id": "user",
          "payload": { "agent_id": "agent-code" },
          "created_at": "2026-10-09T12:00:00.000Z",
          "item_title": "Prepare demo"
        }
      ],
      "next_seq": 12,
      "has_more": false
    }
  }
}
```

### Handoffs

Newest-first page of `item_events` where the agent:

- **delegated** — `type = delegated` and (`actor_id` = agent or `payload.agent_id` = agent), or
- **was assigned** — `type = assigned` and the agent is actor / `assignee_id` / `from_assignee_id`, or
- **answered** / **took** — reserved types (`answered`, `taken`); included when `actor_id` = agent (PR 1b).

Each row includes `item_title`. `next_seq` is the oldest `seq` in the page
(pass as `before_seq` for the next older page). `has_more` is true when more
older (or filtered) rows exist.

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
| Handoff UI copy (“te lo pasó”, “Completado por…”) | Client maps `handoffs[].type` + actors; completed/`status_changed` history is **not** in this handoff filter |
