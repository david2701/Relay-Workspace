# Relay UI specs v1.2 — criteria checklist

Base: `e1bb5e5`. Status: **PASS** (verified by unit/e2e/code), **gap** (partial), **deferred** (Producto backlog / out of scope).

Assumptions locked by §6 (Producto 8 oct 2026): 23:59 = sin hora; no note authorship; Dueño = ball holder (`needs_you` → david); `GET /api/search` in v1.2; Todo date-group default on.

## Spec D — DateTimePicker + groups

| ID | Status | Evidence / note |
|---|---|---|
| V12-D1 | PASS | `DateTimeField` removed; no native date/time inputs |
| V12-D2 | PASS | `T` / `Shift+T` in `App.tsx` open due/reminder pickers |
| V12-D3 | PASS | Shortcut «Mañana» → 09:00 Paris (`date_parse` / shortcuts tests) |
| V12-D4 | PASS | `date_parse.test.ts` table |
| V12-D5 | PASS | Ambiguous `15` + accent-insensitive `manana` |
| V12-D6 | PASS | «En 1 hora» quarter-hour rounding |
| V12-D7 | PASS | `paris_time.test.ts` DST overlap/gap |
| V12-D8 | PASS | `isDateOnly` 23:59; §6 P1 also covers hand-picked 23:59 |
| V12-D9 | gap | TZ hint implemented in picker; no Playwright TZ e2e |
| V12-D10 | gap | Grid keyboard handlers present; no capture e2e |
| V12-D11 | PASS | Esc cancels + `stopPropagation`; global ignores `[role=grid]` |
| V12-D12 | gap | Tokens/CSS present; visual capture pending review |
| V12-D13 | gap | Motion CSS + reduced-motion; not timed in e2e |
| V12-D14 | PASS | `date_groups.test.ts` order |
| V12-D15 | gap | Collapsed keys in `localStorage`; J-skip logic; no reload e2e |
| V12-D16 | gap | Narrow sheet + scrim; focus-trap incomplete |
| §6 P1 AC | PASS | `product_decisions_v12.test.ts` + API `items_get` same `due_at` |
| §6 P5 AC | PASS | `readTodoGroupBy` empty → `due`; `none` persists (`todo_group_pref`) |

## Spec F — Filters + search

| ID | Status | Evidence / note |
|---|---|---|
| V12-F1 | PASS | SearchField debounce 150 ms, min 2 chars |
| V12-F2 | PASS | FTS5 + normalize diacritics (core `search.test.ts`) |
| V12-F3 | PASS | `MatchSnippet` + `<mark>` wired |
| V12-F4 | PASS | `useUrlState` hydrate before list |
| V12-F5 | PASS | Canonical status order + pushState |
| V12-F6 | PASS | `replaceState` for `q` |
| V12-F7 | PASS | Unknown status stripped |
| V12-F8 | PASS | Vite SPA + server `index.html` fallback |
| V12-F9 | PASS | Server due range Paris-inclusive (`search` tests) |
| V12-F10 | PASS | AND across facets |
| V12-F11 | gap | FacetMenu keyboard implemented; no e2e |
| V12-F12 | PASS | Header `N de M` + live region |
| V12-F13 | PASS | Empty copy without illustrations |
| V12-F14 | PASS | Tokens `--chip-h` / `--control-h` |
| V12-F15 | PASS | Contrast matrix includes `--ink`/`--mark-bg` |
| §6 P3 AC | PASS | `product_decisions_v12` + API/MCP search: needs_you↔assigned invert |
| §6 P4 AC | PASS | Item search excludes orphans; `/api/notes/search` + MCP `notes_search` |

## Spec M — Markdown notes

| ID | Status | Evidence / note |
|---|---|---|
| V12-M1 | PASS | `toPlainText` extracts; line-clamp 3 |
| V12-M2 | PASS | Heading remap h3/h4/h5 + tokens |
| V12-M3 | PASS | Sanitization unit tests (no script/on*) |
| V12-M4 | PASS | `javascript:` stripped |
| V12-M5 | PASS | No `<img>` for external; «Imagen: …» |
| V12-M6 | PASS | External noreferrer + ↗; internal same tab |
| V12-M7 | gap | Blockquote CSS; no visual e2e |
| V12-M8 | gap | Code block CSS; no overflow e2e |
| V12-M9 | PASS | `toggleTask` unit (1-char diff) |
| V12-M10 | PASS | Native checkbox; global handler skips `INPUT` |
| V12-M11 | gap | Autosave 800 ms implemented; no network e2e |
| V12-M12 | PASS | Esc save+exit + stopPropagation |
| V12-M13 | PASS | ⌘K in editor only |
| V12-M14 | PASS | 409 banner + keep editor text |
| V12-M15 | PASS | Draft localStorage recover/discard |
| V12-M16 | PASS | Contrast pairs in matrix |
| §6 P2 AC | PASS | `formatNoteMetaLine` date-only; Note keys exclude `created_by` |

## Keyboard chain (§4.2)

| Layer | Status |
|---|---|
| Popover/menu Esc | PASS (`stopPropagation`) |
| Note editor Esc | PASS |
| Search text Esc | PASS |
| Shortcuts modal Esc | PASS |
| Capture Esc | PASS |
| Deselect Esc | PASS (last) |
| Arrows/Home/End in grid/menu | PASS (global ignore) |
| Space on checkbox | PASS (native `INPUT`) |
