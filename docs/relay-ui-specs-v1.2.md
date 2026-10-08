# Relay — Specs UI/UX v1.2 · Mejoras: fecha y hora, filtros, markdown en notas

| Campo | Valor |
|---|---|
| Versión | **v1.2** (parche incremental sobre v1.1; no la sustituye) |
| Fecha | 2026-10-08 |
| Commit base | `e1bb5e5` · repo `dvx/relay` (Cursor Origin, lectura) |
| Relación con v1.1 | Amplía §1.3 (Recordatorio), §1.4 (notas markdown), §4.8–4.9 (copy y fechas), §6.5 (ItemList), §6.9 (DueChip) y **sustituye** §6.18 (FilterBar). El resto de v1.1 sigue vigente sin cambios. |
| Autor → Para | UI/UX → Dev Senior (implementa) → QA (verifica) → Producto (revisa §5) |
| Idioma | UI en español; tokens, props, campos, parámetros y endpoints en inglés |

**Sistema bloqueado (no se toca):** layout de 3 zonas (rail `--rail-w`, lista densa, detalle `--detail-w`), teclado primero, «el testigo» (ActorMark círculo/cuadrado + regla 2 px `--attention-rule` solo en `needs_you`), pantalla Atención, Schibsted Grotesk + IBM Plex Mono, neutros hue 85 + cobalto hue 258, estados ricos con `blocked_reason`/`needs_you_reason` separados, `reminder_intent`, notas N:M + `context_get`, SuggestedStrip, «Ahora no» en `sessionStorage`. Nada de chatbot, robots, ✨ ni look shadcn por defecto.

## Contrato de handoff

1. **Para:** Dev Senior.
2. **Objetivo:** sustituir el selector nativo de fecha por uno propio y agrupar la lista por fecha; dar a la lista búsqueda y filtros combinables y compartibles por URL; renderizar y editar notas en markdown seguro.
3. **Hecho cuando:** pasan los criterios V12-D*, V12-F* y V12-M* (§1.10, §2.9, §3.9) en claro y oscuro, `scripts/contrast-matrix.mjs` sale con código 0 tras añadir los tokens de §0.3, y los criterios v1.1 (§7) siguen pasando.
4. **No hacer:** rediseñar el shell, el rail o Atención; vista calendario; recurrencias; tags inventados; editor WYSIWYG o por bloques; HTML crudo en notas; IA o chat dentro de la app.
5. **Adjuntar:** capturas 1440 px claro/oscuro del picker abierto, de Todo agrupado por fecha, de una búsqueda con coincidencia en nota y de una nota con todos los elementos markdown; salida de la matriz de contraste; vídeo corto del flujo `/` → escribir → `Enter` → `J/K`.

---

## 0. Contexto verificado en el repo (commit `e1bb5e5`)

### 0.1 Lo que hay hoy (y condiciona estas specs)

| Tema | Estado en el repo | Consecuencia en v1.2 |
|---|---|---|
| Selector de fecha | `apps/web/src/components/DateTimeField.tsx`: botón + popover con `<input type="date">` y `<input type="time">` nativos; si no hay hora guarda `00:00`; pista fija «· 24 h · Europe/Paris». | Se sustituye por `DateTimePicker` (§1). El `00:00` por defecto hace que una fecha sin hora venza al empezar el día: se corrige (§1.3.5). |
| Zona horaria | `lib/format.ts` usa `DISPLAY_TZ = "Europe/Paris"` y `wallParisToIso()`. En servidor, `packages/core/src/domain/time.ts` usa `setHours()` (hora local de la máquina). | Toda frontera de día/semana se calcula en Europe/Paris en cliente **y** servidor (§1.3.4). |
| Filtro | Un input `#view-filter` («Filtrar por título»); `/` lo enfoca; `matchesFilter()` en `lib/view_model.ts` solo mira `title`. Sin router ni estado en URL. | §2 lo sustituye. Estado en URL con History API, sin librería de router. |
| Búsqueda en servidor | No existe endpoint de búsqueda. Hay `GET /api/items`, `GET /api/notes`, `GET /api/items/:id/links`. | Se propone `GET /api/search` (§2.3.6). |
| Etiquetas / tags | **No existen** en el modelo (`WorkItem` no tiene `labels`/`tags`). Solo `list_id`, siempre `null` (P1). | La faceta Etiquetas se especifica como **condicional** (§2.3.2). |
| Notas | `Note = { id, title, body_md (≤100 000), created_at, updated_at }`. **Sin autor.** No hay vista ni editor de nota: `api.updateNote` no se usa; las tarjetas muestran `body_md` en crudo recortado. | §3 define `NoteView`/`NoteEditor`. La procedencia con ActorMark queda condicionada a que exista el dato (§3.3.4). |
| Dependencias web | `react`, `react-dom`, `@phosphor-icons/react`. Sin librería de fechas ni de markdown. | Fechas: solo `Intl` (suficiente). Markdown: se recomienda `react-markdown` + `remark-gfm` (§4). |
| Teclado global | `App.tsx` escucha `keydown` en `window`; ignora solo `INPUT`/`TEXTAREA`/`contentEditable`. `Esc` deselecciona el ítem aunque haya un popover abierto; `↑/↓` mueven la selección de la lista desde cualquier foco que no sea input. | Riesgo de colisión con la rejilla del calendario y los popovers (§4.2). |
| Actores | `USER_ACTOR_ID = "david"`; agentes del catálogo: `grok-bot` (GB), `dev-senior` (DS), `ux-designer` (UX), `redactor` (RD), `qa` (QA). | La URL usa el `id` del actor, no el monograma (los monogramas son ajustables). |

### 0.2 Atajos: auditoría de colisiones (v1.1 §6.1 + `App.tsx`)

| Tecla | Uso actual | Uso v1.2 | Veredicto |
|---|---|---|---|
| `/` | Enfocar filtro de la vista | Enfocar **búsqueda** (mismo gesto, más alcance) | Sin colisión |
| `F` | Libre | Abrir menú de facetas **Filtros** | Libre en v1.1 y repo |
| `T` / `Shift+T` | Libre (`T` solo existe tras `G`, como `G T` = Todo) | Abrir selector «Para cuándo» / «Avisarme» del ítem seleccionado | Libre fuera de la secuencia `G` (ventana de 800 ms) |
| `E` | Editar título del ítem | En la vista de nota: editar el cuerpo | Por contexto: el foco decide |
| `⌘K` | Reservado en v1.1 §8.1 para la paleta/búsqueda P1 | Solo dentro del editor de nota: insertar enlace | Colisión gestionada: el editor hace `preventDefault` + `stopPropagation`; fuera del editor `⌘K` sigue reservado |
| `⌘Enter` | Guardar textos multilínea / confirmar motivo | Terminar edición de nota | Coherente |
| `Esc` | Cierra atajos → vacía captura → **deselecciona ítem** | Debe cerrar primero el popover o menú abierto | **Colisión real en el código**: corregir la cadena (§4.2) |
| `↑ ↓ ← →`, `Home`, `End` | Mover selección de lista | Navegar rejilla, menús y listas internas | **Colisión real**: el handler global debe ignorar eventos dentro de `[role=dialog]`, `[role=grid]`, `[role=listbox]`, `[role=menu]` |
| `Espacio` | Completar ítem | Marcar una casilla de checklist enfocada | Seguro solo con `<input type="checkbox">` nativo (el guard ya ignora `INPUT`); prohibido un checkbox hecho con `<span role=checkbox>` |

### 0.3 Tokens nuevos propuestos

Todos van en `docs/tokens.css` **y** en `apps/web/src/styles/tokens.css` (hoy son copias idénticas, blob `c11b435`). Ninguno introduce un tono nuevo: se respeta el gate v1.1 §5.1 #3.

| Token | Claro | Oscuro | Uso | Contraste comprobado (WCAG 2.x) |
|---|---|---|---|---|
| `--control-h` | `32px` | = | Alto de triggers e inputs del detalle, celdas del calendario, campo de búsqueda (hoy es un `32px` literal en `DateTimeField.css`) | — |
| `--chip-h` | `24px` | = | Chips de filtro (v1.1 §6.18 ya decía 24 px) | — |
| `--section-h` | `28px` | = | Cabecera de sección o grupo de la lista (v1.1 §6.5 ya decía 28 px) | — |
| `--row-h-snippet` | `68px` | = | Fila con línea de motivo **y** línea de coincidencia | — |
| `--picker-w` | `420px` | = | Ancho del popover del selector | — |
| `--menu-w` | `280px` | = | Menú de facetas | — |
| `--step-h3` | `0.9375rem` (15 px) | = | H2 dentro de notas (rol h3 de la escala de app) | — |
| `--mark-bg` | `var(--line-strong)` = `#C1BDB7` | `var(--line-strong)` = `#4A4742` | Fondo del resaltado de coincidencias (siempre con peso 600, nunca solo color) | `--ink` sobre él: **9.01** / **7.55** · `--ink-2`: 4.51 / 4.94 (AA) · frente a `--paper`: 1.79 / 2.01 · frente a `--accent-tint` (fila seleccionada): 1.64 / 1.55 → por eso el peso 600 es obligatorio |
| `--scrim` | `rgb(20 19 16 / .24)` | `rgb(5 5 4 / .56)` | Fondo tras la hoja inferior en ventanas estrechas (formaliza el valor de v1.1 §6.1) | Decorativo |

Pares existentes que v1.2 reutiliza en contextos nuevos (calculados sobre los hex de `docs/tokens.css`): `--on-accent`/`--accent` 5.96 / 7.56 (día elegido) · `--focus`/`--raised` 4.91 / 7.90 (anillo de foco con offset) · `--crit`/`--raised` 5.99 / 6.91 (error de parseo, fecha vencida) · `--warn`/`--raised` 5.63 / 9.24 (avisos suaves) · `--ink-muted`/`--sunken` 4.91 / 7.28 (etiqueta de lenguaje en bloques de código) · `--ink`/`--sunken` 15.07 / 15.87 (código) · `--accent-ink`/`--raised` 6.92 / 9.41 (enlaces) · `--control`/`--raised` 3.91 / 3.20 (borde de casilla, ≥3:1).

---

## 1. Spec D — Selector de fecha y hora propio + agrupación por fecha

### 1.1 Objetivo

Elegir «Para cuándo» (`due_at`) y «Avisarme» (`reminder_at`) en ≤2 pulsaciones con atajos, o escribiendo («mañana 9»), sin el control nativo del navegador; siempre en hora de París. Y que Todo se lea por fecha sin convertir Relay en una agenda.

### 1.2 Anatomía

```
 PARA CUÁNDO                         ← label (--step-label, caps, --ink-muted) + icono calendario 14
┌──────────────────────────────┐
│ vie 9 oct 2026 · 09:00     ▾ │     ← trigger: input combobox, --control-h, mono --step-data
└──────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐  ← popover --picker-w, --raised,
│ [mañana 9                                                ]   │     borde 1px --line-strong, --radius-md
│ → vie 9 oct 2026 · 09:00                     hora de París   │  ← vista previa mono (pista tz condicional)
├───────────────────────┬──────────────────────────────────────┤
│ Hoy           jue 8   │  ‹   octubre 2026   ›                │
│ Esta tarde    18:00   │  L   M   X   J   V   S   D           │
│ Mañana   vie 9 09:00  │            1   2   3   4             │
│ Fin de semana  sáb 10 │  5   6   7  [8]  ⬛9  10  11          │  ← [8] hoy · ⬛9 elegido
│ Próx. semana  lun 12  │  12  13  14  15  16  17  18          │
│ Sin fecha             │  …                                   │
├───────────────────────┴──────────────────────────────────────┤
│ Hora [09:00 ▾]   ☐ Sin hora               Quitar fecha  [Listo] │
└──────────────────────────────────────────────────────────────┘
```

- **Trigger** (`DateTimePicker`): input `role=combobox` de alto `--control-h`, fondo `--sunken`, borde 1 px `--control`, radio `--radius-sm`, padding `0 var(--space-3)`, texto mono `--step-data` `tabular-nums`. Vacío: «Sin fecha» / «Sin aviso» en `--ink-muted`. Chevron de 12 px a la derecha.
- **Popover**: anclado bajo el trigger y alineado a su borde derecho; crece hacia la izquierda sobre la lista (el detalle está a la derecha). Si no cabe debajo, se abre encima. Se monta en portal sobre el detalle. Padding `--space-3`, gap `--space-3`, sombra `--shadow-float` (oscuro: sin sombra, borde `--line-strong`).
- **Columna de atajos** (160 px): botones de alto `--control-h`; nombre en `--step-meta` `--ink`, fecha resuelta en mono `--step-data` `--ink-muted` alineada a la derecha.
- **Calendario**: cabecera de mes (`--step-meta` 600) con «Mes anterior» y «Mes siguiente» (iconos de 16 px, botones de `--control-h`); fila de días L M X J V S D (`--step-label` caps `--ink-muted`); rejilla de 7 columnas × `--control-h`, números en mono `--step-data`. **Solo se pintan los días del mes visible**; las celdas fuera de mes quedan vacías.
- **Pie**: campo Hora (combobox mono, ancho 9ch) · casilla «Sin hora» (solo en «Para cuándo») · «Quitar fecha» (enlace) · «Listo» (botón secundario).

### 1.3 Comportamiento

#### 1.3.1 Atajos (resolución exacta, Europe/Paris)

Ejemplo de referencia: **ahora = jueves 8 oct 2026, 09:19**.

| Atajo | Campo | Resuelve a | Ejemplo | Visible cuando |
|---|---|---|---|---|
| Hoy | Para cuándo | Hoy, **sin hora** | jue 8 oct | Siempre |
| Esta tarde | ambos | Hoy 18:00 | jue 8 oct · 18:00 | Ahora < 17:30 |
| Mañana | ambos | Mañana 09:00 | vie 9 oct · 09:00 | Siempre |
| Este fin de semana | ambos | Sábado próximo 10:00 | sáb 10 oct · 10:00 | De lunes a viernes |
| Próxima semana | ambos | Lunes siguiente 09:00 | lun 12 oct · 09:00 | Siempre (en domingo, «lunes siguiente» = mañana) |
| En 1 hora | Avisarme | Ahora + 60 min, redondeado **hacia arriba** al cuarto de hora | jue 8 oct · 10:30 | Siempre |
| Antes de que venza | Avisarme | `due_at` − 1 h, redondeado hacia abajo al cuarto de hora; si `due_at` no tiene hora: ese día 09:00 | — | Solo si hay `due_at` futuro |
| Sin fecha / Sin aviso | ambos | Borra el valor (`null`) | — | Solo si hay valor |

Un atajo **confirma y cierra** en un solo gesto. No se muestran atajos que resolverían en el pasado.

#### 1.3.2 Texto en lenguaje natural (alcance cerrado)

El usuario escribe en el propio trigger. Mayúsculas y tildes dan igual («manana» = «mañana»). Formato: `[día] [hora]`, en ese orden; ambos son opcionales, pero hace falta al menos uno.

| Tipo | Formatos aceptados | Resultado (ahora = jue 8 oct 2026 09:19) |
|---|---|---|
| Día relativo | `hoy`, `mañana`, `pasado mañana` / `pasado` | `pasado` → sáb 10 oct |
| Día de la semana | `lun mar mié jue vie sáb dom` y nombres completos | Próxima aparición **sin contar hoy**: `jue` → jue 15 oct |
| Desplazamiento | `+Nd`, `+Nsem`, `+Nh`, `+Nmin` | `+3d` → dom 11 oct (hora por defecto) · `+2h` → jue 8 oct 11:19 |
| Fecha | `15/10`, `15-10`, `15/10/2026`, `15 oct`, `15 octubre` | Sin año: próxima aparición futura (`3/1` → 3 ene 2027) |
| Hora | `14:30`, `14.30`, `14h`, `9h`, `a las 9`, y número suelto **detrás de un día** (`mañana 9`) | 24 h. Hora sola (`14:30`): hoy; si ya pasó, mañana |
| Atajos escritos | `esta tarde`, `finde`, `fin de semana`, `próxima semana` | Igual que en §1.3.1 |
| Borrar | `sin fecha`, `ninguna`, o campo vacío + `Enter` | `null` |

- **Hora por defecto** cuando solo hay día: «Para cuándo» → sin hora; «Avisarme» → 09:00.
- **Número suelto sin día** (`15`): no se interpreta y aparece el mensaje «¿Hora o día?» (§1.10).
- **No se aceptan**: am/pm, inglés, «dentro de 3 días», «el martes por la tarde», rangos ni recurrencias. Muestran el error de parseo con ejemplos.
- **Vista previa**: cada pulsación actualiza la línea `→ vie 9 oct 2026 · 09:00` en mono bajo el input. Sin debounce: el parseo es local y tarda <1 ms. Válida: `--ink-2`. Inválida: borde del trigger en `--crit` y mensaje `--crit` `--step-meta`. `Enter` con texto inválido no hace nada.
- Al abrir con un valor existente, el input muestra ese valor formateado y lo selecciona entero: escribir lo reemplaza.

#### 1.3.3 Calendario y hora

- Semana de **lunes a domingo**. Hoy: número en 600 + barra inferior de 2 px `--ink-2` y 12 px de ancho. Día elegido: fondo `--accent`, texto `--on-accent`, radio `--radius-sm`. Hover: fondo `--sunken`.
- Clic en un día: fija la fecha y conserva la hora previa (o la hora por defecto). No cierra: el foco pasa a Hora. «Listo», `Enter` o clic fuera confirman.
- **Hora**: combobox con lista de pasos de 15 min (00:00–23:45), desplazada hasta la hora del valor. Se puede escribir cualquier minuto (`1437`, `14:37`, `14`). En el campo, `↑/↓` = ±15 min y `Shift+↑/↓` = ±1 h.
- «Sin hora» (solo en «Para cuándo») desactiva el campo Hora y guarda la fecha como «sin hora» (§1.3.5).

#### 1.3.4 Zona horaria

- **Almacenamiento**: ISO 8601 en UTC (`2026-10-09T07:00:00.000Z` = vie 9 oct 09:00 CEST). **Presentación** y cálculo de fronteras (hoy, mañana, semana): siempre `Europe/Paris`, sea cual sea la zona del navegador o del servidor.
- **Pista de zona** «hora de París»: aparece en la vista previa y en el tooltip del trigger **solo si** la zona del navegador (`Intl.DateTimeFormat().resolvedOptions().timeZone`) no es `Europe/Paris`, o si la hora elegida cae en un cambio de hora. Se retira la pista fija actual «· 24 h · Europe/Paris».
- **Cambios de hora** (regla «compatible», como Temporal):
  - Hora que no existe (28 mar 2027, 02:00–02:59): avanza lo que dura el salto (02:30 → 03:30) y se avisa.
  - Hora repetida (25 oct 2026, 02:00–02:59): se toma la primera aparición (UTC+2) y se avisa.
  - Hoy `wallParisToIso()` resuelve el hueco con un cálculo aproximado (`hour - 1`). Debe seguir esta regla y tener tests con ambas fechas.

#### 1.3.5 Fecha sin hora y relación con `reminder_intent`

- El modelo solo tiene `due_at` (fecha y hora). **Convención v1.2:** «sin hora» = **23:59:00 Europe/Paris** de ese día. La UI oculta la hora cuando el valor de pared es exactamente 23:59 y lo trata como «sin hora». Así un ítem «para hoy» no vence hasta medianoche; con el código actual vencería a las 00:00. Pregunta abierta P1 en §5.
- `reminder_at` **siempre lleva hora**: un aviso sin hora no tiene sentido.
- Al confirmar un aviso sin `reminder_intent`, el foco pasa al campo «Para qué» y se mantiene el aviso suave de v1.1 §1.3. Si `reminder_at` es posterior a `due_at`, aparece un aviso suave `--warn` que no bloquea.
- Quitar la fecha límite no borra el aviso, y quitar el aviso no borra `reminder_intent` (v1.1 ya permite intent sin aviso).

#### 1.3.6 Fechas pasadas, edición y guardado

- **Pasado permitido**, nunca bloqueado. «Para cuándo» en el pasado muestra el aviso `--warn` «Esta fecha ya pasó…» y, al guardar, el ítem cae en «Vencidas». Los días pasados del calendario van en `--ink-muted` y siguen siendo seleccionables.
- **Confirmar**: atajo, `Enter` con texto válido, «Listo» o clic fuera. **`Esc` cancela** lo cambiado en esa apertura y restaura el valor previo. Una sola llamada `PATCH /api/items/:id` por confirmación (optimista).
- **Guardado**: el trigger muestra «…» con `aria-busy` hasta la respuesta; luego aparece «Guardado» 1 s en mono junto al label (v1.1 §1.3). Si falla: «No se guardó el cambio. Reintentar» en `--crit` y vuelta al valor anterior.
- **Conflicto**: si un agente cambia la fecha con el popover abierto, no se pisa la edición; debajo aparece «{agente} cambió este campo · Ver su versión» (v1.1 §1.3, punto 5).
- **Solo lectura** (sin popover ni chevron, `aria-readonly`): ítems `done`/`cancelled` (tooltip «Reabre el ítem para cambiar la fecha») y la vista «Lo que ve el agente». No hay estado especial «puesto por un agente»: el modelo no guarda la autoría por campo.
- **Deshabilitado**: offline (v1.1 §1.7), con opacidad 0.45 y tooltip «Sin conexión con la API local».

#### 1.3.7 Movimiento y ventana estrecha

- Apertura: desde el trigger (`transform-origin` en el ancla), `opacity 0→1` + `scale(0.96→1)`, `--dur-fast` (120 ms) con `--ease-out`. Cierre: 85 ms (70 %) con `--ease-exit`. Cambio de mes, foco entre días y vista previa: instantáneos (frecuencia constante). Con `prefers-reduced-motion: reduce`: solo opacidad, sin escala.
- **Ventana estrecha** (viewport < 768 px, o espacio libre < `--picker-w` + 2 × `--space-4`): hoja inferior a todo el ancho sobre `--scrim`, en una sola columna (input → atajos en rejilla de 2 columnas → calendario con celdas de 40 px → hora) y pie fijo con «Quitar» y «Listo». Entra con `translateY(16px→0)` en `--dur-overlay`; con movimiento reducido, solo opacidad. Mantiene `role=dialog`, aquí con `aria-modal="true"` y foco atrapado.

### 1.4 Estados

| Estado | Trigger | Popover | Notas |
|---|---|---|---|
| Vacío | «Sin fecha» / «Sin aviso» en `--ink-muted` | — | — |
| Hover | Borde `--line-strong`, 120 ms | — | Solo con `(hover:hover) and (pointer:fine)` |
| Focus-visible | Anillo 2 px `--focus`, offset 2 px | — | Nunca `outline:none` sin sustituto |
| Abierto | `aria-expanded=true`, borde `--control` | Visible; foco según §1.5 | — |
| Con valor | Mono `--ink`: `vie 9 oct 2026 · 09:00` / `jue 8 oct 2026` (sin hora) | Día marcado | — |
| Escribiendo, válido | Texto del usuario | Vista previa `--ink-2` | — |
| Parseo inválido | Borde `--crit` + `aria-invalid=true` | Mensaje `--crit` | `Enter` inerte |
| Pasado | Normal | Aviso `--warn` | Se puede guardar |
| Ajuste por cambio de hora | Normal | Aviso `--ink-2` + pista de zona | Se puede guardar |
| Guardando | «…» + `aria-busy` | Cerrado | — |
| Guardado | «Guardado» 1 s junto al label | — | — |
| Error de guardado | Valor anterior + mensaje `--crit` con «Reintentar» | — | — |
| Deshabilitado (offline) | Opacidad 0.45, `aria-disabled` | No abre | — |
| Solo lectura | Texto sin borde ni chevron, `aria-readonly` | No abre | Terminales y vista del agente |

### 1.5 Teclado

| Contexto | Tecla | Acción |
|---|---|---|
| Lista o detalle con ítem seleccionado | `T` / `Shift+T` | Abre el detalle si está cerrado y despliega «Para cuándo» / «Avisarme» con el foco en el input |
| Trigger | Escribir | Abre el popover y parsea en vivo |
| Trigger | `↓` o `Alt+↓` | Abre el popover (si está cerrado) y lleva el foco al día elegido o a hoy |
| Trigger | `Enter` | Confirma el texto válido y cierra |
| Popover | `Tab` / `Shift+Tab` | Input → atajos → mes anterior → mes siguiente → rejilla (una parada) → hora → «Sin hora» → «Quitar» → «Listo» |
| Atajos | `↑ ↓`, `Enter` | Mover; confirmar y cerrar |
| Rejilla | `← →` / `↑ ↓` | Día anterior/siguiente · semana anterior/siguiente (cruza meses) |
| Rejilla | `Home` / `End` | Lunes / domingo de esa semana |
| Rejilla | `PgUp` / `PgDn` · `Shift+PgUp/PgDn` | Mes anterior/siguiente · año anterior/siguiente (mismo día o el último del mes) |
| Rejilla | `Enter` / `Espacio` | Elige el día; el foco pasa a Hora |
| Hora | `↑ ↓` · `Shift+↑ ↓` · `Enter` | ±15 min · ±1 h · confirmar y cerrar |
| Popover | `Esc` | Cancela, cierra y devuelve el foco al trigger. **No** cierra el detalle (`stopPropagation`) |

### 1.6 Accesibilidad (WAI-ARIA APG «Date Picker Combobox» + «Grid»)

- Trigger: `<input role="combobox" aria-haspopup="dialog" aria-expanded aria-controls="{id}-dialog" aria-describedby="{id}-preview">`. Nombre accesible = label visible («Para cuándo» / «Avisarme»). El valor se lee en largo: «viernes 9 de octubre de 2026, 09:00», «jueves 8 de octubre de 2026, sin hora», «Sin fecha».
- Vista previa: `id="{id}-preview"`, `aria-live="polite"`, actualizada como mucho cada 500 ms mientras se escribe. Los errores usan `role="alert"`, solo al pulsar `Enter`.
- Popover: `role="dialog"` **no modal** en escritorio (el input sigue activo), con `aria-label="Elegir fecha: Para cuándo"`. Al cerrar, el foco vuelve siempre al trigger.
- Atajos: `role="listbox"` con `aria-label="Atajos"`; cada opción lleva el nombre completo («Mañana, viernes 9 de octubre, 09:00»).
- Calendario: cabecera de mes con `id` y `aria-live="polite"`; `role="grid"` con `aria-labelledby` hacia esa cabecera; `columnheader` con `abbr` completo («lunes»); celdas `gridcell` con un `<button tabindex="-1|0">` (foco itinerante) y `aria-label="jueves, 8 de octubre de 2026"`; `aria-selected="true"` en el día elegido; `aria-current="date"` en hoy; sufijo oculto «, ya pasó» en días pasados.
- Hora: `role="combobox" aria-autocomplete="list"` + `listbox`, con `aria-label="Hora, formato 24 horas"`.
- Foco sobre el día elegido: anillo `--focus` con **offset de 2 px hacia fuera**. Sobre `--accent` un anillo interior no se distingue (1.2:1).

### 1.7 Tokens y medidas

| Pieza | Propiedad | Token |
|---|---|---|
| Trigger | alto · padding · radio · borde · fondo | `--control-h` (nuevo) · `0 var(--space-3)` · `--radius-sm` · `1px solid var(--control)` · `--sunken` |
| Trigger | texto | `--font-data`, `--step-data`, `--ink` (vacío: `--ink-muted`) |
| Popover | ancho · padding · gap · radio · fondo · borde · sombra | `--picker-w` (nuevo) · `--space-3` · `--space-3` · `--radius-md` · `--raised` · `1px solid var(--line-strong)` · `--shadow-float` |
| Atajo | alto · nombre · fecha | `--control-h` · `--step-meta`/`--ink` · `--step-data`/`--ink-muted` |
| Celda de día | tamaño · número · radio | `--control-h` × `--control-h` · `--font-data` `--step-data` · `--radius-sm` |
| Día elegido / hoy / hover | fondo y texto / marca / fondo | `--accent` + `--on-accent` / barra 2 px `--ink-2` / `--sunken` |
| Error · aviso | borde y texto · texto | `--crit` · `--warn` |
| Hoja estrecha | fondo tras ella | `--scrim` (nuevo) |
| Motion | apertura · cierre · hoja | `--dur-fast` + `--ease-out` · 85 ms + `--ease-exit` · `--dur-overlay` |

### 1.8 Agrupación por fecha en la lista

- **Dónde**: vista **Todo** (`/all`), activada por defecto (P5). Interruptor en la cabecera de la vista: «Agrupar: Fecha | Ninguno», guardado en `localStorage` `relay.todo.groupBy` (`"due"` | `"none"`). **Atención no cambia** (sigue con sus secciones de v1.1). Con agentes, Próximos y Hechos conservan su orden actual.
- **Campo**: `due_at`. Fronteras en Europe/Paris. Semana de lunes a domingo.

| Grupo (orden fijo) | Regla | Orden dentro |
|---|---|---|
| Vencidas | `due_at` < ahora y estado abierto | La más antigua primero |
| Hoy | Hoy y aún no vencida (incluye «sin hora») | Hora ascendente; «sin hora» al final |
| Mañana | Día siguiente | Hora ascendente |
| Esta semana | Desde pasado mañana hasta el domingo de esta semana. No aparece si mañana ya es lunes | Fecha ascendente |
| Más adelante | Después de este domingo | Fecha ascendente |
| Sin fecha | `due_at = null` | `updated_at` descendente |

- **Cabecera de grupo** (`DateGroupHeader`): alto `--section-h`, fondo `--paper`, texto `--step-label` caps `--ink-muted` + contador mono, sticky bajo la cabecera de la vista. **Sin color**: «Vencidas» no se tiñe de rojo; el rojo vive solo en la fecha de cada fila (`--crit`, v1.1 §6.9). Los grupos vacíos no se pintan.
- **Plegar**: clic en la cabecera, o `←`/`→` con el foco en ella. Chevron de 12 px que rota 90° en `--dur-fast` (sin rotación con movimiento reducido). Estado en `localStorage` `relay.groups.collapsed.all` (array de claves `overdue|today|tomorrow|week|later|none`). `J/K` saltan los grupos plegados.
- **La fecha de cada fila** se compacta según el grupo: «Hoy» y «Mañana» muestran solo la hora (o nada si es «sin hora»); «Esta semana», el día de la semana con hora (`vie 09:00`); «Más adelante», `12 oct`; «Vencidas», el texto relativo actual («Venció hace 2 d»).
- **Corrección incluida**: hoy `ReminderChip` usa `formatDue` y muestra «Venció…» en avisos pasados. Debe decir «Avisó hace 2 h».
- El servidor (`inbox_query.ts`, `domain/time.ts`) usa la hora local de la máquina para «hoy». Debe calcularlo en Europe/Paris para que cliente y servidor coincidan.

### 1.9 Copy

| Clave | Texto |
|---|---|
| Labels | «Para cuándo» · «Avisarme» · «Para qué» (sin cambios v1.1) |
| Placeholder del input | `Escribe: mañana 9, vie 14:30, 15/10…` |
| Vacíos | «Sin fecha» · «Sin aviso» |
| Atajos | «Hoy» · «Esta tarde» · «Mañana» · «Este fin de semana» · «Próxima semana» · «En 1 hora» · «Antes de que venza» · «Sin fecha» / «Sin aviso» |
| Pie | «Hora» · «Sin hora» · «Quitar fecha» / «Quitar aviso» · «Listo» |
| Navegación | «Mes anterior» · «Mes siguiente» |
| Error de parseo | «No entiendo esa fecha. Prueba: mañana 9, vie 14:30 o 15/10.» |
| Número ambiguo | «¿Hora o día? Escribe 15h o 15/10.» |
| Pasado | «Esta fecha ya pasó. Puedes guardarla igual.» |
| Aviso tras fecha límite | «El aviso llega después de la fecha límite.» |
| Cambio de hora (hueco) | «Esa hora no existe el 28 mar (cambio de hora). Se guarda a las 03:30.» |
| Cambio de hora (repetida) | «Esa hora se repite el 25 oct. Se usa la primera (02:30 CEST).» |
| Pista de zona | «hora de París» |
| Grupos | «Vencidas» · «Hoy» · «Mañana» · «Esta semana» · «Más adelante» · «Sin fecha» |
| Agrupar | «Agrupar: Fecha» · «Agrupar: Ninguno» |
| Aviso pasado en fila | «Avisó hace {n} {unidad}» |

### 1.10 Criterios visuales verificables

Reloj fijado en **2026-10-08T07:19:00Z** (jue 8 oct 09:19 CEST), navegador en `Europe/Paris` salvo que se indique otra zona.

| ID | Criterio |
|---|---|
| V12-D1 | No hay ningún `input[type=date]`, `input[type=time]` ni `input[type=datetime-local]` en el DOM de la app. |
| V12-D2 | Con un ítem seleccionado, `T` abre el detalle con el popover de «Para cuándo» y el foco en el input; `Shift+T` hace lo mismo con «Avisarme». |
| V12-D3 | El atajo «Mañana» envía un solo `PATCH` con `due_at = "2026-10-09T07:00:00.000Z"` y cierra el popover. |
| V12-D4 | Vista previa: `mañana 9` → «vie 9 oct 2026 · 09:00»; `15/10 14:30` → «jue 15 oct 2026 · 14:30»; `+3d` → «dom 11 oct 2026»; `jue` → «jue 15 oct 2026»; `3/1` → «dom 3 ene 2027». |
| V12-D5 | `15` muestra «¿Hora o día?…»; `Enter` no cierra ni guarda. `manana 9` (sin tilde) equivale a `mañana 9`. |
| V12-D6 | «Avisarme» → «En 1 hora» → `reminder_at = "2026-10-08T08:30:00.000Z"` (10:30 CEST). |
| V12-D7 | `25/10 2:30` guarda `2026-10-25T00:30:00.000Z` con el aviso de hora repetida; `28/3/2027 2:30` guarda `2027-03-28T01:30:00.000Z` y muestra «03:30». |
| V12-D8 | «Para cuándo» con «Sin hora» el 8 oct guarda `2026-10-08T21:59:00.000Z`; la fila y el trigger muestran la fecha sin hora; el ítem está en «Hoy», no en «Vencidas», hasta las 23:59. |
| V12-D9 | Con el navegador en `America/New_York`, el trigger sigue mostrando 09:00 para `07:00Z` y aparece «hora de París»; en `Europe/Paris` esa pista no aparece. |
| V12-D10 | Rejilla: desde el jue 8, `→` = vie 9, `↓` = jue 15, `PgDn` = dom 8 nov, `End` = dom 11; solo hay una celda con `tabindex=0`. |
| V12-D11 | Con el popover abierto, `Esc` lo cierra, restaura el valor previo y deja el ítem seleccionado y el detalle abierto. Las flechas dentro de la rejilla no mueven la selección de la lista. |
| V12-D12 | El día elegido tiene fondo `--accent` y texto `--on-accent`; el foco sobre él tiene un anillo `--focus` separado 2 px (verificable en la captura). Hoy lleva la barra de 2 px `--ink-2`. |
| V12-D13 | La apertura dura ≤120 ms; con `prefers-reduced-motion` no hay escala (`transform` computado = `none`). |
| V12-D14 | Datos de prueba con un ítem por grupo → Todo muestra, en este orden: Vencidas, Hoy, Mañana, Esta semana (vie 9 no; sáb 10 y dom 11 sí), Más adelante, Sin fecha. Las cabeceras miden 28 px y su texto es `--ink-muted` (también «Vencidas»). |
| V12-D15 | Plegar «Más adelante» y recargar mantiene el grupo plegado; `J` salta de «Esta semana» a «Sin fecha». |
| V12-D16 | Con viewport de 700 px, el picker se abre como hoja inferior con `--scrim` y `aria-modal="true"`; `Tab` no sale de la hoja. |

### 1.11 Fuera de alcance

Vista calendario o agenda · recurrencias · rangos de fechas · duración o hora de fin · selector de zona horaria · formato de 12 h · lenguaje natural en inglés o frases largas · fechas por arrastre · agrupación en Atención · notificaciones del sistema (v1.1 §1.3 ya lo deja fuera).

---

## 2. Spec F — Filtros y búsqueda completos, con estado en la URL

### 2.1 Objetivo

Encontrar cualquier ítem o nota por texto, estado, dueño o fecha en pocos segundos, sin salir de la lista, y poder **compartir o recargar** exactamente esa vista por URL. Sustituye a FilterBar v1.1 §6.18, que solo filtraba por título.

### 2.2 Anatomía

```
┌ Todo · 23 ─────────────────────────────────────────────────── Agrupar: Fecha ▾ ┐
│ [⌕ Buscar en ítems y notas…                 /]  [Filtros  F]                  │ ← fila 1, --control-h
│ [Estado: Atascado, Te necesita ×] [Dueño: ■DS ×] [Vence: Esta semana ×]  Limpiar │ ← fila 2: solo si hay filtros
├────────────────────────────────────────────────────────────────────────────────┤
│ ○ Revisar demo de onboarding                  ■DS   BLOQUEADO     vie 09:00    │
│   Espera: acceso a staging                                                     │ ← línea de motivo (v1.1)
│   Nota · «…preparar la **demo** con datos reales…»                             │ ← línea de coincidencia
└────────────────────────────────────────────────────────────────────────────────┘
```

- **SearchField** (`#view-filter` se conserva como id): alto `--control-h`, fondo `--sunken`, borde 1 px `--control`, icono lupa de 14 px `--ink-muted`, `kbd` «/» a la derecha (mono `--step-data`, borde `--line`). Con texto aparece «Borrar búsqueda» (×). Ocupa todo el ancho libre (mínimo 240 px).
- **Botón «Filtros»**: secundario, `--control-h`, con `kbd` «F» y contador mono cuando hay facetas activas («Filtros · 3»).
- **Fila de chips** (`FilterChip`): solo si hay facetas activas. Alto `--chip-h`, `--radius-xs`, fondo `--accent-tint`, texto `--accent-ink` `--step-meta`. Formato «Faceta: valor1, valor2» con × para quitar. El chip de Dueño incluye el ActorMark de 14 px. «Limpiar» (enlace) quita todo, también `q`.
- **Línea de coincidencia** (`MatchSnippet`): solo con búsqueda activa y cuando la coincidencia **no** está en el título. Sin mono: `--step-meta` `--ink-2`; prefijo de origen («Nota · », «Motivo · », «Descripción · »); el texto coincidente va con fondo `--mark-bg` y peso 600. Fila de `--row-h-snippet` si además tiene línea de motivo.

### 2.3 Comportamiento

#### 2.3.1 Búsqueda

- **Alcance**: `title`, `description_md`, `blocked_reason`, `needs_you_reason`, `reminder_intent` y el `body_md`/`title` de las **notas vinculadas** al ítem. Una nota coincidente que no tiene ítems vinculados no aparece en Todo (P4).
- **Coincidencia**: subcadena sin distinguir mayúsculas ni tildes (`demo` encuentra «Démo»), con normalización NFD. Varias palabras = todas deben aparecer (AND), en cualquier orden. Sin sintaxis de operadores en v1.2.
- **Cuándo**: a partir de 2 caracteres, con debounce de 150 ms. Mientras llega la respuesta, la lista anterior se mantiene (sin parpadeo) y una barra de 1 px `--accent` aparece bajo el campo si tarda >300 ms.
- **Orden de resultados**: título > motivo/intención > descripción > nota; dentro de cada nivel se mantiene el orden de la vista (o la agrupación por fecha, §1.8).
- **`/`** enfoca el campo y selecciona su texto. **`Enter`** en el campo lleva el foco al primer resultado (la lista recupera `J/K`). **`Esc`** en el campo: si hay texto, lo borra; si no, devuelve el foco a la lista.

#### 2.3.2 Facetas

| Faceta | Valores | Lógica | Parámetro URL |
|---|---|---|---|
| Estado | Los 7 estados de `StatusSchema` con su nombre de v1.1: Por clasificar (`inbox`), Asignado (`assigned`), En curso (`in_progress`), Atascado (`blocked`), Te necesita (`needs_you`), Hecho (`done`), Cancelado (`cancelled`) | OR dentro de la faceta | `status=blocked,needs_you` |
| Dueño | «Tú» + cada agente del catálogo, con ActorMark | OR. Filtra por el **testigo visible** (quién tiene la pelota, v1.1), no por el creador (P3) | `actor=david,dev-senior` |
| Vence | «Vencidas», «Hoy», «Esta semana», «Sin fecha», «Entre fechas…» | Una sola opción. «Entre fechas…» abre dos `DateTimePicker` en modo solo fecha | `due=overdue\|today\|week\|none\|range` + `from=2026-10-12&to=2026-10-18` |
| Etiquetas | **Condicional**: solo si el modelo añade `labels` (§0.1) | OR | `label=…` (reservado) |

- Entre facetas distintas: **AND**. Con `q` también: AND.
- Las fechas de `from`/`to` son días de calendario en Europe/Paris; `to` es inclusivo.
- La faceta Dueño se oculta en «Lo que ve el agente».
- **Menú de facetas** (`FacetMenu`, `F` o clic): popover de `--menu-w` anclado al botón. Primer nivel: las facetas, como `menuitem` con submenú. Segundo nivel: valores como `menuitemcheckbox` (Estado, Dueño) o `menuitemradio` (Vence), con contador mono de resultados. Marcar un valor aplica al instante (sin «Aplicar»). Escribir dentro del menú filtra los valores.

#### 2.3.3 Estado en la URL

- **Forma**: `/{view}?q=&status=&actor=&due=&from=&to=&label=&item=`, con `view` ∈ `attention | agent_wip | upcoming | done | all | notes` (`AppView` del repo).
- **Orden canónico** de parámetros (el de arriba), listas separadas por coma y ordenadas, sin parámetros vacíos. Así la misma vista siempre produce la misma URL.
- **Historial**: `pushState` al cambiar de vista o de facetas (Atrás deshace un filtro). `replaceState` al escribir `q` y al cambiar de `item` seleccionado (no se llena el historial). `popstate` restaura todo el estado.
- **Carga**: al abrir una URL se aplica el estado antes del primer render de la lista. Valores desconocidos (`status=foo`, actor inexistente) se ignoran y la URL se reescribe con `replaceState`. Si `item` no existe o no está en el resultado, se ignora sin error.
- **Servidor**: `apps/server` debe devolver el `index.html` en cualquier ruta que no sea `/api/*` (fallback SPA) para que recargar `/all?status=blocked` funcione.
- **Por vista**: cambiar de vista con el rail o `G+letra` limpia las facetas (cada vista arranca limpia). La URL compartida conserva vista y facetas juntas.

#### 2.3.4 Resultados vacíos y conteos

- El contador de la cabecera («Todo · 23») muestra los resultados filtrados con la forma «7 de 23» cuando hay filtros.
- **Sin resultados**: texto centrado `--ink-2` con las acciones «Quitar filtros» y, si hay `q`, «Buscar «{q}» en todas las vistas» (va a `/all?q=…`). Nada de ilustraciones.

#### 2.3.5 Selección y teclado de la lista

- Si el ítem seleccionado queda fuera del filtro, la selección pasa al primer resultado y el detalle se cierra.
- `J/K`, `X`, `E`, `S`… siguen funcionando sobre la lista filtrada.

#### 2.3.6 API propuesta

```
GET /api/search?q=demo&status=blocked,needs_you&actor=dev-senior&due=week&view=all
→ { items: [{ id, match: { field: "title"|"description_md"|"blocked_reason"|"needs_you_reason"|"reminder_intent"|"note", note_id?, snippet, ranges: [[start,end]] } }], total }
```

- Hasta tener el endpoint, el filtrado por facetas puede hacerse en cliente con los ítems ya cargados (`lib/view_model.ts`). La búsqueda en notas sí requiere servidor (las notas no se cargan enteras en la lista).
- `snippet` ≤ 120 caracteres alrededor de la primera coincidencia, en **texto plano** (markdown eliminado, §3), con «…» en los cortes.

### 2.4 Estados

| Pieza | Estado | Aspecto |
|---|---|---|
| SearchField | Vacío · foco · con texto · buscando · error | Placeholder `--ink-muted` · anillo `--focus` · × visible · barra 1 px `--accent` (>300 ms) · mensaje `--crit` «No se pudo buscar. Reintentar» bajo el campo, lista anterior intacta |
| Botón Filtros | Sin facetas · con facetas · abierto | Secundario · «Filtros · N» · `aria-expanded=true` |
| FilterChip | Normal · hover · foco | `--accent-tint` · × en `--accent-ink` 600 · anillo `--focus` |
| Valor de faceta | Marcado · sin resultados | Check 14 px `--accent` · contador «0» y texto `--ink-muted` (sigue seleccionable) |
| Lista | Filtrada · vacía · offline | «7 de 23» · estado vacío §2.3.4 · búsqueda deshabilitada «Sin conexión con la API local»; facetas siguen en cliente |

### 2.5 Teclado

| Contexto | Tecla | Acción |
|---|---|---|
| Global | `/` | Enfoca la búsqueda y selecciona su texto |
| Global | `F` | Abre el menú de facetas |
| Global | `Shift+F` | Quita todas las facetas y `q` (= «Limpiar») |
| Búsqueda | `Enter` · `Esc` · `↓` | Primer resultado · borrar o salir (§2.3.1) · primer resultado |
| Menú | `↑ ↓` · `→`/`Enter` · `←` | Mover · abrir submenú · volver |
| Submenú | `Espacio`/`Enter` · escribir | Marcar o desmarcar (sin cerrar) · filtrar valores |
| Menú | `Esc` | Cierra un nivel; desde el primero, devuelve el foco al botón. No deselecciona el ítem |
| Chip | `Backspace`/`Supr` | Quita la faceta; el foco pasa al chip siguiente o a «Filtros» |

### 2.6 Accesibilidad

- SearchField: `<input type="search" role="searchbox" aria-label="Buscar en ítems y notas" aria-keyshortcuts="/" aria-describedby="{id}-count">`.
- Recuento: `<p id="{id}-count" aria-live="polite">` con «7 resultados de 23» al terminar cada búsqueda (no en cada tecla).
- Botón Filtros: `aria-haspopup="menu" aria-expanded aria-keyshortcuts="F"`. Menú según APG «Menu Button»: `role="menu"`, `menuitem aria-haspopup="menu"`, `menuitemcheckbox`/`menuitemradio` con `aria-checked`.
- Chips: un `<button>` por chip con `aria-label="Quitar filtro: Estado Atascado, Te necesita"`; grupo con `role="group" aria-label="Filtros activos"`.
- Resaltado: `<mark>` con peso 600 además del fondo (no depende solo del color). El lector oye el snippet completo, con su origen.
- Al cambiar los resultados, el foco nunca salta solo.

### 2.7 Tokens y medidas

| Pieza | Token |
|---|---|
| Campo y botón | `--control-h` · `--sunken` · `1px solid var(--control)` · `--radius-sm` · `--space-3` |
| Kbd | `--font-data` `--step-data` · `1px solid var(--line)` · `--radius-xs` · `--ink-muted` |
| Chips | `--chip-h` · `--accent-tint` · `--accent-ink` · `--radius-xs` · gap `--space-2` |
| Menú | `--menu-w` · `--raised` · `1px solid var(--line-strong)` · `--shadow-float` · ítems `--control-h` |
| Coincidencia | `--row-h-snippet` · `--step-meta` `--ink-2` · `<mark>` `--mark-bg` + 600 + `--ink` |
| Motion | menú y popover `--dur-fast`; chips aparecen sin animación (alta frecuencia) |

### 2.8 Copy

| Clave | Texto |
|---|---|
| Placeholder | «Buscar en ítems y notas…» |
| Botón | «Filtros» · «Filtros · {n}» |
| Facetas | «Estado» · «Dueño» · «Vence» · («Etiquetas», condicional) |
| Valores de Vence | «Vencidas» · «Hoy» · «Esta semana» · «Sin fecha» · «Entre fechas…» · «Desde» · «Hasta» |
| Dueño | «Tú» + nombre visible de cada agente |
| Chips | «{Faceta}: {valores}» · «Limpiar» |
| Prefijos de coincidencia | «Nota · » · «Motivo · » · «Descripción · » · «Para qué · » |
| Recuento | «{n} de {total}» · lector: «{n} resultados de {total}» |
| Vacío | «Nada coincide con estos filtros.» · «Quitar filtros» · «Buscar «{q}» en todas las vistas» |
| Error | «No se pudo buscar. Reintentar» |
| Mínimo | (sin mensaje: con 1 carácter simplemente no se busca) |

### 2.9 Criterios visuales verificables

| ID | Criterio |
|---|---|
| V12-F1 | `/` enfoca `#view-filter`; escribir `demo` envía como mucho 1 petición de búsqueda tras 150 ms de pausa; `d` sola no envía ninguna. |
| V12-F2 | `demo` encuentra un ítem titulado «Démo cliente» (sin tildes, sin mayúsculas). `demo staging` solo devuelve ítems que contienen ambas palabras. |
| V12-F3 | Un ítem cuya coincidencia está solo en una nota vinculada muestra la línea «Nota · «…**demo**…»» con `<mark>` en peso 600 y fondo `--mark-bg`. |
| V12-F4 | Abrir `/all?q=demo&status=blocked&actor=dev-senior` en una pestaña nueva muestra la búsqueda rellena, los chips «Estado: Atascado» y «Dueño: ■DS» y solo ítems atascados de DS que contienen «demo». |
| V12-F5 | Marcar Estado «Atascado» y luego «Te necesita» deja la URL en `?status=blocked,needs_you` (orden canónico); Atrás vuelve a `?status=blocked`. |
| V12-F6 | Escribir en la búsqueda no añade entradas al historial (`history.length` no cambia). |
| V12-F7 | `/all?status=foo` carga sin error y la URL queda como `/all`. |
| V12-F8 | Recargar `/all?due=week` en el servidor de desarrollo y en el build de producción devuelve la app, no un 404. |
| V12-F9 | «Vence: Entre fechas…» del 12 al 18 oct incluye un ítem con `due_at` el 18 oct a las 23:59 de París y excluye uno el 19 oct a las 00:00. |
| V12-F10 | Estado (Atascado) + Dueño (DS) es AND: un ítem atascado de QA no aparece. |
| V12-F11 | `F` abre el menú con el foco en «Estado»; `→` abre el submenú; `Espacio` marca sin cerrar; `Esc` dos veces devuelve el foco al botón y el ítem sigue seleccionado. |
| V12-F12 | Con filtros, la cabecera dice «7 de 23» y el lector anuncia «7 resultados de 23» una sola vez por búsqueda. |
| V12-F13 | Sin resultados se ve «Nada coincide con estos filtros.» con «Quitar filtros»; no hay ilustraciones. |
| V12-F14 | Los chips miden 24 px de alto; el campo y el botón, 32 px; los chips no se animan al aparecer. |
| V12-F15 | En modo oscuro, el texto dentro de `<mark>` cumple ≥7:1 (`--ink` sobre `--mark-bg`) según la matriz de contraste. |

### 2.10 Fuera de alcance

Paleta de comandos `⌘K` (sigue reservada, v1.1 §8.1) · búsquedas guardadas · operadores (`status:`, comillas, OR) · búsqueda difusa o semántica · etiquetas mientras no existan en el modelo · filtros en Atención (ya está priorizada) · ordenación configurable.

---

## 3. Spec M — Markdown en notas (ver y editar)

### 3.1 Objetivo

Que una nota escrita por ti o por un agente se lea como un documento (títulos, listas, código, enlaces, tareas) y se edite como texto plano, sin perder nunca lo escrito y sin abrir la puerta a HTML o scripts. Concreta v1.1 §1.4 («markdown plano con vista previa al salir de edición»).

### 3.2 Anatomía

```
┌ Detalle (--detail-w 440, --raised) ───────────────────────┐
│ ← Volver al ítem                      Editar  E   ⋯       │ ← cabecera, --control-h
│ Decisión de alcance del onboarding                         │ ← título nota, --step-h1
│ Actualizada hace 2 h · 3 ítems vinculados                  │ ← mono --step-data --ink-muted
│ ────────────────────────────────────────────────────────── │
│ Contexto                                                   │ ← h1 md → --step-h2
│ Texto con **negrita**, `código` y [un enlace ↗](…)         │ ← --step-body, 1.55
│ • punto uno                                                │
│ ☑ Revisar copy        ☐ Pasar a QA                         │ ← tareas: casillas nativas
│ ┃ cita con regla --line-strong                             │
│ ┌ ts ──────────────────────────────────────────────┐       │ ← bloque código --sunken
│ │ const x = 1                                      │       │
│ └──────────────────────────────────────────────────┘       │
└────────────────────────────────────────────────────────────┘
```

- **Dónde se abre**: en la vista Notas (`/notes`), seleccionar una nota la muestra en el panel de detalle. Desde el detalle de un ítem, clic en una NoteCard abre la nota en el mismo panel con «← Volver al ítem». La URL refleja `?item=` o `?note=` (añadir `note` al orden canónico de §2.3.3, tras `item`).
- **NoteCard y lista de Notas**: el extracto deja de mostrar markdown crudo. Se muestra **texto plano** (markdown eliminado, saltos colapsados, 3 líneas máximo con `line-clamp`). Hoy `App.tsx` y `DetailPanel.tsx` pintan `body_md.slice(0,120)`.
- **NoteView** (`Markdown`): ancho de lectura `min(100%, 68ch)`, padding `--space-5`.
- **NoteEditor**: `<textarea>` a todo el ancho del panel, mono `--font-data` a `--step-body` (no `--step-data`: es texto largo), fondo `--sunken`, borde 1 px `--control`, alto automático (mínimo 12 líneas). Barra superior con «Vista previa» (conmutador), estado de guardado en mono y «Listo».

### 3.3 Comportamiento

#### 3.3.1 Elementos soportados (CommonMark + GFM)

| Markdown | Se muestra como | Tokens |
|---|---|---|
| `#` | Título de sección | `--step-h2`, 600, `--ink`, margen superior `--space-5` |
| `##` | Subtítulo | `--step-h3` (nuevo, 15 px), 600, `--ink` |
| `###`–`######` | Subtítulo menor (todos iguales) | `--step-body`, 600, `--ink-2` |
| Párrafo | Texto | `--step-body`, `line-height` 1.55, `--ink`, separación `--space-3` |
| `**negrita**` · `*cursiva*` · `~~tachado~~` | 600 · itálica · tachado `--ink-muted` | — |
| `` `código` `` | Mono en línea | `--font-data` 0.92em, fondo `--sunken`, padding `0 var(--space-1)`, `--radius-xs` |
| Bloque ```` ``` ```` con lenguaje | Bloque de código **sin coloreado de sintaxis** | `--sunken`, borde 1 px `--line`, `--radius-sm`, padding `--space-3`, `overflow-x:auto`, `tab-size:2`; etiqueta del lenguaje arriba a la derecha (`--step-label` `--ink-muted`) |
| Lista `-` / `1.` | Viñeta o número | Sangría `--space-5`, viñeta `--ink-muted` |
| `- [ ]` / `- [x]` | Casilla de tarea interactiva (§3.3.3) | Casilla nativa 14 px, `accent-color: var(--accent)`; hecha: texto `--ink-muted` sin tachar |
| `> cita` | Cita | Regla izquierda 2 px `--line-strong` (**nunca** `--accent` ni `--attention-rule`: el acento de 2 px es exclusivo de `needs_you`), texto `--ink-2` |
| `[texto](url)` y URL sueltas (autolink GFM) | Enlace | `--accent-ink`, subrayado 1 px con offset 2 px; externo: `target="_blank" rel="noopener noreferrer"` + icono ↗ 12 px |
| Tabla GFM | Tabla densa | Cabecera `--step-label` caps `--ink-muted`, celdas `--step-meta`, filas separadas por `--line`, scroll horizontal propio |
| `---` | Separador | 1 px `--line`, margen `--space-5` |
| `![alt](url)` | **No se carga la imagen**: enlace «Imagen: {alt}» con icono de 12 px | Evita peticiones a terceros desde una app local |
| HTML crudo | Texto literal (escapado) | — |

- **Seguridad**: renderizado a elementos React (sin `dangerouslySetInnerHTML`). Lista permitida de protocolos en enlaces: `http`, `https`, `mailto`. Otros (`javascript:`, `data:`, `file:`) se muestran como texto sin enlace.
- **Enlaces internos**: una URL de la propia app (`/all?item=…`, `/notes?note=…`) se abre en la misma pestaña y sin icono ↗.
- **Sin**: coloreado de sintaxis, fórmulas, diagramas, notas al pie, emojis `:shortcode:`, menciones.

#### 3.3.2 Editar

- **Entrar**: «Editar», `E` con la nota abierta o doble clic en el cuerpo. El cursor va al final (o al punto más cercano al doble clic si es fácil; si no, al final).
- **Vista previa**: conmutador «Escribir | Vista previa», primer elemento de la barra en el orden de `Tab`, sin atajo propio (`⌘⇧P` abre ventana privada en Firefox); no hay vista dividida en 440 px. En la ventana ancha (detalle ≥ 720 px, P1 de v1.1) se puede dividir; aquí fuera de alcance.
- **Atajos de formato** (envuelven la selección o insertan el par): `⌘B` negrita, `⌘I` cursiva, `⌘E` código en línea, `⌘K` enlace (`[selección](|)`), `⌘⇧7` lista numerada, `⌘⇧8` lista, `⌘⇧9` tarea (detectar por `event.code` `Digit7/8/9`: en teclado español `⇧7` produce «/»). `Tab`/`Shift+Tab` en una línea de lista sangran o la sacan; en otra línea, `Tab` sale del textarea (no atrapa el foco). `Enter` en un ítem de lista continúa la lista; `Enter` en un ítem vacío la termina.
- **Guardar**: autoguardado 800 ms después de la última tecla con `PATCH /api/notes/:id` (`body_md`). Estados en la barra: «Guardando…» → «Guardado» (1 s) → nada. **Salir**: «Listo», `⌘Enter` o `Esc` guardan y vuelven a la vista renderizada (la edición nunca se descarta con `Esc`).
- **Título de la nota**: editable con `E` en la vista renderizada solo si el foco está en el título; guarda con `Enter`.
- **Conflicto**: el `PATCH` envía el `updated_at` que se cargó. Si el servidor tiene uno más nuevo (otro agente escribió), no se pisa nada: banner `--warn` «Esta nota cambió mientras editabas.» con «Ver su versión» (abre la versión del servidor en solo lectura, al lado de la tuya en el conmutador) y «Mantener la mía» (reenvía forzando). Requiere que `PATCH /api/notes/:id` acepte `if_updated_at` y responda 409.
- **Pérdida de datos**: el borrador se guarda también en `sessionStorage` `relay.note.draft.{id}` en cada pulsación y se borra al confirmar el guardado. Al reabrir con un borrador más nuevo que el servidor: «Hay cambios sin guardar de antes. Recuperar · Descartar».
- **Límite**: `body_md` admite 100 000 caracteres (esquema). A partir de 90 000, contador mono `--warn` «{n} / 100 000»; al llegar, no se aceptan más caracteres.

#### 3.3.3 Casillas de tarea en la vista renderizada

- Son `<input type="checkbox">` nativos (requisito del guard de teclado, §0.2). Al marcar, se reescribe **solo** el marcador `[ ]` ↔ `[x]` de esa línea usando la posición de origen del nodo (sin re-serializar el markdown) y se guarda con el mismo flujo optimista.
- En solo lectura (vista «Lo que ve el agente» o sin conexión) las casillas están `disabled`.
- No crean ítems de Relay ni cambian el estado de ningún ítem: son texto de la nota.

#### 3.3.4 Procedencia (condicional)

El modelo `Note` **no tiene autor** (§0.1). Si Producto añade `created_by`/`updated_by` (P2), la línea de metadatos muestra el ActorMark de 14 px de quien la actualizó por última vez: «◯ Tú · hace 2 h» / «■ DS · hace 2 h». Sin ese dato, solo se muestra la fecha. No se inventa la autoría.

### 3.4 Estados

| Pieza | Estado | Aspecto |
|---|---|---|
| NoteView | Normal · vacía · cargando · error | Markdown · «Esta nota está vacía. Escribe con E.» `--ink-muted` · 3 barras skeleton `--sunken` sin shimmer · «No se pudo cargar la nota. Reintentar» |
| NoteEditor | Escribiendo · guardando · guardado · error · conflicto · cerca del límite | Normal · «Guardando…» · «Guardado» 1 s · «No se guardó. Reintentar» `--crit`, el texto se conserva · banner `--warn` · contador `--warn` |
| Casilla | Sin marcar · marcada · foco · disabled | Borde `--control` · `accent-color` · anillo `--focus` · opacidad 0.45 |
| Enlace | Normal · hover · foco · visitado | `--accent-ink` · subrayado 2 px · anillo `--focus` · sin cambio de color |

### 3.5 Teclado

| Contexto | Tecla | Acción |
|---|---|---|
| Nota abierta (vista) | `E` | Editar el cuerpo (o el título, si tiene el foco) |
| Nota abierta (vista) | `Esc` | Vuelve al ítem de origen o cierra el panel |
| Editor | `⌘B` `⌘I` `⌘E` `⌘K` `⌘⇧7` `⌘⇧8` `⌘⇧9` | Formato (§3.3.2). `⌘K` no llega al handler global |
| Editor | `⌘Enter` · `Esc` | Guardar y salir (ambas) |
| Editor | `Tab` / `Shift+Tab` | Sangrar en listas; fuera de listas, mover el foco |
| Vista | `Tab` | Recorre enlaces y casillas en orden de lectura |

### 3.6 Accesibilidad

- Vista: `<article aria-labelledby="{note-title-id}">`. Los títulos markdown se bajan un nivel para no competir con la página: `#` → `<h3>`, `##` → `<h4>`, `###`+ → `<h5>` (el título de la nota es `<h2>`).
- Editor: `<textarea aria-label="Cuerpo de la nota, markdown" aria-describedby="{id}-status">`; estado de guardado con `aria-live="polite"`; error con `role="alert"`.
- Casillas: `<label>` que envuelve casilla y texto, de modo que el texto de la tarea es su nombre accesible.
- Enlaces externos: texto oculto «(se abre en otra pestaña)». Imágenes no cargadas: el enlace dice «Imagen: {alt}» (o «Imagen sin descripción»).
- Tablas con `<th scope="col">`; bloques de código con `tabindex="0"` cuando tienen scroll horizontal, para poder desplazarlos con el teclado.

### 3.7 Tokens y medidas

| Pieza | Token |
|---|---|
| Texto | `--font-ui` · `--step-body` · 1.55 · `--ink` · ancho `68ch` |
| Títulos | `--step-h2` · `--step-h3` (nuevo) · `--step-body` 600 `--ink-2` |
| Código | `--font-data` · `--sunken` · `--line` · `--radius-xs` / `--radius-sm` · etiqueta `--ink-muted` |
| Cita | 2 px `--line-strong` · `--ink-2` |
| Enlace | `--accent-ink` · foco `--focus` |
| Editor | `--font-data` a `--step-body` · `--sunken` · `1px solid var(--control)` · padding `--space-3` |
| Separaciones | `--space-3` entre bloques · `--space-5` antes de títulos y separadores |
| Motion | Escribir ↔ Vista previa: instantáneo. «Guardado» aparece y se va con opacidad en `--dur-fast` |

### 3.8 Copy

| Clave | Texto |
|---|---|
| Acciones | «Editar» · «Listo» · «Escribir» · «Vista previa» · «← Volver al ítem» |
| Guardado | «Guardando…» · «Guardado» · «No se guardó. Reintentar» |
| Conflicto | «Esta nota cambió mientras editabas.» · «Ver su versión» · «Mantener la mía» |
| Borrador | «Hay cambios sin guardar de antes.» · «Recuperar» · «Descartar» |
| Vacía | «Esta nota está vacía. Escribe con E.» |
| Imagen | «Imagen: {alt}» · «Imagen sin descripción» |
| Límite | «{n} / 100 000» |
| Metadatos | «Actualizada hace {t} · {n} ítems vinculados» |
| Lector | «(se abre en otra pestaña)» · «Cuerpo de la nota, markdown» |

### 3.9 Criterios visuales verificables

Nota de prueba `fixtures/note-all-md.md` con todos los elementos de §3.3.1, incluido `<script>alert(1)</script>`, `[x](javascript:alert(1))` y `![logo](https://example.com/a.png)`.

| ID | Criterio |
|---|---|
| V12-M1 | En la lista de Notas y en las NoteCard no aparece ningún carácter de sintaxis (`#`, `**`, `` ` ``, `- [ ]`) en los extractos; máximo 3 líneas. |
| V12-M2 | `#` se pinta con `--step-h2`, `##` con 15 px (`--step-h3`) y `###` con `--step-body` 600 `--ink-2`; en el DOM son `h3`, `h4` y `h5`. |
| V12-M3 | `<script>alert(1)</script>` aparece como texto literal y no se ejecuta; el DOM de la nota no contiene ningún `<script>` ni atributo `on*`. |
| V12-M4 | `[x](javascript:alert(1))` se muestra como texto sin `<a>`. |
| V12-M5 | La imagen no genera ninguna petición de red (pestaña Network vacía para `example.com`) y se ve el enlace «Imagen: logo». |
| V12-M6 | Los enlaces externos llevan `target="_blank"`, `rel="noopener noreferrer"` e icono ↗; un enlace a `/all?item=…` abre en la misma pestaña sin icono. |
| V12-M7 | La cita tiene una regla izquierda de 2 px con el color calculado de `--line-strong`, distinto de `--accent` y de `--attention-rule`. |
| V12-M8 | Los bloques de código usan `--sunken` y mono, sin colores de sintaxis; una línea de 300 caracteres hace scroll dentro del bloque, no en el panel. |
| V12-M9 | Marcar «Pasar a QA» en la vista cambia **solo** `- [ ] Pasar a QA` por `- [x] Pasar a QA` en `body_md` (diff de 1 carácter) y envía un solo `PATCH`. |
| V12-M10 | Con una casilla enfocada, `Espacio` la marca y **no** completa el ítem seleccionado en la lista. |
| V12-M11 | `E` abre el editor; escribir y esperar 800 ms envía un `PATCH`; «Guardado» aparece y desaparece en ~1 s. |
| V12-M12 | En el editor, `Esc` guarda y sale (el texto nuevo se ve renderizado); no cierra el panel ni deselecciona el ítem. |
| V12-M13 | En el editor, `⌘K` sobre «docs» produce `[docs]()` con el cursor entre los paréntesis y no abre ninguna paleta global. |
| V12-M14 | Si el servidor responde 409, aparece el banner «Esta nota cambió mientras editabas.» y el texto del editor sigue intacto. |
| V12-M15 | Cerrar la pestaña con cambios no guardados y reabrir la nota muestra «Hay cambios sin guardar de antes.» con «Recuperar». |
| V12-M16 | En claro y oscuro, enlace (`--accent-ink`/`--raised`) ≥ 4.5:1 y código (`--ink`/`--sunken`) ≥ 7:1 en la matriz de contraste. |

### 3.10 Fuera de alcance

Editor WYSIWYG o por bloques · comandos `/` · coloreado de sintaxis · imágenes y adjuntos · menciones `@` o enlaces `[[nota]]` · historial de versiones · colaboración en tiempo real · exportar · fórmulas y diagramas · crear ítems desde casillas.

---

## 4. Notas para Dev

### 4.1 Puntos de contacto en el repo

| Área | Archivo (actual → v1.2) | Cambio |
|---|---|---|
| Selector | `apps/web/src/components/DateTimeField.tsx/.css` → `DateTimePicker.tsx` + `CalendarGrid.tsx`, `TimeCombobox.tsx`, `PickerShortcuts.tsx` | Props: `kind: "due" \| "reminder"`, `value: string \| null` (ISO UTC), `allowDateOnly?: boolean` (solo `due`), `relatedDueAt?: string \| null` (para «Antes de que venza»), `readOnly?: boolean`, `disabled?: boolean`, `onCommit(next: string \| null): Promise<void>`. Se usa en `DetailPanel.tsx` (Recordatorio) |
| Hora de París | `lib/format.ts` → nuevo `lib/paris_time.ts` | `toParisParts(iso)`, `fromParisWall({y,m,d,hh,mm})` con regla «compatible» exacta, `startOfParisDay`, `startOfParisWeek` (lunes), `isDateOnly(iso)` (23:59 de pared) |
| Parser | nuevo `lib/date_parse.ts` | `parseNaturalDate(text, { now, kind }) → { ok: true, iso, dateOnly, dstNote? } \| { ok: false, reason: "empty" \| "ambiguous" \| "unknown" }`. Tests con la tabla de §1.3.2 y V12-D4/D5/D7 |
| Grupos | nuevo `lib/date_groups.ts` + `DateGroupHeader.tsx`; `ItemList` en `App.tsx` | `groupByDue(items, now) → { key, label, items }[]`. Corregir `ReminderChip` en `ItemRow.tsx` («Avisó…») |
| Servidor (tiempo) | `packages/core/src/domain/time.ts`, `inbox_query.ts` | Fronteras de día en Europe/Paris, no `setHours()` local |
| URL | nuevo `hooks/useUrlState.ts`; `App.tsx` | `parse(location) → UrlState`, `serialize(state) → string` canónico, `push`/`replace`, `popstate`. Sin librería de router |
| Filtros | `#view-filter` en `App.tsx`, `lib/view_model.ts` → `FilterBar.tsx`, `SearchField.tsx`, `FacetMenu.tsx`, `FilterChip.tsx`, `MatchSnippet.tsx` | `matchesFilter` pasa de solo título a `matchesFacets(item, state)`; normalización sin tildes compartida con el servidor |
| API | `apps/server/src/routes/api.ts` | Nuevo `GET /api/search` (§2.3.6); fallback SPA a `index.html` fuera de `/api/*`; `PATCH /api/notes/:id` acepta `if_updated_at` → 409 |
| Notas | `DetailPanel.tsx` (NoteCard), vista Notas en `App.tsx` → `NoteView.tsx`, `NoteEditor.tsx`, `Markdown.tsx`, `lib/markdown.ts` | `toPlainText(md, maxChars)` para extractos y snippets; `toggleTask(md, offset)` para casillas; usar `api.updateNote` (hoy sin uso) |
| Dependencias | `apps/web/package.json` | Añadir `react-markdown` + `remark-gfm` (con `skipHtml`/sin `rehype-raw`, `urlTransform` con lista permitida). Fechas: solo `Intl`, sin librería |
| Tokens | `docs/tokens.css` **y** `apps/web/src/styles/tokens.css` | Añadir los 9 tokens de §0.3 en `:root` y en el bloque oscuro; ampliar `scripts/contrast-matrix.mjs` con `--ink`/`--mark-bg` (≥7) y `--ink-2`/`--mark-bg` (≥4.5) |
| Teclado | `App.tsx` (handler global) | Ver §4.2 |
| Tests e2e | — | Reloj fijo `2026-10-08T07:19:00Z`; zonas `Europe/Paris` y `America/New_York`; fixture `note-all-md.md` |

### 4.2 Riesgos de implementación

1. **Cadena de `Esc`**: hoy `Esc` deselecciona aunque haya un popover abierto. Orden v1.2: popover/menú/hoja abierta → editor de nota (guardar y salir) → búsqueda con texto (borrar) → atajos → captura → deselección. Cada capa hace `stopPropagation`.
2. **Guard de teclado global**: además de `INPUT`/`TEXTAREA`/`contentEditable`, ignorar eventos cuyo `target.closest('[role=dialog],[role=grid],[role=listbox],[role=menu]')` exista. Si no, `↑/↓`/`Home`/`End` mueven la lista desde la rejilla y los menús, y `T`/`F`/`E` se disparan dentro del picker.
3. **Fecha «sin hora» (23:59)**: cualquier código que compare `due_at` con «hoy» debe usar `isDateOnly` y las fronteras de París. Si Producto elige el campo `due_has_time` (P1), cambia la persistencia, no la UI.
4. **Búsqueda en notas**: las notas no viajan enteras a la lista; sin `/api/search` la línea de coincidencia «Nota · …» no es posible. Las facetas pueden salir antes, en cliente.

## 5. Preguntas abiertas para Producto

1. **P1 · Fecha sin hora.** ¿Aceptamos la convención «23:59 de París = sin hora» (sin migración) o añadimos `due_has_time: boolean` al modelo? La UI es la misma; el riesgo de la convención es que alguien elija 23:59 a propósito y se le oculte la hora.
2. **P2 · Autor de notas.** ¿Añadimos `created_by`/`updated_by` a `Note`? Sin ese dato no podemos mostrar el testigo (ActorMark) en notas escritas por agentes, que es justo donde más aporta.
3. **P3 · Faceta Dueño.** ¿Filtra por quién tiene la pelota ahora (testigo visible, propuesta) o por el asignado (`assignee_id`) aunque el ítem esté en «Te necesita»?
4. **P4 · Alcance de la búsqueda.** El brief deja la búsqueda completa en P1. ¿Confirmamos adelantarla a v1.2 (con `GET /api/search`) manteniendo `⌘K` reservado para la paleta? ¿Las notas sin ítems vinculados deben aparecer como resultado en algún sitio?
5. **P5 · Todo agrupado por fecha por defecto.** ¿Activado por defecto (propuesta) o como opción que el usuario elige?

## 6. Decisiones Producto (cerradas · 8 oct 2026)

Criterio: cerrar con lo que David pidió en esta ronda (selector de fechas, filtros completos, markdown en notas, 10k tareas, docs MCP EN/ES) sin ampliar modelo ni alcance más allá de eso. Las decisiones coinciden con los supuestos con los que Dev ya implementa.

| # | Decisión | AC verificable |
|---|---|---|
| P1 · Fecha sin hora | **Se acepta la convención «23:59 Europe/Paris = sin hora»**, sin migración ni `due_has_time` en v1.2. Riesgo aceptado: un 23:59 elegido a mano se muestra como «sin hora». `due_has_time` queda en backlog si aparece el caso real. | V12-D8 tal cual. Además: elegir 23:59 a mano en el picker guarda `…T21:59:00.000Z` (CEST) y la fila lo muestra sin hora, igual que «Sin hora»; `items_get` vía MCP devuelve el mismo `due_at`. |
| P2 · Autor de notas | **No en v1.2.** `Note` no gana `created_by`/`updated_by` en esta ronda; la línea de metadatos muestra solo la fecha y nunca inventa autoría (§3.3.4). Pasa a backlog P1 junto con la autoría vía MCP. | Una nota creada por MCP (`notes_create`) y otra desde la web muestran la misma línea «hace X» sin ActorMark; ninguna dice «Tú» ni un agente. |
| P3 · Faceta Dueño | **Filtra por el testigo visible** (quién tiene la pelota), coherente con Q2 de v1.1: `needs_you` cuenta como David aunque `assignee_*` siga siendo el agente. «Qué tiene cada agente» ya lo cubre la vista Con agentes. | Ítem de Grok Bot en `needs_you`: aparece con `actor=david` y **no** con `actor=grok-bot`; al devolverlo (`assigned`), invierte. Mismo resultado en web y en `GET /api/search`. |
| P4 · Alcance de la búsqueda | **Sí, se adelanta a v1.2** la búsqueda completa con `GET /api/search` (David pidió filtros completos). `⌘K` sigue reservado para la paleta, que sigue en P1. Las notas sin ítems vinculados **no** salen en las vistas de ítems; se encuentran con la búsqueda dentro de la vista **Notas** (`/notes?q=`, título + cuerpo, misma normalización sin tildes). | Buscar «demo» en `/all` devuelve ítems cuyo título, motivo, intención, descripción o nota vinculada contienen «demo»; una nota huérfana con «demo» no aparece en `/all` y sí en `/notes?q=demo`. `⌘K` fuera del editor de notas no abre nada. |
| P5 · Agrupación por defecto | **Activada por defecto en Todo**, con el interruptor «Agrupar: Fecha \| Ninguno» ya especificado en §1.8 (`localStorage`). Atención y las demás vistas no cambian. | Primera carga de `/all` con `localStorage` vacío: aparecen las cabeceras de grupo por fecha. Tras elegir «Ninguno» y recargar, sigue sin agrupar. |
