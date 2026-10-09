# Write API (answer, take, concurrency, idempotency)

User-facing mutations for handoff replies and claiming work. Agents do **not**
call these via MCP — they read the resulting decision notes and `answered` /
`taken` events through `context_get` / `items_events`.

## Optimistic concurrency (`if_updated_at`)

Same pattern as `PATCH /api/notes/:id`:

| Field | Where |
| --- | --- |
| `if_updated_at` | Optional ISO datetime **with offset** (e.g. `2026-10-09T12:00:00.000Z`). Malformed → **400** `{ "error": "validation_error", "message": "…" }`. |

Supported on:

- `PATCH /api/items/:id`
- `POST /api/items/:id/status`
- `POST /api/items/:id/answer`
- `POST /api/items/:id/take`

When present, the write succeeds only if the item’s current `updated_at`
matches. A mismatch returns **409**:

```json
{
  "error": {
    "code": "conflict",
    "message": "WorkItem itm_… was modified (expected updated_at=…)",
    "current_updated_at": "2026-10-09T12:00:01.000Z",
    "item": { /* current WorkItem */ }
  }
}
```

Omit the field to force the write (unchanged behaviour).

## Idempotency (`Idempotency-Key`)

Optional header on every mutating `/api` route (`POST` / `PUT` / `PATCH` /
`DELETE`):

```
Idempotency-Key: <client-chosen opaque string>
```

| Case | Result |
| --- | --- |
| No header | Behaviour unchanged |
| Malformed key (spaces, controls, empty-after-trim non-blank, length > 256) | **400** `{ "error": "validation_error", "message": "…" }` |
| Same key + same method + path + body (24 h) | Stored response replayed |
| Same key + different body | **422** `idempotency_key_reused` |
| After 24 h | Key may be reused as a new request |

Rows live in SQLite (`idempotency_keys`). Expired keys are removed on database
open and about once per hour while the process runs.

## `POST /api/items/:id/answer`

«Responder» (owner decision D5). In **one transaction**:

1. Create a note (`role: decision`) linked to the item
2. Emit an `answered` event (`payload.note_id`, `payload.text` excerpt ≤ 200 chars)
3. If `return_to` is `agent` (default) **and** the item is `needs_you` with an
   agent assignee → set status `assigned` and emit `status_changed`

### Body

```json
{
  "text": "Ship Friday; skip the optional slide.",
  "return_to": "agent",
  "if_updated_at": "2026-10-09T12:00:00.000Z"
}
```

| Field | Rules |
| --- | --- |
| `text` | Required, length **1..4000**. Empty or oversized → **400** `validation_error`. |
| `return_to` | Optional `agent` \| `none` (default `agent`) |
| `if_updated_at` | Optional ISO datetime with offset; malformed → **400** `validation_error` |

### Response `200`

```json
{
  "item": { /* updated WorkItem */ },
  "note": { /* decision Note */ },
  "seq": 42
}
```

`seq` is the latest global `item_events.seq` after the commit.

## `POST /api/items/:id/take`

Atomic «Lo hago yo»: assign to the user and set `in_progress`, emitting one
`taken` event.

### Body

```json
{ "if_updated_at": "2026-10-09T12:00:00.000Z" }
```

Empty `{}` is fine. Optional `if_updated_at` as above.

### Response `200`

```json
{
  "item": { /* updated WorkItem */ },
  "seq": 43
}
```

### Errors / edge cases

| Case | Result |
| --- | --- |
| Item `done` or `cancelled` | **409** with current `item` |
| Already user + `in_progress` | Idempotent success (no new event) |
| Stale `if_updated_at` | **409** with current `item` |

### `taken` payload

```json
{
  "from_assignee_type": "agent",
  "from_assignee_id": "grok-bot",
  "to_assignee_type": "user",
  "to_assignee_id": "user",
  "from_status": "needs_you",
  "to_status": "in_progress"
}
```
