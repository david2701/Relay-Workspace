# Relay MCP server

English reference for agents connecting to Relay over the Model Context Protocol (MCP).  
Spanish: [`README.es.md`](./README.es.md)

Examples below were captured from a real seed run (`pnpm seed` on a temp DB) via `createMcpTools` / `invokeMcpTool`. Regenerate with:

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
pnpm --filter @relay/core build
RELAY_DB=/tmp/relay-mcp-docs.db node scripts/capture-mcp-examples.mjs
```

Raw capture: [`examples.json`](./examples.json). Tool-list parity: `pnpm check:mcp-docs`.

---

## 1. What it is and when to use it

Relay’s MCP server is the **same work store** as the HTTP API and Spanish web UI: work items, first-class notes, inbox views, and search. Agents use it to:

- Pick up assigned work (`inbox_query` / `inbox_recommend` / `search`)
- Load context (`context_get`) before acting
- Progress items (`items_set_status`, `items_ask_user`, blocked reasons, `items_complete`)
- Attach and search notes (`notes_*`, `notes_search`, `search`)

Use MCP when you are an **agent** collaborating with David. User-only actions (e.g. «Devolver a …» in the UI) stay on the web; agents must not impersonate the user over MCP (AC10).

---

## 2. Connecting

Server binds to **127.0.0.1** by default. Default ports: API/MCP `7420`, web `7421`. Data: `RELAY_DB` or `data/relay.db`.

### Streamable HTTP — `/mcp`

```text
http://127.0.0.1:7420/mcp
```

JSON helper for demos/tests (not a substitute for a real MCP client):

```http
POST http://127.0.0.1:7420/mcp/invoke
Content-Type: application/json
X-Relay-Actor: grok-bot

{ "name": "items_list", "arguments": { "limit": 2 } }
```

### stdio

```bash
pnpm --filter @relay/server mcp:stdio
```

Set `RELAY_DB` to the absolute path of the SQLite file the web/API use.

stdio and the HTTP server are separate processes on the same SQLite file (WAL).
The HTTP process detects other writers via `PRAGMA data_version` and refreshes
its in-memory item cache, so creates/updates from stdio (or raw SQL that bumps
`updated_at`) show up in `/api/search`, inbox snapshots, and delta poll
(`since=sync_cursor`) within the AC3 window (≤2s). FTS5 stays in sync through
SQL triggers on `work_items` / `notes`. **Limitation:** a raw SQL edit that
changes a row without updating `updated_at` is visible in search/list after the
cache refresh, but will not appear in a delta poll until `updated_at` moves (or
the client takes a fresh snapshot). **Limitation:** a raw SQL `DELETE` removes
the row from the database. After the cache refresh, it disappears from search
and lists, but delta poll never emits it in `removed_ids` — those ids come only
from rows that still exist with `updated_at` newer than `since` and have left
the view (for example an API/MCP complete). The `relay_meta` sync watermark
triggers are INSERT/UPDATE only. Workaround: delete through the API or MCP, or
reload / take a fresh inbox snapshot.

### Cursor — `.cursor/mcp.json`

**Streamable HTTP:**

```json
{
  "mcpServers": {
    "relay": {
      "url": "http://127.0.0.1:7420/mcp"
    }
  }
}
```

**stdio:**

```json
{
  "mcpServers": {
    "relay": {
      "command": "pnpm",
      "args": ["--filter", "@relay/server", "mcp:stdio"],
      "env": {
        "RELAY_DB": "/absolute/path/to/data/relay.db"
      }
    }
  }
}
```

### Claude Desktop

Add under `mcpServers` in the Claude Desktop config (path varies by OS):

```json
{
  "mcpServers": {
    "relay": {
      "command": "pnpm",
      "args": ["--filter", "@relay/server", "mcp:stdio"],
      "cwd": "/absolute/path/to/relay",
      "env": {
        "RELAY_DB": "/absolute/path/to/data/relay.db",
        "PATH": "/Users/you/.nvm/versions/node/v24.21.0/bin:/usr/bin:/bin"
      }
    }
  }
}
```

Or, if the client supports Streamable HTTP URLs:

```json
{
  "mcpServers": {
    "relay": {
      "url": "http://127.0.0.1:7420/mcp"
    }
  }
}
```

### Generic MCP client

1. Start Relay (`pnpm dev` or server alone).
2. Connect with Streamable HTTP to `http://127.0.0.1:7420/mcp`, **or** spawn stdio: `pnpm --filter @relay/server mcp:stdio` with `RELAY_DB` set.
3. List tools → call with JSON args; pass actor (see below).
4. Read structured JSON from the tool result (`structuredContent` / text JSON).

---

## 3. Actor identity (`X-Relay-Actor`)

Mutating item tools require an agent from the catalog. Resolve order:

1. `actor.id` in tool arguments (optional `actor.type: "agent"`)
2. Or `actor_id` string argument
3. Or header `X-Relay-Actor: <agent-id>`

Default catalog agents: `grok-bot` (GB), `dev-senior` (DS), `ux-designer` (UX), `redactor` (RD), `qa` (QA).

Rules:

- Missing actor → `validation_error`
- Unknown agent id → `validation_error`
- User id / `type: "user"` over MCP → rejected (use the web UI)

Example argument:

```json
{ "actor": { "id": "grok-bot", "type": "agent" } }
```

---

## 4. Tool reference

Source of truth: `apps/server/src/mcp/tools.ts` → `createMcpTools()`.  
Shared actor fields on mutating item tools: `actor?: { id: string; type?: "agent" }`, `actor_id?: string`.

Statuses: `inbox` | `assigned` | `in_progress` | `blocked` | `needs_you` | `done` | `cancelled`  
Priorities: `none` | `low` | `medium` | `high`  
Note roles: `context` | `reference` | `decision`  
Inbox views: `attention` | `agent_wip` | `upcoming` | `done` | `all`

### `items_list`

List work items. Optional pagination.

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `limit` | int 1–200 | no | — (no pagination; returns `{ items }`) |
| `cursor` | string | no | — |

**Call:** `{ "limit": 2 }`  
**Response (seed):**

```json
{
  "items": [
    {
      "id": "itm_hlm0y1stl0",
      "title": "Redactar changelog de la semana",
      "status": "done",
      "assignee_id": "redactor"
    },
    {
      "id": "itm_xs3nms94e7",
      "title": "Comprar dominio relay.dev",
      "status": "inbox"
    }
  ],
  "next_cursor": "eyJpZCI6Iml0bV94czNubXM5NGU3IiwidXBkYXRlZF9hdCI6IjIwMjYtMTAtMDhUMDg6MDk6MTguODYzWiJ9",
  "has_more": true,
  "total_count": 6
}
```

### `items_get`

| Param | Type | Required |
|-------|------|----------|
| `id` | string | yes |

**Call:** `{ "id": "itm_maj7i9qv5r" }`  
**Response:**

```json
{
  "item": {
    "id": "itm_maj7i9qv5r",
    "title": "Elegir titular del post de lanzamiento",
    "status": "needs_you",
    "assignee_id": "grok-bot",
    "needs_you_reason": "¿Publico la versión A («Relay») o la B («Relevo»)? El post sale mañana a las 9:00."
  }
}
```

### `items_create`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string 1–200 | yes | |
| `goal` | string ≤280 | no | |
| `status` | Status | no | default `inbox` |
| `assignee_type` | enum | no | |
| `assignee_id` | string\|null | no | required if assignee is agent |
| `due_at` / `reminder_at` | ISO datetime | no | |
| `reminder_intent` | string ≤80 | no | |
| `priority` | Priority | no | |
| `blocked_reason` / `needs_you_reason` | string ≥3 | no | required when status needs them |
| `actor` / `actor_id` | — | yes* | *or `X-Relay-Actor` |

**Call:**

```json
{
  "title": "MCP docs sample item",
  "goal": "Ejemplo real para la documentación MCP",
  "priority": "medium",
  "actor": { "id": "grok-bot", "type": "agent" }
}
```

**Response:** `{ "item": { "id": "itm_p0se48sadp", "status": "inbox", "source": "mcp", "last_actor_id": "grok-bot", … } }`

### `items_update`

| Param | Type | Required |
|-------|------|----------|
| `id` | string | yes |
| `title`, `goal`, `due_at`, `reminder_at`, `reminder_intent`, `priority`, `assignee_type`, `assignee_id`, `blocked_reason`, `needs_you_reason` | optional fields | no |
| `actor` / `actor_id` | — | yes* |

**Call:** `{ "id": "itm_p0se48sadp", "title": "MCP docs sample item (updated)", "actor": { "id": "grok-bot", "type": "agent" } }`  
**Response:** `{ "item": { …, "title": "MCP docs sample item (updated)" } }`

### `items_set_status`

| Param | Type | Required |
|-------|------|----------|
| `id` | string | yes |
| `status` | Status | yes |
| `blocked_reason` | string ≥3 | if `status=blocked` |
| `needs_you_reason` | string ≥3 | if `status=needs_you` |
| `actor` / `actor_id` | — | yes* |

Do not use this to leave `done`/`cancelled` — use `items_reopen`.

**Call:** `{ "id": "itm_p0se48sadp", "status": "in_progress", "actor": { "id": "grok-bot", "type": "agent" } }`  
**Response:** `{ "item": { …, "status": "in_progress", "started_at": "2026-10-08T08:09:18.905Z" } }`

### `items_complete`

| Param | Type | Required |
|-------|------|----------|
| `id` | string | yes |
| `actor` / `actor_id` | — | yes* |

**Call:** `{ "id": "itm_p0se48sadp", "actor": { "id": "grok-bot", "type": "agent" } }`  
**Response:** `{ "item": { …, "status": "done", "completed_by_id": "grok-bot" } }`

### `items_reopen`

Reopens `done` or `cancelled` → `assigned` (if assignee) or `inbox`.

| Param | Type | Required |
|-------|------|----------|
| `id` | string | yes |
| `actor` / `actor_id` | — | yes* |

**Call:** `{ "id": "itm_p0se48sadp", "actor": { "id": "grok-bot", "type": "agent" } }`  
**Response:** `{ "item": { …, "status": "assigned", "completed_at": null } }`

### `items_delegate`

Sets `assignee_type=agent`, `assignee_id`, `status=assigned`.

| Param | Type | Required |
|-------|------|----------|
| `id` | string | yes |
| `agent_id` | string (catalog) | yes |
| `actor` / `actor_id` | — | yes* |

**Call:** `{ "id": "itm_p0se48sadp", "agent_id": "grok-bot", "actor": { "id": "grok-bot", "type": "agent" } }`  
**Response:** `{ "item": { …, "status": "assigned", "assignee_id": "grok-bot" } }`

### `items_ask_user`

Sets `needs_you` + reason; **does not change assignee**.

| Param | Type | Required |
|-------|------|----------|
| `id` | string | yes |
| `reason` | string ≥3 | yes |
| `actor` / `actor_id` | — | yes* |

**Call:** `{ "id": "itm_p0se48sadp", "reason": "¿Sigo con el borrador A o espero tu OK?", "actor": { "id": "grok-bot", "type": "agent" } }`  
**Response:** `{ "item": { …, "status": "needs_you", "needs_you_reason": "¿Sigo con el borrador A o espero tu OK?" } }`

### `notes_create`

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `title` | string 1–200 | yes | |
| `body_md` | string ≤100000 | no | empty |

**Call:** `{ "title": "Nota huérfana de ejemplo", "body_md": "Texto buscable sobre el lanzamiento de Relay." }`  
**Response:** `{ "note": { "id": "nte_0wtjk5yrn1", "title": "Nota huérfana de ejemplo", "body_md": "…", "created_at": "…", "updated_at": "…" } }`

### `notes_get`

| Param | Type | Required |
|-------|------|----------|
| `id` | string | yes |

**Call:** `{ "id": "nte_0wtjk5yrn1" }`  
**Response:** `{ "note": { … }, "links": [] }`

### `notes_update`

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | |
| `title` / `body_md` | optional | no | |
| `if_updated_at` | ISO datetime | no | optimistic concurrency; stale → conflict |

**Call:** `{ "id": "nte_0wtjk5yrn1", "body_md": "Texto actualizado sobre el lanzamiento de Relay.", "if_updated_at": "2026-10-08T08:09:18.908Z" }`  
**Response:** `{ "note": { …, "updated_at": "2026-10-08T08:09:18.912Z" } }`

### `notes_list`

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `limit` | int 1–200 | no | — (unpaged `{ notes }`) |
| `cursor` | string | no | |

**Call:** `{ "limit": 2 }`  
**Response:** `{ "notes": […], "next_cursor": "…", "has_more": true, "total_count": 3 }`

### `notes_search`

Search **orphan** (unlinked) notes by text. Linked notes are excluded; use `search` for item+note hits.

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `q` | string ≥1 | yes | |
| `limit` | int 1–200 | no | all matches |

**Call:** `{ "q": "lanzamiento", "limit": 5 }`  
**Response:**

```json
{
  "notes": [
    {
      "note": {
        "id": "nte_0wtjk5yrn1",
        "title": "Nota huérfana de ejemplo",
        "body_md": "Texto actualizado sobre el lanzamiento de Relay."
      },
      "match": {
        "field": "note",
        "snippet": "Texto actualizado sobre el lanzamiento de Relay.",
        "ranges": [[27, 38]],
        "note_id": "nte_0wtjk5yrn1"
      }
    }
  ],
  "total": 1
}
```

### `notes_link`

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `item_id` | string | yes | |
| `note_id` | string | yes | |
| `role` | NoteRole | no | `"context"` |

**Call:** `{ "item_id": "itm_p0se48sadp", "note_id": "nte_0wtjk5yrn1", "role": "context" }`  
**Response:** `{ "link": { "item_id": "itm_p0se48sadp", "note_id": "nte_0wtjk5yrn1", "role": "context" } }`

### `notes_unlink`

| Param | Type | Required |
|-------|------|----------|
| `item_id` | string | yes |
| `note_id` | string | yes |

**Call:** `{ "item_id": "itm_p0se48sadp", "note_id": "nte_0wtjk5yrn1" }`  
**Response:** `{ "ok": true }`

### `context_get`

Context pack + markdown for an agent before working an item, plus recent `item_events` (oldest first).

| Param | Type | Required |
|-------|------|----------|
| `id` | string (item) | yes |
| `event_limit` | int 1–100 | no (default 20) |

**Call:** `{ "id": "itm_maj7i9qv5r" }`  
**Response:** `{ "context": { "item_id", "title", "goal", "status", "needs_you_reason", "notes": […], … }, "markdown": "# …", "events": [ { "seq", "type", "payload", … } ] }`

### `items_events`

Paged event history for one item (oldest first). Prefer `after_seq` for resume.

| Param | Type | Required |
|-------|------|----------|
| `id` | string (item) | yes |
| `after_seq` | int ≥0 | no (default 0) |
| `limit` | int 1–200 | no (default 100) |

**Call:** `{ "id": "itm_maj7i9qv5r", "after_seq": 0, "limit": 20 }`  
**Response:** `{ "events": […], "next_seq": 3, "has_more": false }`

### `inbox_query`

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `view` | InboxView | no | `"attention"` |
| `limit` | int 1–200 | no | |
| `cursor` | string | no | pagination |
| `after_seq` | int ≥0 | no | preferred delta cursor |
| `since` | string | no | legacy delta sync mode |

**Call:** `{ "view": "attention", "limit": 2 }`  
**Response:** `{ "view": "attention", "items": […], "counters": { "needs_you": 1 }, "total_count": 3, "next_cursor": "…", "has_more": true, "section_counts": {…}, "sections": […], "sync_cursor", "server_time", "seq" }`

With `after_seq` (preferred) or `since`, result is a delta (`upserts` / `removed_ids`) instead of a full page. `seq` is the latest global event sequence.

### `changes_list`

Global `item_events` page for sync / future SSE replay (`Last-Event-ID` ↔ `after_seq`).

| Param | Type | Required |
|-------|------|----------|
| `after_seq` | int ≥0 | no (default 0) |
| `limit` | int 1–200 | no (default 100) |

**Call:** `{ "after_seq": 0, "limit": 50 }`  
**Response:** `{ "events": […], "next_seq": 12, "has_more": true }`

See also [`docs/api/events.md`](../api/events.md).

### `search`

Search work items (title, goal, reasons, reminder intent, linked notes).

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `q` | string | no | text query |
| `status` | Status[] or comma string | no | |
| `actor` | string[] or comma string | no | assignee / actor filter |
| `due` | `overdue`\|`today`\|`week`\|`none`\|`range` | no | |
| `from` / `to` | string | no | with `due=range` |
| `view` | InboxView | no | |
| `label` | string | no | |
| `limit` | int 1–200 | no | |
| `cursor` | string | no | |

**Call:** `{ "q": "titular", "limit": 5 }`  
**Response:**

```json
{
  "items": [
    {
      "item": {
        "id": "itm_maj7i9qv5r",
        "title": "Elegir titular del post de lanzamiento",
        "status": "needs_you"
      },
      "match": {
        "field": "title",
        "snippet": "Elegir titular del post de lanzamiento",
        "ranges": [[7, 14]]
      }
    }
  ],
  "total": 1
}
```

### `inbox_recommend`

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `limit` | int 1–10 | no | `3` |

**Call:** `{ "limit": 3 }`  
**Response:**

```json
{
  "recommendations": [
    {
      "item_id": "itm_maj7i9qv5r",
      "kind": "needs_you_waiting",
      "score": 103.00001944444445,
      "reason_code": "rec.needs_you_waiting",
      "reason_params": { "rel": "3 h" }
    },
    {
      "item_id": "itm_r9j7pimxt9",
      "kind": "blocked",
      "score": 90,
      "reason_code": "rec.blocked",
      "reason_params": { "reason": "falta acceso de lectura a la carpeta /archive" }
    },
    {
      "item_id": "itm_uyoen5x0lf",
      "kind": "reminder_soon",
      "score": 84.00002388888889,
      "reason_code": "rec.reminder_soon",
      "reason_params": { "rel": "1 h", "intent": "Revisar el borrador antes de la demo" }
    }
  ]
}
```

---

## 5. Typical agent flow (end to end)

1. **Pick up** — `inbox_recommend` or `inbox_query` with `view: "agent_wip"` / `"attention"`, or `search` with your agent id.
2. **Load context** — `context_get` on the item id; read goal, notes, reasons, reminder.
3. **Work** — `items_set_status` → `in_progress`; update fields / notes as needed (`notes_create` + `notes_link`).
4. **Blocked or ask user**
   - Blocked: `items_set_status` with `status: "blocked"` and `blocked_reason` (≥3 chars).
   - Need David: `items_ask_user` with `reason` (assignee unchanged).
5. **User replies «Devolver a …»** — In the web UI David clicks «Devolver a {agent}» (optionally writes a decision note). Status returns to `assigned` with the same assignee. Poll `inbox_query` / `items_get` until you see `assigned` again, then `context_get` for any new decision note.
6. **Complete** — `items_set_status` → `in_progress` if needed, then `items_complete`.

Seed demo that already waits on the user: item «Elegir titular del post de lanzamiento» (`needs_you`).

---

## 6. Errors and how to handle them

MCP tool handlers throw domain / Zod errors. Over Streamable HTTP MCP they surface as `isError` tool results with the message text. Over REST they map to HTTP status via `handleError`. Over `/mcp/invoke`, failures return `{ "error": "<message>" }` with status 400.

| Code / kind | Typical message | HTTP (API) | Agent action |
|-------------|-----------------|------------|--------------|
| `validation_error` | `blocked_reason is required (min 3 characters)` | 400 | Fix args; include reasons for blocked/needs_you |
| `validation_error` | `needs_you_reason is required (min 3 characters)` | 400 | Same |
| `validation_error` | `MCP actor required: …` | 400 | Pass `actor.id` or `X-Relay-Actor` |
| `validation_error` | `Unknown agent id: …` | 400 | Use a catalog agent id |
| `validation_error` | `MCP actors must be agents…` | 400 | Do not use user actor on MCP |
| `validation_error` | `Only done or cancelled items can be reopened` | 400 | Invalid transition; use `items_reopen` only on terminal |
| `validation_error` | `Use reopen to leave a terminal status` | 400 | Call `items_reopen`, not `items_set_status` |
| Zod parse errors | Invalid enum / type / min length | 400 | Align args with schemas above |
| `not_found` | `WorkItem not found: …` / `Note not found: …` | 404 | Refresh ids via list/search |
| `conflict` | `Note … was modified (expected updated_at=…)` + `current_updated_at` | **409** | Re-`notes_get`, merge, retry with fresh `if_updated_at` or omit it to force |

Captured samples:

```json
{ "code": "not_found", "message": "WorkItem not found: item_does_not_exist" }
```

```json
{ "code": "validation_error", "message": "blocked_reason is required (min 3 characters)" }
```

```json
{ "code": "validation_error", "message": "Only done or cancelled items can be reopened" }
```

```json
{
  "code": "conflict",
  "message": "Note nte_cjqf6c2lmz was modified (expected updated_at=2026-10-08T08:09:18.947Z)",
  "current_updated_at": "2026-10-08T08:09:18.953Z"
}
```

---

## Maintaining this doc

- Tool headings must stay `### \`tool_name\`` matching `createMcpTools().map(t => t.name)`.
- Run `pnpm check:mcp-docs` after adding/removing tools.
- Refresh examples with `node scripts/capture-mcp-examples.mjs`.
