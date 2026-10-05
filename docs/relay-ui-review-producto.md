# Review de producto — Relay UI specs v1.0

**Fecha:** 5 oct 2026  
**Revisor:** Producto  
**Specs:** `/workspace/relay-ui-specs.md`  
**Brief:** `/workspace/task-hub-brief-v2.md` (v2.1)  
**Veredicto:** **Aprobado con ajustes menores** — listo para Dev Senior tras aplicar los deltas de §B (o Dev puede arrancar en paralelo si UI los parchea en <1 pasada).

---

## A) Qué apruebo (no negociar hacia abajo)

1. **Frase norte + firma «el testigo»** — diferencia clara vs Todoist/Reminders; QA puede auditarlo.
2. **Home = Atención** (needs_you → blocked → hoy), no inventario; contador solo en Atención.
3. **ActorMark** círculo/humano vs cuadrado/agente — identidad agent≠user (AC10) resuelta sin chatbot.
4. **Notas 1ª clase + «Lo que ve el agente»** — AC4/AC5 demostrados en UI, no solo en MCP.
5. **Recordatorio con intención** (due + reminder + intent) en fila/detalle/Próximos — AC8.
6. **ReasonBanner + reasons separadas** + devolver testigo / lo hago yo — loop humano↔IA usable.
7. **Sugerido** heurístico sin ML, solo en Atención, sin empty spam — AC7.
8. **Gate anti-genérico §5** verificable (20 NOs) — AC12 accionable.
9. **Teclado-first**, sync honesta ≤2 s, sin toasts de agente — craft pro.
10. **Trazabilidad AC1–AC14** en §0.6 + criterios GWT en §7 (estrellas bien priorizadas).
11. **Alcance P0/P1/P2/OUT** alineado al brief; esqueletos Mac/iOS proporcionales.
12. **Tokens + contraste** documentados — base sólida para AC12 técnico.

---

## B) Ajustes menores (UI parchea specs; no redesarrollar)

| # | Ajuste | Por qué |
|---|---|---|
| B1 | Añadir bloque **AC1** explícito en §7 (GWT create web↔MCP idéntico + badge `chat`) | Está en mapa 0.6 pero falta checklist §7 simétrico |
| B2 | En popover **Delegar**: si falta `goal` **y** 0 notas, mostrar aviso «Sin contexto: el agente trabajará a ciegas» + CTA Vincular/Objetivo; **no bloquear** confirmar | Protege AC5 sin matar velocidad |
| B3 | Unificar copy de persistencia «Ahora no»: `sessionStorage` (sobrevive reload de pestaña; muere al cerrar navegador) — alinear §1.6 y AC7 en una frase | Evitar ambigüedad session vs localStorage |
| B4 | Nota de **licencia tipográfica** Schibsted Grotesk: Dev debe confirmar licencia embebible; fallback documentado (p.ej. otra grotesca con mismo rol, no Inter/Geist) | Riesgo de implementación, no de concepto |
| B5 | En §7 AC3: añadir variante **blocked** vía MCP → aparece en Atención › Atascado en ≤2 s (simétrico a needs_you) | Cierra el “o se atasca” de la frase norte |

---

## C) Decisiones Producto sobre §9 (cerradas)

| Q | Decisión | Notas |
|---|---|---|
| **Q1** Catálogo agentes | **Sí** — config/API local (`id`, `display_name`, `monogram`). UI no inventa. Monogramas por defecto: GB, DS, UX, RD, QA (ajustables). | Dev define endpoint |
| **Q2** Testigo en needs_you | **Confirmado** — `assignee_*` permanece el agente; UI muestra testigo=David. `items_ask_user` **no** cambia assignee. | Handoff semántico correcto |
| **Q3** Reopen | **Confirmado** — → `assigned` si hay assignee; si no → `inbox`. Limpia completed_*. | Como specs |
| **Q4** Respuesta needs_you | **Confirmado** — nota rol `decision` vinculada es la vía oficial P0 (sin chat en app). | Agent lee vía `context_get` |
| **Q5** «Ahora no» | **Confirmado** — solo cliente, sin `dismiss` MCP en P0. | sessionStorage |
| **Q6** Umbrales | **Confirmados** defaults: stale 24 h, needs_you suggest >2 h, reminder ≤2 h, due ≤24 h. Configurables más tarde. | S13 |
| **Q7** Plantillas/timeline | **Seguir v2.1** — plantillas + activity strip = **P1**. | Specs OK |

---

## D) Gaps conscientes (NO bloquean P0)

- Captura+delegar en un gesto → P1 (plantillas).
- Activity strip / notificaciones OS → P1.
- Realtime SSE → post-P0 (polling 2 s aceptado).
- Multi-dispositivo / server → OUT.

---

## E) Siguiente paso

1. UI aplica B1–B5 (parche corto al markdown).  
2. Grok Bot desbloquea **Dev Senior** con: brief v2.1 + specs (+ review).  
3. Producto revisará capturas claro/oscuro en el gate AC12 al final de la build web.

— Producto
