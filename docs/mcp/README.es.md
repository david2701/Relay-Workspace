# Servidor MCP de Relay

Referencia en español para agentes que se conectan a Relay por el Model Context Protocol (MCP).  
English: [`README.en.md`](./README.en.md)

Los ejemplos salen de una ejecución real con la seed (`pnpm seed` en una BD temporal) vía `createMcpTools` / `invokeMcpTool`. Para regenerarlos:

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
pnpm --filter @relay/core build
RELAY_DB=/tmp/relay-mcp-docs.db node scripts/capture-mcp-examples.mjs
```

Captura en bruto: [`examples.json`](./examples.json). Paridad de la lista de tools: `pnpm check:mcp-docs`.

---

## 1. Qué es y cuándo usarlo

El servidor MCP de Relay es el **mismo almacén de trabajo** que la API HTTP y la UI web en español: ítems, notas de primera clase, vistas de inbox y búsqueda. Un agente lo usa para:

- Recoger trabajo asignado (`inbox_query` / `inbox_recommend` / `search`)
- Cargar contexto (`context_get`) antes de actuar
- Avanzar ítems (`items_set_status`, `items_ask_user`, bloqueos, `items_complete`)
- Adjuntar y buscar notas (`notes_*`, `notes_search`, `search`)

Úsalo cuando eres un **agente** que colabora con David. Las acciones solo de usuario (p. ej. «Devolver a …» en la UI) quedan en la web; el agente no debe hacerse pasar por el usuario por MCP (AC10).

---

## 2. Conexión

El servidor escucha en **127.0.0.1** por defecto. Puertos: API/MCP `7420`, web `7421`. Datos: `RELAY_DB` o `data/relay.db`.

### Streamable HTTP — `/mcp`

```text
http://127.0.0.1:7420/mcp
```

Ayuda JSON para demos/tests (no sustituye a un cliente MCP real):

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

Define `RELAY_DB` con la ruta absoluta del SQLite que usa la web/API.

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

Añade bajo `mcpServers` en la config de Claude Desktop (la ruta depende del SO):

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

O, si el cliente admite URL Streamable HTTP:

```json
{
  "mcpServers": {
    "relay": {
      "url": "http://127.0.0.1:7420/mcp"
    }
  }
}
```

### Cliente MCP genérico

1. Arranca Relay (`pnpm dev` o solo el servidor).
2. Conéctate por Streamable HTTP a `http://127.0.0.1:7420/mcp`, **o** lanza stdio: `pnpm --filter @relay/server mcp:stdio` con `RELAY_DB`.
3. Lista tools → llama con argumentos JSON; pasa el actor (ver abajo).
4. Lee el JSON del resultado (`structuredContent` / texto JSON).

---

## 3. Identidad del actor (`X-Relay-Actor`)

Las tools que mutan ítems exigen un agente del catálogo. Orden de resolución:

1. `actor.id` en los argumentos (opcional `actor.type: "agent"`)
2. O el string `actor_id`
3. O la cabecera `X-Relay-Actor: <agent-id>`

Agentes por defecto: `grok-bot` (GB), `dev-senior` (DS), `ux-designer` (UX), `redactor` (RD), `qa` (QA).

Reglas:

- Sin actor → `validation_error`
- Agente desconocido → `validation_error`
- Id de usuario / `type: "user"` por MCP → rechazado (usa la UI web)

Ejemplo:

```json
{ "actor": { "id": "grok-bot", "type": "agent" } }
```

---

## 4. Referencia de tools

Fuente de verdad: `apps/server/src/mcp/tools.ts` → `createMcpTools()`.  
Campos de actor compartidos en mutaciones de ítems: `actor?: { id: string; type?: "agent" }`, `actor_id?: string`.

Estados: `inbox` | `assigned` | `in_progress` | `blocked` | `needs_you` | `done` | `cancelled`  
Prioridades: `none` | `low` | `medium` | `high`  
Roles de nota: `context` | `reference` | `decision`  
Vistas de inbox: `attention` | `agent_wip` | `upcoming` | `done` | `all`

### `items_list`

Lista ítems. Paginación opcional.

| Param | Tipo | Obligatorio | Default |
|-------|------|-------------|---------|
| `limit` | int 1–200 | no | — (sin paginar; devuelve `{ items }`) |
| `cursor` | string | no | — |

**Llamada:** `{ "limit": 2 }`  
**Respuesta (seed):**

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

| Param | Tipo | Obligatorio |
|-------|------|-------------|
| `id` | string | sí |

**Llamada:** `{ "id": "itm_maj7i9qv5r" }`  
**Respuesta:**

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

| Param | Tipo | Obligatorio | Notas |
|-------|------|-------------|-------|
| `title` | string 1–200 | sí | |
| `goal` | string ≤280 | no | |
| `status` | Status | no | por defecto `inbox` |
| `assignee_type` | enum | no | |
| `assignee_id` | string\|null | no | obligatorio si el assignee es agente |
| `due_at` / `reminder_at` | datetime ISO | no | |
| `reminder_intent` | string ≤80 | no | |
| `priority` | Priority | no | |
| `blocked_reason` / `needs_you_reason` | string ≥3 | no | obligatorios según el estado |
| `actor` / `actor_id` | — | sí* | *o `X-Relay-Actor` |

**Llamada:**

```json
{
  "title": "MCP docs sample item",
  "goal": "Ejemplo real para la documentación MCP",
  "priority": "medium",
  "actor": { "id": "grok-bot", "type": "agent" }
}
```

**Respuesta:** `{ "item": { "id": "itm_p0se48sadp", "status": "inbox", "source": "mcp", "last_actor_id": "grok-bot", … } }`

### `items_update`

| Param | Tipo | Obligatorio |
|-------|------|-------------|
| `id` | string | sí |
| `title`, `goal`, `due_at`, `reminder_at`, `reminder_intent`, `priority`, `assignee_type`, `assignee_id`, `blocked_reason`, `needs_you_reason` | opcionales | no |
| `actor` / `actor_id` | — | sí* |

**Llamada:** `{ "id": "itm_p0se48sadp", "title": "MCP docs sample item (updated)", "actor": { "id": "grok-bot", "type": "agent" } }`  
**Respuesta:** `{ "item": { …, "title": "MCP docs sample item (updated)" } }`

### `items_set_status`

| Param | Tipo | Obligatorio |
|-------|------|-------------|
| `id` | string | sí |
| `status` | Status | sí |
| `blocked_reason` | string ≥3 | si `status=blocked` |
| `needs_you_reason` | string ≥3 | si `status=needs_you` |
| `actor` / `actor_id` | — | sí* |

No uses esto para salir de `done`/`cancelled` — usa `items_reopen`.

**Llamada:** `{ "id": "itm_p0se48sadp", "status": "in_progress", "actor": { "id": "grok-bot", "type": "agent" } }`  
**Respuesta:** `{ "item": { …, "status": "in_progress", "started_at": "2026-10-08T08:09:18.905Z" } }`

### `items_complete`

| Param | Tipo | Obligatorio |
|-------|------|-------------|
| `id` | string | sí |
| `actor` / `actor_id` | — | sí* |

**Llamada:** `{ "id": "itm_p0se48sadp", "actor": { "id": "grok-bot", "type": "agent" } }`  
**Respuesta:** `{ "item": { …, "status": "done", "completed_by_id": "grok-bot" } }`

### `items_reopen`

Reabre `done` o `cancelled` → `assigned` (si hay assignee) o `inbox`.

| Param | Tipo | Obligatorio |
|-------|------|-------------|
| `id` | string | sí |
| `actor` / `actor_id` | — | sí* |

**Llamada:** `{ "id": "itm_p0se48sadp", "actor": { "id": "grok-bot", "type": "agent" } }`  
**Respuesta:** `{ "item": { …, "status": "assigned", "completed_at": null } }`

### `items_delegate`

Pone `assignee_type=agent`, `assignee_id` y `status=assigned`.

| Param | Tipo | Obligatorio |
|-------|------|-------------|
| `id` | string | sí |
| `agent_id` | string (catálogo) | sí |
| `actor` / `actor_id` | — | sí* |

**Llamada:** `{ "id": "itm_p0se48sadp", "agent_id": "grok-bot", "actor": { "id": "grok-bot", "type": "agent" } }`  
**Respuesta:** `{ "item": { …, "status": "assigned", "assignee_id": "grok-bot" } }`

### `items_ask_user`

Pone `needs_you` + motivo; **no cambia el assignee**.

| Param | Tipo | Obligatorio |
|-------|------|-------------|
| `id` | string | sí |
| `reason` | string ≥3 | sí |
| `actor` / `actor_id` | — | sí* |

**Llamada:** `{ "id": "itm_p0se48sadp", "reason": "¿Sigo con el borrador A o espero tu OK?", "actor": { "id": "grok-bot", "type": "agent" } }`  
**Respuesta:** `{ "item": { …, "status": "needs_you", "needs_you_reason": "¿Sigo con el borrador A o espero tu OK?" } }`

### `notes_create`

| Param | Tipo | Obligatorio | Default |
|-------|------|-------------|---------|
| `title` | string 1–200 | sí | |
| `body_md` | string ≤100000 | no | vacío |

**Llamada:** `{ "title": "Nota huérfana de ejemplo", "body_md": "Texto buscable sobre el lanzamiento de Relay." }`  
**Respuesta:** `{ "note": { "id": "nte_0wtjk5yrn1", "title": "Nota huérfana de ejemplo", "body_md": "…", "created_at": "…", "updated_at": "…" } }`

### `notes_get`

| Param | Tipo | Obligatorio |
|-------|------|-------------|
| `id` | string | sí |

**Llamada:** `{ "id": "nte_0wtjk5yrn1" }`  
**Respuesta:** `{ "note": { … }, "links": [] }`

### `notes_update`

| Param | Tipo | Obligatorio | Notas |
|-------|------|-------------|-------|
| `id` | string | sí | |
| `title` / `body_md` | opcionales | no | |
| `if_updated_at` | datetime ISO | no | concurrencia optimista; obsoleto → conflicto |

**Llamada:** `{ "id": "nte_0wtjk5yrn1", "body_md": "Texto actualizado sobre el lanzamiento de Relay.", "if_updated_at": "2026-10-08T08:09:18.908Z" }`  
**Respuesta:** `{ "note": { …, "updated_at": "2026-10-08T08:09:18.912Z" } }`

### `notes_list`

| Param | Tipo | Obligatorio | Default |
|-------|------|-------------|---------|
| `limit` | int 1–200 | no | — (sin paginar `{ notes }`) |
| `cursor` | string | no | |

**Llamada:** `{ "limit": 2 }`  
**Respuesta:** `{ "notes": […], "next_cursor": "…", "has_more": true, "total_count": 3 }`

### `notes_search`

Busca notas **huérfanas** (sin enlace) por texto. Las notas enlazadas no salen; usa `search` para ítems + notas vinculadas.

| Param | Tipo | Obligatorio | Default |
|-------|------|-------------|---------|
| `q` | string ≥1 | sí | |
| `limit` | int 1–200 | no | todos los matches |

**Llamada:** `{ "q": "lanzamiento", "limit": 5 }`  
**Respuesta:**

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

| Param | Tipo | Obligatorio | Default |
|-------|------|-------------|---------|
| `item_id` | string | sí | |
| `note_id` | string | sí | |
| `role` | NoteRole | no | `"context"` |

**Llamada:** `{ "item_id": "itm_p0se48sadp", "note_id": "nte_0wtjk5yrn1", "role": "context" }`  
**Respuesta:** `{ "link": { "item_id": "itm_p0se48sadp", "note_id": "nte_0wtjk5yrn1", "role": "context" } }`

### `notes_unlink`

| Param | Tipo | Obligatorio |
|-------|------|-------------|
| `item_id` | string | sí |
| `note_id` | string | sí |

**Llamada:** `{ "item_id": "itm_p0se48sadp", "note_id": "nte_0wtjk5yrn1" }`  
**Respuesta:** `{ "ok": true }`

### `context_get`

Paquete de contexto + markdown antes de trabajar un ítem.

| Param | Tipo | Obligatorio |
|-------|------|-------------|
| `id` | string (ítem) | sí |

**Llamada:** `{ "id": "itm_maj7i9qv5r" }`  
**Respuesta:** `{ "context": { "item_id", "title", "goal", "status", "needs_you_reason", "notes": […], … }, "markdown": "# …" }`

### `inbox_query`

| Param | Tipo | Obligatorio | Default |
|-------|------|-------------|---------|
| `view` | InboxView | no | `"attention"` |
| `limit` | int 1–200 | no | |
| `cursor` | string | no | paginación |
| `since` | string | no | modo sync delta |

**Llamada:** `{ "view": "attention", "limit": 2 }`  
**Respuesta:** `{ "view": "attention", "items": […], "counters": { "needs_you": 1 }, "total_count": 3, "next_cursor": "…", "has_more": true, "section_counts": {…}, "sections": […], "sync_cursor", "server_time" }`

Con `since`, el resultado es un delta (`upserts` / `removed_ids`) en lugar de una página completa.

### `search`

Busca ítems de trabajo (título, objetivo, motivos, recordatorio, notas vinculadas).

| Param | Tipo | Obligatorio | Notas |
|-------|------|-------------|-------|
| `q` | string | no | texto |
| `status` | Status[] o string con comas | no | |
| `actor` | string[] o string con comas | no | filtro por assignee/actor |
| `due` | `overdue`\|`today`\|`week`\|`none`\|`range` | no | |
| `from` / `to` | string | no | con `due=range` |
| `view` | InboxView | no | |
| `label` | string | no | |
| `limit` | int 1–200 | no | |
| `cursor` | string | no | |

**Llamada:** `{ "q": "titular", "limit": 5 }`  
**Respuesta:**

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

| Param | Tipo | Obligatorio | Default |
|-------|------|-------------|---------|
| `limit` | int 1–10 | no | `3` |

**Llamada:** `{ "limit": 3 }`  
**Respuesta:**

```json
{
  "recommendations": [
    {
      "item_id": "itm_maj7i9qv5r",
      "kind": "needs_you_waiting",
      "score": 103.00001944444445,
      "reason": "Te espera desde hace 3 h"
    },
    {
      "item_id": "itm_r9j7pimxt9",
      "kind": "blocked",
      "score": 90,
      "reason": "Atascado: falta acceso de lectura a la carpeta /archive"
    },
    {
      "item_id": "itm_uyoen5x0lf",
      "kind": "reminder_soon",
      "score": 84.00002388888889,
      "reason": "Aviso en 1 h: Revisar el borrador antes de la demo"
    }
  ]
}
```

---

## 5. Flujo típico del agente (de punta a punta)

1. **Recoger** — `inbox_recommend` o `inbox_query` con `view: "agent_wip"` / `"attention"`, o `search` con tu agent id.
2. **Cargar contexto** — `context_get` con el id del ítem; lee objetivo, notas, motivos y recordatorio.
3. **Trabajar** — `items_set_status` → `in_progress`; actualiza campos / notas (`notes_create` + `notes_link`).
4. **Bloqueo o preguntar al usuario**
   - Bloqueo: `items_set_status` con `status: "blocked"` y `blocked_reason` (≥3 caracteres).
   - Necesitas a David: `items_ask_user` con `reason` (el assignee no cambia).
5. **El usuario responde «Devolver a …»** — En la UI web David pulsa «Devolver a {agente}» (opcionalmente escribe una nota `decision`). El estado vuelve a `assigned` con el mismo assignee. Haz polling de `inbox_query` / `items_get` hasta ver `assigned` otra vez; luego `context_get` por si hay nota de decisión nueva.
6. **Completar** — `items_set_status` → `in_progress` si hace falta, luego `items_complete`.

Demo de la seed que ya espera al usuario: ítem «Elegir titular del post de lanzamiento» (`needs_you`).

---

## 6. Errores y cómo tratarlos

Los handlers MCP lanzan errores de dominio / Zod. En Streamable HTTP MCP aparecen como resultado de tool con `isError` y el mensaje. En REST se mapean a HTTP con `handleError`. En `/mcp/invoke`, fallos → `{ "error": "<mensaje>" }` con status 400.

| Código / tipo | Mensaje típico | HTTP (API) | Qué hacer |
|---------------|----------------|------------|-----------|
| `validation_error` | `blocked_reason is required (min 3 characters)` | 400 | Corrige args; incluye motivos en blocked/needs_you |
| `validation_error` | `needs_you_reason is required (min 3 characters)` | 400 | Igual |
| `validation_error` | `MCP actor required: …` | 400 | Pasa `actor.id` o `X-Relay-Actor` |
| `validation_error` | `Unknown agent id: …` | 400 | Usa un id del catálogo |
| `validation_error` | `MCP actors must be agents…` | 400 | No uses actor de usuario en MCP |
| `validation_error` | `Only done or cancelled items can be reopened` | 400 | Transición inválida; `items_reopen` solo en terminal |
| `validation_error` | `Use reopen to leave a terminal status` | 400 | Llama `items_reopen`, no `items_set_status` |
| Errores Zod | Enum / tipo / longitud inválidos | 400 | Alinea args con los esquemas de arriba |
| `not_found` | `WorkItem not found: …` / `Note not found: …` | 404 | Refresca ids con list/search |
| `conflict` | `Note … was modified (expected updated_at=…)` + `current_updated_at` | **409** | Vuelve a `notes_get`, fusiona, reintenta con `if_updated_at` fresco u omítelo para forzar |

Muestras capturadas:

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

## Mantener este doc

- Los encabezados de tools deben ser `### \`tool_name\`` y coincidir con `createMcpTools().map(t => t.name)`.
- Ejecuta `pnpm check:mcp-docs` al añadir o quitar tools.
- Actualiza ejemplos con `node scripts/capture-mcp-examples.mjs`.
