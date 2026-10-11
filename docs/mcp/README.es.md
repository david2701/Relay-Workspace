# Servidor MCP de Relay

Esta guía explica cómo conectar un agente de inteligencia artificial (IA) a Relay mediante MCP (Model Context Protocol). MCP es un protocolo estándar que permite a un agente usar las herramientas de otro programa. En esta guía llamamos *tools* a esas herramientas.  
English: [`README.en.md`](./README.en.md)

Todos los ejemplos son salidas reales. Salen de ejecutar `createMcpTools` / `invokeMcpTool` sobre una base de datos (BD) temporal cargada con datos de ejemplo (*seed*, comando `pnpm seed`). Para regenerarlos, ejecuta:

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
pnpm --filter @relay/core build
RELAY_DB=/tmp/relay-mcp-docs.db node scripts/capture-mcp-examples.mjs
```

La captura completa, sin editar, está en [`examples.json`](./examples.json). Para comprobar que la guía documenta las mismas tools que el servidor, ejecuta `pnpm check:mcp-docs`.

---

## 1. Qué es y cuándo usarlo

El servidor MCP de Relay usa el **mismo almacén de trabajo** que la API HTTP (la interfaz con la que otros programas leen y escriben datos) y que la interfaz web en español. Da acceso a lo mismo: ítems (tareas de trabajo), notas, vistas de la bandeja de entrada (*inbox*) y búsqueda. Las notas son objetos propios: existen aunque no estén enlazadas a ningún ítem.

Un agente usa el servidor para:

- Recoger el trabajo que tiene asignado (`inbox_query` / `inbox_recommend` / `search`).
- Cargar el contexto de un ítem (`context_get`) antes de actuar.
- Avanzar ítems (`items_set_status`, `items_ask_user`, motivos de bloqueo, `items_complete`).
- Adjuntar y buscar notas (`notes_*`, `notes_search`, `search`).

Usa MCP cuando seas un **agente** que colabora con David. Algunas acciones son exclusivas del usuario, como «Devolver a …», y David las hace en la interfaz web. Un agente nunca debe hacerse pasar por el usuario a través de MCP (criterio de aceptación AC10).

---

## 2. Conexión

Por defecto, el servidor solo acepta conexiones desde tu propio equipo (**127.0.0.1**). El servidor usa estos puertos por defecto: `7420` para la API y MCP, y `7421` para la web. Relay guarda los datos en el archivo que indica la variable de entorno `RELAY_DB`. Si no la defines, Relay usa `data/relay.db`.

Un cliente MCP puede conectarse de dos formas: por Streamable HTTP o por stdio.

### Streamable HTTP — `/mcp`

Con Streamable HTTP, el cliente MCP se conecta al servidor a través de esta URL:

```text
http://127.0.0.1:7420/mcp
```

Para demos y pruebas, el servidor ofrece además una ruta auxiliar que recibe y devuelve JSON (un formato de texto para datos estructurados). Esta ruta no sustituye a un cliente MCP real:

```http
POST http://127.0.0.1:7420/mcp/invoke
Content-Type: application/json
X-Relay-Actor: grok-bot

{ "name": "items_list", "arguments": { "limit": 2 } }
```

### stdio

Con stdio (entrada y salida estándar), el cliente arranca el servidor como un proceso local y se comunica con él directamente. Usa este comando:

```bash
pnpm --filter @relay/server mcp:stdio
```

Define la variable `RELAY_DB` con la ruta absoluta del archivo SQLite (la base de datos) que usan la web y la API.

stdio y el servidor HTTP son procesos distintos sobre el mismo archivo SQLite (WAL).
El proceso HTTP detecta escrituras de otros procesos con `PRAGMA data_version` y
refresca su caché en memoria, así que los altas/cambios hechos por stdio (o por
SQL directo que actualice `updated_at`) aparecen en `/api/search`, en el inbox y
en el poll delta (`since=sync_cursor`) dentro de la ventana AC3 (≤2 s). El índice
FTS5 se mantiene al día con disparadores SQL en `work_items` / `notes`.
**Limitación:** un `UPDATE` SQL que cambie una fila sin tocar `updated_at` sí se
verá en search/list tras refrescar la caché, pero no entrará en un poll delta
hasta que `updated_at` avance (o el cliente pida un snapshot nuevo).
**Limitación:** un `DELETE` SQL directo borra la fila de la base de datos. Tras
refrescar la caché, deja de aparecer en search y en las listas, pero el poll
delta no la envía en `removed_ids`: esos ids solo salen de filas que siguen
existiendo, con `updated_at` más reciente que `since`, y que han salido de la
vista (por ejemplo un complete por API o MCP). Los disparadores del watermark
`relay_meta` son solo INSERT/UPDATE. Solución: bórrala por la API o por MCP, o
recarga / pide un snapshot nuevo del inbox.

### Cursor — `.cursor/mcp.json`

Elige una de estas dos configuraciones.

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

Añade esta entrada dentro de `mcpServers`, en el archivo de configuración de Claude Desktop. La ruta de ese archivo depende del sistema operativo:

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

Si tu cliente admite URL de Streamable HTTP, puedes usar esta configuración en su lugar:

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

1. Arranca Relay con `pnpm dev`, o arranca solo el servidor.
2. Conecta el cliente de una de estas dos formas:
   - por Streamable HTTP, a `http://127.0.0.1:7420/mcp`;
   - por stdio, con `pnpm --filter @relay/server mcp:stdio` y la variable `RELAY_DB` definida.
3. Pide la lista de tools y llama a la que necesites con argumentos en JSON. Incluye siempre el actor (consulta la sección 3).
4. Lee el JSON estructurado del resultado de la tool (`structuredContent` / texto JSON).

---

## 3. Identidad del actor (`X-Relay-Actor`)

El actor es quien hace la acción. Las tools que modifican ítems exigen que el actor sea un agente del catálogo. El servidor busca el actor en este orden:

1. `actor.id` en los argumentos de la tool (`actor.type: "agent"` es opcional).
2. Si no lo encuentra, el argumento de texto `actor_id`.
3. Si tampoco lo encuentra, la cabecera HTTP `X-Relay-Actor: <agent-id>`.

Agentes del catálogo por defecto, con su abreviatura: `grok-bot` (GB), `dev-senior` (DS), `ux-designer` (UX), `redactor` (RD), `qa` (QA).

Reglas:

- Si falta el actor, el servidor devuelve `validation_error`.
- Si el identificador (id) de agente no está en el catálogo, el servidor devuelve `validation_error`.
- Si envías un id de usuario o `type: "user"` por MCP, el servidor rechaza la llamada. Esas acciones se hacen en la interfaz web.

Ejemplo de argumento:

```json
{ "actor": { "id": "grok-bot", "type": "agent" } }
```

---

## 4. Referencia de tools

La definición oficial de las tools está en `apps/server/src/mcp/tools.ts` → `createMcpTools()`.  
Las tools que modifican ítems comparten estos campos de actor: `actor?: { id: string; type?: "agent" }`, `actor_id?: string`.

Cómo leer las tablas:

- Tipos: string es texto; int es un número entero; datetime ISO es una fecha y hora en formato ISO 8601.
- Límites: en un int, «1–200» es el valor mínimo y máximo; en un string, «1–200», «≥3» o «≤280» indican su longitud en caracteres.
- «sí*»: obligatorio, salvo que envíes la cabecera `X-Relay-Actor`.
- *assignee*: el responsable asignado al ítem.
- `cursor`: la marca que indica dónde empieza la página siguiente.

Valores posibles:

Estados: `inbox` | `assigned` | `in_progress` | `blocked` | `needs_you` | `done` | `cancelled`  
Prioridades: `none` | `low` | `medium` | `high`  
Roles de nota: `context` | `reference` | `decision`  
Vistas de la bandeja (*inbox*): `attention` | `agent_wip` | `upcoming` | `done` | `all`

### `agents_list`

Lista los agentes del catálogo con presencia (`last_seen_at`, `active`) y `counts` de ítems asignados.

| Parámetro | Tipo | Obligatorio |
|-----------|------|-------------|
| — | — | — |

**Llamada:** `{}`  
**Respuesta:** `{ "agents": [ { "id", "display_name", "monogram", "last_seen_at", "active", "counts": { "needs_you", "blocked", "in_progress", "assigned", "done" } } ] }`

Ver [`docs/api/agents.md`](../api/agents.md).

### `agents_get`

Perfil del agente: campos de resumen más `current_items` y `handoffs` paginados (más recientes primero).
`after_seq` / `before_seq` / `limit` usan la misma validación que `items_events` /
`changes_list` (`parseEventPageQuery`; inválido → `validation_error`).

| Parámetro | Tipo | Obligatorio |
|-----------|------|-------------|
| `id` | string (agente) | sí |
| `after_seq` | int 0…MAX_SAFE_INTEGER | no |
| `before_seq` | int 0…MAX_SAFE_INTEGER | no |
| `limit` | int 1–200 | no (por defecto 50) |
| `current_items_limit` | int 1–200 | no (por defecto 10) |

**Llamada:** `{ "id": "agent-code" }`  
**Respuesta:** `{ "agent": { …resumen, "current_items": […], "handoffs": […], "handoffs_next_seq", "handoffs_has_more" } }`

`handoffs_next_seq` sigue la misma semántica que el `next_seq` de ítem (último seq de la página; vacío → cursor de la petición). Id desconocido → **`not_found`** (igual que HTTP `GET /api/agents/:id` **404**; `/mcp/invoke` responde HTTP 404 con `{ "error": "not_found", "message": "…" }`).

### `items_list`

Lista los ítems. La paginación es opcional.

| Parámetro | Tipo | Obligatorio | Por defecto |
|-----------|------|-------------|-------------|
| `limit` | int 1–200 | no | — (sin paginar; devuelve `{ items }`) |
| `cursor` | string | no | — |

**Llamada:** `{ "limit": 2 }`  
**Respuesta (datos de ejemplo):**

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

| Parámetro | Tipo | Obligatorio |
|-----------|------|-------------|
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

| Parámetro | Tipo | Obligatorio | Notas |
|-----------|------|-------------|-------|
| `title` | string 1–200 | sí | |
| `goal` | string ≤280 | no | |
| `status` | Status | no | por defecto, `inbox` |
| `assignee_type` | enum | no | |
| `assignee_id` | string\|null | no | obligatorio si el responsable es un agente |
| `due_at` / `reminder_at` | datetime ISO | no | |
| `reminder_intent` | string ≤80 | no | |
| `priority` | Priority | no | |
| `blocked_reason` / `needs_you_reason` | string ≥3 | no | obligatorio si el estado lo exige |
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

| Parámetro | Tipo | Obligatorio |
|-----------|------|-------------|
| `id` | string | sí |
| `title`, `goal`, `due_at`, `reminder_at`, `reminder_intent`, `priority`, `assignee_type`, `assignee_id`, `blocked_reason`, `needs_you_reason` | campos opcionales | no |
| `actor` / `actor_id` | — | sí* |

**Llamada:** `{ "id": "itm_p0se48sadp", "title": "MCP docs sample item (updated)", "actor": { "id": "grok-bot", "type": "agent" } }`  
**Respuesta:** `{ "item": { …, "title": "MCP docs sample item (updated)" } }`

### `items_set_status`

| Parámetro | Tipo | Obligatorio |
|-----------|------|-------------|
| `id` | string | sí |
| `status` | Status | sí |
| `blocked_reason` | string ≥3 | si `status=blocked` |
| `needs_you_reason` | string ≥3 | si `status=needs_you` |
| `actor` / `actor_id` | — | sí* |

Esta tool no sirve para sacar un ítem de `done`/`cancelled`. Para eso, usa `items_reopen`.

**Llamada:** `{ "id": "itm_p0se48sadp", "status": "in_progress", "actor": { "id": "grok-bot", "type": "agent" } }`  
**Respuesta:** `{ "item": { …, "status": "in_progress", "started_at": "2026-10-08T08:09:18.905Z" } }`

### `items_complete`

| Parámetro | Tipo | Obligatorio |
|-----------|------|-------------|
| `id` | string | sí |
| `actor` / `actor_id` | — | sí* |

**Llamada:** `{ "id": "itm_p0se48sadp", "actor": { "id": "grok-bot", "type": "agent" } }`  
**Respuesta:** `{ "item": { …, "status": "done", "completed_by_id": "grok-bot" } }`

### `items_reopen`

Reabre un ítem en `done` o `cancelled`. El ítem pasa a `assigned` si tiene responsable, o a `inbox` si no lo tiene.

| Parámetro | Tipo | Obligatorio |
|-----------|------|-------------|
| `id` | string | sí |
| `actor` / `actor_id` | — | sí* |

**Llamada:** `{ "id": "itm_p0se48sadp", "actor": { "id": "grok-bot", "type": "agent" } }`  
**Respuesta:** `{ "item": { …, "status": "assigned", "completed_at": null } }`

### `items_delegate`

Asigna el ítem a un agente: pone `assignee_type=agent`, `assignee_id` y `status=assigned`.

| Parámetro | Tipo | Obligatorio |
|-----------|------|-------------|
| `id` | string | sí |
| `agent_id` | string (id del catálogo) | sí |
| `actor` / `actor_id` | — | sí* |

**Llamada:** `{ "id": "itm_p0se48sadp", "agent_id": "grok-bot", "actor": { "id": "grok-bot", "type": "agent" } }`  
**Respuesta:** `{ "item": { …, "status": "assigned", "assignee_id": "grok-bot" } }`

### `items_ask_user`

Pone el ítem en `needs_you` con un motivo. **No cambia el responsable.**

| Parámetro | Tipo | Obligatorio |
|-----------|------|-------------|
| `id` | string | sí |
| `reason` | string ≥3 | sí |
| `actor` / `actor_id` | — | sí* |

**Llamada:** `{ "id": "itm_p0se48sadp", "reason": "¿Sigo con el borrador A o espero tu OK?", "actor": { "id": "grok-bot", "type": "agent" } }`  
**Respuesta:** `{ "item": { …, "status": "needs_you", "needs_you_reason": "¿Sigo con el borrador A o espero tu OK?" } }`

### `notes_create`

| Parámetro | Tipo | Obligatorio | Por defecto |
|-----------|------|-------------|-------------|
| `title` | string 1–200 | sí | |
| `body_md` | string ≤100000 | no | vacío |

**Llamada:** `{ "title": "Nota huérfana de ejemplo", "body_md": "Texto buscable sobre el lanzamiento de Relay." }`  
**Respuesta:** `{ "note": { "id": "nte_0wtjk5yrn1", "title": "Nota huérfana de ejemplo", "body_md": "…", "created_at": "…", "updated_at": "…" } }`

### `notes_get`

| Parámetro | Tipo | Obligatorio |
|-----------|------|-------------|
| `id` | string | sí |

**Llamada:** `{ "id": "nte_0wtjk5yrn1" }`  
**Respuesta:** `{ "note": { … }, "links": [] }`

### `notes_update`

| Parámetro | Tipo | Obligatorio | Notas |
|-----------|------|-------------|-------|
| `id` | string | sí | |
| `title` / `body_md` | opcionales | no | |
| `if_updated_at` | datetime ISO | no | concurrencia optimista: si la nota cambió después de esa fecha, la llamada falla con un conflicto |

**Llamada:** `{ "id": "nte_0wtjk5yrn1", "body_md": "Texto actualizado sobre el lanzamiento de Relay.", "if_updated_at": "2026-10-08T08:09:18.908Z" }`  
**Respuesta:** `{ "note": { …, "updated_at": "2026-10-08T08:09:18.912Z" } }`

### `notes_list`

| Parámetro | Tipo | Obligatorio | Por defecto |
|-----------|------|-------------|-------------|
| `limit` | int 1–200 | no | — (sin paginar; devuelve `{ notes }`) |
| `cursor` | string | no | |

**Llamada:** `{ "limit": 2 }`  
**Respuesta:** `{ "notes": […], "next_cursor": "…", "has_more": true, "total_count": 3 }`

### `notes_search`

Busca por texto en las notas **huérfanas**, es decir, sin enlace a ningún ítem. No devuelve notas enlazadas. Para buscar en ítems y en sus notas enlazadas, usa `search`.

| Parámetro | Tipo | Obligatorio | Por defecto |
|-----------|------|-------------|-------------|
| `q` | string ≥1 | sí | |
| `limit` | int 1–200 | no | todos los resultados |

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

| Parámetro | Tipo | Obligatorio | Por defecto |
|-----------|------|-------------|-------------|
| `item_id` | string | sí | |
| `note_id` | string | sí | |
| `role` | NoteRole | no | `"context"` |

**Llamada:** `{ "item_id": "itm_p0se48sadp", "note_id": "nte_0wtjk5yrn1", "role": "context" }`  
**Respuesta:** `{ "link": { "item_id": "itm_p0se48sadp", "note_id": "nte_0wtjk5yrn1", "role": "context" } }`

### `notes_unlink`

| Parámetro | Tipo | Obligatorio |
|-----------|------|-------------|
| `item_id` | string | sí |
| `note_id` | string | sí |

**Llamada:** `{ "item_id": "itm_p0se48sadp", "note_id": "nte_0wtjk5yrn1" }`  
**Respuesta:** `{ "ok": true }`

### `context_get`

Devuelve el paquete de contexto de un ítem, el mismo contenido en markdown, y los `item_events` recientes (de más antiguo a más reciente). El agente lo usa antes de trabajar en el ítem.

| Parámetro | Tipo | Obligatorio |
|-----------|------|-------------|
| `id` | string (ítem) | sí |
| `event_limit` | int 1–100 | no (por defecto 20) |

**Llamada:** `{ "id": "itm_maj7i9qv5r" }`  
**Respuesta:** `{ "context": { "item_id", "title", "goal", "status", "needs_you_reason", "notes": […], … }, "markdown": "# …", "events": [ { "seq", "type", "payload", … } ] }`

### `items_events`

Historial de eventos de un ítem (de más antiguo a más reciente). Usa `after_seq` para reanudar.

| Parámetro | Tipo | Obligatorio |
|-----------|------|-------------|
| `id` | string (ítem) | sí |
| `after_seq` | entero seguro 0…`Number.MAX_SAFE_INTEGER` | no (por defecto 0) |
| `limit` | int 1–200 | no (por defecto 100) |

**Llamada:** `{ "id": "itm_maj7i9qv5r", "after_seq": 0, "limit": 20 }`  
**Respuesta:** `{ "events": […], "next_seq": 6, "has_more": false }`

`next_seq` es el último `seq` de **esta página de este ítem** (pásalo como
`after_seq` siguiente del mismo ítem). No es la marca global — usa
`changes_list` / `seq` del inbox. `after_seq` / `limit` inválidos → error de tool.

### `inbox_query`

| Parámetro | Tipo | Obligatorio | Por defecto |
|-----------|------|-------------|-------------|
| `view` | InboxView | no | `"attention"` |
| `limit` | int 1–200 | no | |
| `cursor` | string | no | paginación |
| `after_seq` | int ≥0 | no | cursor delta preferido |
| `since` | string | no | sincronización incremental legacy |

**Llamada:** `{ "view": "attention", "limit": 2 }`  
**Respuesta:** `{ "view": "attention", "items": […], "counters": { "needs_you": 1 }, "total_count": 3, "next_cursor": "…", "has_more": true, "section_counts": {…}, "sections": […], "sync_cursor", "server_time", "seq" }`

Si pasas `after_seq` (preferido) o `since`, el resultado es un delta: solo los cambios (`upserts` / `removed_ids`), no una página completa. `seq` es la secuencia global de eventos más reciente.

### `changes_list`

Página global de `item_events` para sync / futuro SSE (`Last-Event-ID` ↔ `after_seq`).

| Parámetro | Tipo | Obligatorio |
|-----------|------|-------------|
| `after_seq` | entero seguro 0…`Number.MAX_SAFE_INTEGER` | no (por defecto 0) |
| `limit` | int 1–200 | no (por defecto 100) |

**Llamada:** `{ "after_seq": 0, "limit": 50 }`  
**Respuesta:** `{ "events": […], "next_seq": 12, "has_more": true }`

Aquí `next_seq` es el cursor de página global. `after_seq` / `limit` inválidos → error de tool.

Ver también [`docs/api/events.md`](../api/events.md).

### `search`

Busca ítems de trabajo por título, objetivo, motivos, intención del recordatorio y notas enlazadas.

| Parámetro | Tipo | Obligatorio | Notas |
|-----------|------|-------------|-------|
| `q` | string | no | texto de búsqueda |
| `status` | Status[] o string separado por comas | no | |
| `actor` | string[] o string separado por comas | no | filtra por responsable o actor |
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

| Parámetro | Tipo | Obligatorio | Por defecto |
|-----------|------|-------------|-------------|
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

## 5. Flujo típico del agente (de principio a fin)

1. **Recoger trabajo.** Usa `inbox_recommend`, o `inbox_query` con `view: "agent_wip"` / `"attention"`, o `search` con tu id de agente.
2. **Cargar el contexto.** Llama a `context_get` con el id del ítem. Lee el objetivo, las notas, los motivos y el recordatorio.
3. **Trabajar.** Pasa el ítem a `in_progress` con `items_set_status`. Actualiza campos y notas cuando haga falta (`notes_create` + `notes_link`).
4. **Marcar un bloqueo o preguntar al usuario.**
   - Si estás bloqueado, llama a `items_set_status` con `status: "blocked"` y un `blocked_reason` de 3 caracteres o más.
   - Si necesitas a David, llama a `items_ask_user` con un `reason`. El responsable no cambia.
5. **Esperar a que el usuario pulse «Devolver a …».** David pulsa «Devolver a {agente}» con una respuesta. El servidor (`POST /api/items/:id/answer`) crea una nota de decisión + evento `answered` (y `status_changed` → `assigned`) en una sola transacción. No hay herramientas MCP `items_answer` / `items_take`: consulta `inbox_query` / `items_get` hasta ver otra vez `assigned`, luego `context_get` para la nota de decisión y los eventos recientes.
6. **Completar.** Si hace falta, pasa el ítem a `in_progress` con `items_set_status`. Después, llama a `items_complete`.

Para probar el flujo, los datos de ejemplo ya incluyen un ítem que espera al usuario: «Elegir titular del post de lanzamiento» (`needs_you`).

---

## 6. Errores y cómo tratarlos

Los *handlers* de MCP (las funciones que ejecutan cada tool) lanzan dos tipos de errores: errores de dominio (reglas de Relay) y errores de Zod (la librería que valida los argumentos). Cada canal los devuelve de una forma:

- Por Streamable HTTP MCP, como resultado de tool con `isError` y el texto del mensaje.
- Por la API REST, como código de estado HTTP, mediante `handleError`.
- Por `/mcp/invoke`, los errores de dominio/Zod usan el mismo mapeo
  `{ "error": "<código>", "message": "…" }` (p. ej. `agents_get` con id
  desconocido → **404** `not_found`); el resto sigue como
  `{ "error": "<message>" }` con estado 400.

| Código / tipo | Mensaje típico | HTTP (API) | Qué debe hacer el agente |
|---------------|----------------|------------|--------------------------|
| `validation_error` | `blocked_reason is required (min 3 characters)` | 400 | Corregir los argumentos e incluir el motivo al pasar a blocked o needs_you |
| `validation_error` | `needs_you_reason is required (min 3 characters)` | 400 | Lo mismo que en la fila anterior |
| `validation_error` | `MCP actor required: …` | 400 | Pasar `actor.id` o la cabecera `X-Relay-Actor` |
| `validation_error` | `Unknown agent id: …` | 400 | Usar un id de agente del catálogo |
| `validation_error` | `MCP actors must be agents…` | 400 | No usar un actor de tipo usuario en MCP |
| `validation_error` | `Only done or cancelled items can be reopened` | 400 | Transición no válida: usar `items_reopen` solo en estados terminales |
| `validation_error` | `Use reopen to leave a terminal status` | 400 | Llamar a `items_reopen`, no a `items_set_status` |
| Errores de validación de Zod | Enum, tipo o longitud no válidos | 400 | Ajustar los argumentos a los esquemas de la sección 4 |
| `not_found` | `WorkItem not found: …` / `Note not found: …` | 404 | Obtener ids actualizados con list o search |
| `conflict` | `Note … was modified (expected updated_at=…)` + `current_updated_at` | **409** | Volver a leer con `notes_get`, fusionar los cambios y reintentar con un `if_updated_at` actualizado, u omitirlo para forzar la escritura |

Ejemplos reales de errores:

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

## Mantener esta guía

- Los encabezados de las tools deben tener la forma `### \`tool_name\`` y coincidir con `createMcpTools().map(t => t.name)`.
- Ejecuta `pnpm check:mcp-docs` cada vez que añadas o quites tools.
- Actualiza los ejemplos con `node scripts/capture-mcp-examples.mjs`.
