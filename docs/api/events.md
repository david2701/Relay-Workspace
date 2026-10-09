# Item events API

Global monotonic event log for work-item mutations. Foundation for SSE (`seq` /
`Last-Event-ID` — see [stream.md](./stream.md)), mobile sync, and handoff history.

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
| `status_changed` | `setStatus` / `complete` / `reopen` / `askUser` / answer return | `from`, `to`, reasons |
| `assigned` | update that only changes assignee to user/unassigned | `assignee_*`, previous assignee |
| `delegated` | `delegate` or update assignee → agent | `agent_id`, previous assignee |
| `note_linked` / `note_unlinked` | link/unlink | `note_id`, `role` (link) |
| `reminder_set` | update that only changes reminder fields | `reminder_at`, `reminder_intent` |
| `reminder_fired` | server reminder watcher when `reminder_at` is due | `reminder_at`, `reminder_intent`, `title` |
| `answered` | `POST …/answer` («Responder») | `note_id`, `text` (excerpt ≤ 200) |
| `taken` | `POST …/take` («Lo hago yo») | `from_*` / `to_*` assignee + status |

Most mutating HTTP/MCP paths that touch an item emit exactly one event in the
same transaction. **Answer** may emit `answered` plus `status_changed` when
returning to the agent; the decision note link is part of that write (no
separate `note_linked`). A rolled-back write leaves no event (and no note).

See also [writes.md](./writes.md) for answer/take, `if_updated_at`, and
`Idempotency-Key`.

Demo seed backdates one item’s `updated_at` for Attention ordering via
`RelayService.stampItemUpdatedAt`, which emits `updated` with
`payload.reason = "demo_backdate"` so `after_seq` and `since=` stay aligned.

## Query parameters

Shared by `/api/changes`, `/api/items/:id/events`, and inbox (`after_seq` / `before_seq` / `limit`):

| Param | Rules |
| --- | --- |
| `after_seq` | Optional. Safe integer `0 … Number.MAX_SAFE_INTEGER`. |
| `before_seq` | Optional. Same bounds as `after_seq` (reserved for SSE resume). |
| `limit` | Optional. Integer `1 … 200`. |

**Empty values** (`after_seq=`, `before_seq=`, `limit=`) return **400** — omit the parameter to use the default. Do not treat blank as `0`.

Invalid or empty → **400**:

```json
{
  "error": "validation_error",
  "message": "after_seq must be a safe integer between 0 and 9007199254740991",
  "field": "after_seq"
}
```

`message` always names the offending field; `field` repeats it for clients. Same shape for write validation (`text`, `if_updated_at`, `Idempotency-Key`).

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
| `context_get` | Includes recent `events` (default 20, oldest first) and linked notes (decision notes from «Responder» appear here — no MCP answer/take tools). |
| `items_events` | Same as `/api/items/:id/events` (`next_seq` is per-item page cursor). |
| `changes_list` | Same as `/api/changes`. |
| `inbox_query` | Accepts `after_seq`; responses include `seq`. |

Answer and take are **user/UI** writes (`POST /api/items/:id/answer|take`). Agents
poll or reload `context_get` after the user replies.

Invalid `after_seq` / `limit` yield a clear tool error (`validation_error` message),
not a crash.

## Migration

Schema version **6**: `item_events` + `event_seq` counter. Existing rows get one
synthetic `created` event (`payload.backfill: 1`) so history is never empty after
upgrade.

Schema version **7**: `idempotency_keys` (24 h HTTP Idempotency-Key cache).
