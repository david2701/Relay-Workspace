# Brief de producto v2.1 — Relay

**Nombre de trabajo:** Relay (supuesto; renombrable)  
**Posición:** Capa de trabajo compartido humano↔IA (pendientes + notas + handoff), no un clone de Reminders/Todoist.  
**Fase:** Local-first · calidad pro · simplicidad de uso diario  
**Dueño:** Producto → UI/UX → Dev Senior → QA  
**Estado:** Sustituye Task Hub v1 y Relay v2 inicial. UI/UX debe diseñar contra **este** documento.  
**Paths:** `/workspace/task-hub-brief-v2.md` (canónico) · espejo en `/workspace/task-hub-brief.md` y `/workspace/relay-brief-v2.md`

---

## 0) Por qué esto es «otro nivel» (obligatorio leer antes de diseñar)

| Reminders / Todoist | Relay |
|---|---|
| Lista personal de checkboxes | **Workspace de trabajo** donde David y sus agentes comparten la misma verdad |
| Completar = gesto humano | Completar / `needs_you` / `blocked` = **acto auditado** de humano o agente |
| Notas = texto pegado al ítem | **Notas de primera clase** + paquete de contexto que la IA consume vía MCP |
| El chat de IA es otro mundo | **MCP es superficie P0** igual que la web: el chat *escribe* el sistema |
| Due = fecha | **Recordatorio con intención** (cuándo + por qué + qué contexto mostrar) |
| Prioridad manual siempre | **Inbox inteligente**: qué te necesita, qué está atascado, qué cerrar |
| App bonita aislada | Loop cerrado: pedir en chat → existe en Relay → IA avanza → se ve en todas partes |

**Frase norte (no negociable en P0):**  
Si David pide algo a una IA y la IA lo termina (o se atasca), Relay lo refleja solo — con contexto, actor y siguiente paso — en web (y luego Mac/móvil).

Si un diseño o un ticket no refuerza ese norte, es nice-to-have o OUT.

---

## 1) Problema, usuario, éxito

### Problema
David no necesita otra lista. Necesita **continuidad de trabajo** entre conversación con IAs y un sistema serio de pendientes/notas:
- Lo pedido en chat no muere en el hilo.
- La IA no re-pregunta lo que ya estaba en una nota.
- Él ve qué hacen los agentes, qué le piden, qué venció — en un solo sitio.
- La UI se siente producto profesional, no MVP generativo.

### Usuario
David — un usuario, varias IAs (Grok Bot + equipo). Español en producto; API/código en inglés.

### Jobs
1. Capturar y delegar sin fricción.  
2. Empaquetar contexto (notas + definición de hecho) al agent.  
3. Recuperar atención solo cuando hace falta (`needs_you`).  
4. Confiar en que «hecho en el chat» = «hecho en Relay».

### Éxito local (medible)
- Un store · Web+MCP P0 usables y pro · loop humano↔IA cerrado (AC estrella) · notas vinculadas útiles a la IA · inbox que prioriza atención · Mac/móvil no bloquean el wow.

### Anti-éxito
Todo list + CRUD MCP. Estados solo open/done. Notas textarea muerto. UI genérica. MCP apuntando a otro almacén.

---

## 2) P0 «wow usable» vs nice-to-have

### P0 — Wow usable (debe emocionar en demo local)
1. **Work items con estados de colaboración** (no checkbox pobre).  
2. **Notas de primera clase** + vínculo nota↔ítem + `context_get` para la IA.  
3. **Handoff visible:** assignee + actor del último cambio + reasons en blocked/needs_you.  
4. **Inbox unificada inteligente** (vistas de atención + recomendaciones heurísticas).  
5. **Recordatorios con intención** (due + reminder + propósito/contexto).  
6. **MCP de primera clase** (items, notes, context, inbox/recommend, status).  
7. **Web profesional** (captura rápida + detalle rico sin aparentar plantilla).  
8. **Loop demo:** chat crea/avanza/completa → web lo muestra (≤2s o refresh inmediato).

### P1 — Nice-to-have inmediato (no diluir P0)
- Mac app misma API.  
- Listas/proyectos + tags + búsqueda full-text.  
- Notificaciones OS del `reminder_at`.  
- Activity strip / timeline ligera por ítem.  
- Plantillas de delegación («investigar», «escribir», «fix»).

### P2
- Móvil iOS primero (S2).  
- Reminder triggers avanzados (p.ej. «cuando el agent cierre X» — S11).  
- Standing context packs reutilizables.  
- Recomendaciones más ricas / deferir/split.

### OUT (realista)
- Multi-user / permisos / equipos.  
- Deploy en servidor de David (fase posterior).  
- Calendario completo / GTD ortodoxo / kanban avanzado / subtareas infinitas.  
- Notion-clone (DBs, bloques vivos).  
- IA embebida en la app (entra por MCP/chat).  
- Slack/email.  
- Sync multi-master con UI de conflictos (S8: single-machine local).

**Inclusiones deliberadas vs OUT típico:** ninguna excepción multi-user/server. La única «inclusión ambiciosa» en P0 es **recomendaciones heurísticas + needs_you** — justificadas porque son el diferenciador de inbox inteligente sin ser ML (S7).

---

## 3) Conceptos de producto

### Work item (unidad de trabajo)
Intención rastreable con dueño, estado de colaboración, definición de hecho (`goal`), recordatorio con intención, y notas de contexto.

### Nota (primera clase)
Documento markdown corto/medio, existe solo, se **vincula** a ítems con rol (`context` | `reference` | `decision`). No es un campo `notes` escondido.

### Paquete de contexto (para IA)
Lo que `context_get` devuelve: title, goal, status/reason, assignee, due/reminder+propósito, notas linkadas. Eso evita re-explicar.

### Handoff
Cambio de assignee o status que implica paso de testigo (user→agent, agent→user vía `needs_you`, agent→done).

### Inbox inteligente
No es «todas las tareas»: es **qué merece atención ahora** (te necesita, atascado, reminder/due cercano, WIP agent stale).

### Recordatorio con intención
Más que fecha:
- `due_at` — compromiso de cuándo debería estar listo.  
- `reminder_at` — cuándo interrumpir.  
- `reminder_intent` (string corto) — *por qué* te aviso («revisar borrador del agent», «llamar antes de la demo»).  
- Supuesto S12: en P0 el intent es texto; la UI lo muestra junto al reminder; la notificación OS (P1) puede usar ese texto.

---

## 4) Modelo de datos mínimo

### WorkItem
- `id`, `title`  
- `goal` (DoD corto; AC largos van en notas)  
- `status`: `inbox` | `assigned` | `in_progress` | `blocked` | `needs_you` | `done` | `cancelled`  
- `assignee_type`: `user` | `agent` | `unassigned`  
- `assignee_id`  
- `due_at`, `reminder_at`, `reminder_intent`  
- `priority`: `none` | `low` | `medium` | `high`  
- `blocked_reason` (req. si blocked)  
- `needs_you_reason` (req. si needs_you)  
- `source`: `ui` | `mcp` | `system`  
- `created_at`, `updated_at`, `started_at`, `completed_at`  
- `completed_by_type`, `completed_by_id`  
- `last_actor_type`, `last_actor_id`  
- `list_id` (P1)

### Note
- `id`, `title`, `body_md`, `created_at`, `updated_at`

### ItemNoteLink
- `item_id`, `note_id`, `role`: `context` | `reference` | `decision`

### Recommendation (efímero OK)
- `item_id`, `reason`, `score` — salida de heurística

**Estados — semántica**
- `inbox` — capturado  
- `assigned` — tiene dueño, no started  
- `in_progress` — en curso  
- `blocked` — no avanza (externo/dep.); reason obligatoria  
- `needs_you` — la bola es de David; reason obligatoria (**prioridad visual**)  
- `done` / `cancelled` — terminales  

---

## 5) Superficies

| Superficie | Pri | Rol |
|---|---|---|
| API + store local | P0 | Verdad única |
| MCP | P0 | Superficie IA — ventaja central |
| Web | P0 | Inbox + detalle + notas + prueba del loop |
| Mac | P1 | Desktop always-on |
| Móvil | P2 | Atención / complete |

### MCP P0 (contrato orientativo)
- Items: `items_list`, `items_get`, `items_create`, `items_update`, `items_set_status`, `items_complete`, `items_reopen`  
- Notas: `notes_create`, `notes_get`, `notes_update`, `notes_list`, `notes_link`, `notes_unlink`  
- Contexto: `context_get`  
- Intel: `inbox_query` (vista), `inbox_recommend` (top N + reasons)  
- Atajos de handoff (opcional P0 si simplifica agents): `items_delegate` (assignee agent + status assigned), `items_ask_user` (= needs_you + reason)

**Protocolo agentes (orquestador)**  
crear/delegar → `context_get` → `in_progress` → trabajar → `done` **o** `needs_you`/`blocked` con razón. Nunca «hecho solo en el chat».

---

## 6) UX — principios para UI/UX (sin wireframes)

1. Home = **Inbox de atención**, no inventario infinito.  
2. Captura en un suspiro; riqueza al abrir el detalle.  
3. Actor siempre visible (David vs nombre de agent).  
4. `needs_you` imposible de pasar por alto (sin gritar).  
5. «Añadir contexto» (nota) es gesto natural al delegar.  
6. Reminder muestra **intent**, no solo reloj.  
7. Anti-genérico: tipografía, densidad, empty states, microcopy ES con criterio.  
8. Honestidad de sync: ≤2s o refresh explícito en P0 (S4).

---

## 7) Criterios de aceptación

**AC1 Fuente única** — create web↔MCP idéntico en campos canónicos.  
**AC2 Estados ricos** — enum completo en UI+MCP; blocked/needs_you exigen reason.  
**AC3 Loop IA (estrella)** — agent in_progress → complete → web `done`+actor; variante `needs_you` cae en inbox de atención.  
**AC4 Notas 1ª clase** — nota independiente, link/unlink, visible en detalle.  
**AC5 Briefing IA** — `context_get` incluye goal + notas + reasons + reminder_intent.  
**AC6 Inbox inteligente** — vistas needs_you / agent WIP / upcoming / done; contadores coherentes tras MCP.  
**AC7 Recommend** — `inbox_recommend` + bloque UI con reason cuando hay needs_you, blocked, due/reminder cercano o WIP stale (umbral S13).  
**AC8 Recordatorio con intención** — persistir due + reminder_at + reminder_intent; UI los muestra; upcoming los usa. (Push OS = P1.)  
**AC9 Captura rápida** — crear solo con título en UI percibido <3s; MCP create equivalente.  
**AC10 Identidad** — actors agent ≠ user siempre.  
**AC11 Local + arranque** — API+MCP+web documentados en local.  
**AC12 Gate pro** — rechazo si parece Todoist genérico, estados pobres, notas muertas, MCP desalineado, UI plantilla.  
**AC13 Handoff** — al cambiar assignee/status via MCP, last_actor_* actualiza; UI detalle lo refleja.  
**AC14 Reopen** — limpia completed_*; conserva last_actor / historial mínimo.

---

## 8) Supuestos y riesgos

**Supuestos**  
- S1 Un humano (David).  
- S2 Móvil iOS antes quAndroid.  
- S3 Notas = markdown plano.  
- S4 P0 refresh ≤2s OK; realtime después.  
- S5 Nombre Relay provisional.  
- S6 Agentes tendrán MCP Relay configurado.  
- S7 Recommend = heurísticas, no ML.  
- S8 Single-machine local; API lista a sync futuro sin construirlo.  
- S9 `goal` corto; AC largos en notas.  
- S10 UI en español; ids/API en inglés.  
- S11 Triggers tipo «cuando cierre X» = P2.  
- S12 `reminder_intent` texto libre corto en P0.  
- S13 WIP stale = in_progress sin update > N horas (N configurable; default 24h — supuesto).

**Riesgos**  
- R1 Regresar a Todoist+MCP → mitigación: AC3/5/7/8/12 no negociables.  
- R2 Exceso de estados → UI contextualiza; MCP enum completo.  
- R3 Notas se inflan a Notion → OUT explícito.  
- R4 Agents no cierran estados → skill orquestador + demo AC3 cada release.  
- R5 Tres clientes diluyen → P0 solo Web+MCP+API.  
- R6 «Pro» subjetivo → UI/UX fija anti-genérico; AC12.

---

## 9) Siguiente dueño

1. **UI/UX** — contra este v2.1: inbox de atención, detalle+handoff+actors, notas/contexto, reminder con intent, captura, empty states, microcopy ES, anti-genérico. Mac/móvil solo IA de info.  
2. **Dev Senior** — store+API+MCP+Web.  
3. **QA** — AC1–AC14, peso en AC3/5/7/12.  
4. **Producto** — review specs/demo; P1 tras P0 wow estable.

— Producto
