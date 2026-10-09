# Item events API

Global monotonic event log for work-item mutations. Foundation for SSE (`seq` /
`Last-Event-ID`), mobile sync, and handoff history.

## Event shape

```json
{
  "id": "evt_a1b2c3d4e5",
  "seq": 12,
  "item_id": "itm_xxxxxxxx",
  "type": "status_changed",
  "actor_kind": "agent",
  "actor_id": "grok-bot",
  "payload": { "from": "assigned", "to": "needs_you" },
  "created_at": "2026-10-09T12:00:00.000Z"
}
```

| Field | Notes |
| --- | --- |
| `seq` | Global, unique, gap-free under successful commits. Assigned in the same SQLite transaction as the write. |
| `type` | See list below. |
| `payload` | JSON object; shape depends on `type`. |
| `actor_kind` / `actor_id` | Who caused the mutation (`user` / `agent` / `system`). |

### Types

| Type | When | Payload (typical) |
| --- | --- | --- |
| `created` | `createItem` | `title`, `status`, `assignee_*` |
| `updated` | field patch, timezone re-anchor, or demo Attention backdate | `changed: string[]` (`reason` when applicable) |
| `status_changed` | `setStatus` / `complete` / `reopen` / `askUser` | `from`, `to`, reasons |
| `assigned` | update that only changes assignee to user/unassigned | `assignee_*`, previous assignee |
| `delegated` | `delegate` or update assignee → agent | `agent_id`, previous assignee |
| `note_linked` / `note_unlinked` | link/unlink | `note_id`, `role` (link) |
| `reminder_set` | update that only changes reminder fields | `reminder_at`, `reminder_intent` |
| `answered` | **reserved** (PR 1b — «Responder») | — |
| `taken` | **reserved** | — |

Every mutating HTTP/MCP path that touches an item emits exactly one event in the
same transaction. A rolled-back write leaves no event.

Demo seed backdates one item’s `updated_at` for Attention ordering via
`RelayService.stampItemUpdatedAt`, which emits `updated` with
`payload.reason = "demo_backdate"` so `after_seq` and `since=` stay aligned.

## Query parameters

Shared by `/api/changes`, `/api/items/:id/events`, and inbox `after_seq` / `limit`:

| Param | Rules |
| --- | --- |
| `after_seq` | Optional. Safe integer `0 … Number.MAX_SAFE_INTEGER`. Invalid → **400** `{ "error": "validation_error", "message": "…" }`. |
| `limit` | Optional. Integer `1 … 200`. Invalid (`0`, negative, non-numeric, `>200`) → **400** same shape. |

## Endpoints

### `GET /api/items/:id/events?after_seq=&limit=`

History for one item, **oldest first**.

```json
{
  "events": [ /* ItemEvent[] for this item only */ ],
  "next_seq": 233,
  "has_more": false
}
```

- **`next_seq`**: last `seq` in **this page of this item’s** events (not the global
  watermark). Pass it as the next `after_seq` to continue **this item’s** history.
  When the page is empty, `next_seq` equals the request `after_seq` (default `0`).
- Unknown item → `404`.
- Default `after_seq=0`, `limit=100` (max 200).

### `GET /api/changes?after_seq=&limit=`

Global stream for sync / SSE replay.

```json
{
  "events": [ /* ItemEvent[] */ ],
  "next_seq": 12,
  "has_more": true
}
```

- **`next_seq`**: last `seq` in this global page. Store it and pass as the next
  `after_seq` (and later as `Last-Event-ID` for SSE).

### Inbox cursor

`GET /api/inbox` responses include `seq` (latest global event seq).

- Preferred delta: `?after_seq=N` (items with any event `seq > N`).
- Legacy: `?since=<ISO>` still compares `updated_at` as text.

## MCP

| Tool | Role |
| --- | --- |
| `context_get` | Includes recent `events` (default 20, oldest first). |
| `items_events` | Same as `/api/items/:id/events` (`next_seq` is per-item page cursor). |
| `changes_list` | Same as `/api/changes`. |
| `inbox_query` | Accepts `after_seq`; responses include `seq`. |

Invalid `after_seq` / `limit` yield a clear tool error (`validation_error` message),
not a crash.

## Migration

Schema version **6**: `item_events` + `event_seq` counter. Existing rows get one
synthetic `created` event (`payload.backfill: 1`) so history is never empty after
upgrade.
