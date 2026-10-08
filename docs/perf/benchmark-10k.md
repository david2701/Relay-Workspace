# Relay 10k performance benchmark

Measured on commit base `e1bb5e5` (BEFORE) and this branch (AFTER) against
`pnpm seed:large` (10 000 work items + 2 000 notes, deterministic).

## Seed inventory (SQL)

`pnpm seed:large` writes **exactly 10 000** work items and **2 000** notes:

| status | count |
|---|---:|
| inbox | 2200 |
| assigned | 2000 |
| in_progress | 2000 |
| blocked | 120 |
| needs_you | 80 |
| done | 2600 |
| cancelled | 1000 |
| **total** | **10000** |

- **Todo** (`view=all`) is non-terminal only → **6400** (excludes done+cancelled).
- **Atención** is intentionally **modest**: ~80 Te necesita / ~120 Atascado, plus
  schedule-driven «Para hoy» (~1900). Not a 700+/2k stress of those sections.
- Earlier screenshots that showed «Atención · 2719» / «Te necesita · 700» were
  from a prior seed shape; current seed and docs match the table above.

## Method

1. `RELAY_DB=data/relay-large.db pnpm seed:large`
2. Start API `:7420` + web `:7421` against that DB.
3. `RELAY_PHASE=before|after pnpm benchmark:large`:
   - API / MCP latency and payload (full + paged)
   - Poll: first page + `since=sync_cursor` delta
   - UI first-row / interactive (Playwright 1440×900)
   - **Wheel scroll**: `mouse.wheel` in ~100 px steps over a few seconds + rAF
     frame sampling + CDP `Performance.getMetrics` (not `scrollTop` jumps)

## What changed (AFTER)

| Lever | Change |
|---|---|
| SQLite | Migration v2 indexes + FTS5 |
| Pagination | Cursor pages API/MCP; **web uses them** (Todo `limit=50`, Atención `limit=200`) |
| Counts | `total_count` / `section_counts` from server; headers use those, not DOM |
| Incremental sync | Delta poll for loaded window + counts; load-more merges onto latest ref |
| Virtualization | Fixed row estimates (no `measureElement`); memoized rows; flash→`scrollToIndex` |
| Atención order | Spec **oldest-first** restored; AC3 via flash seek (not newest-first) |
| Scroll | ~60 fps wheel; p95 frame ≈16.7 ms |

## Results

### API / MCP latency and payload

| Metric | BEFORE | AFTER |
|---|---:|---:|
| `GET /inbox?view=attention` (full) p50 / p95 | 66 / 92 ms | 71 / 79 ms |
| Attention full payload | 3 418 310 B | 2 652 207 B |
| `GET /inbox?view=attention&limit=200` (web first page) | *(n/a / full)* | **112 214 B**, p50 **60 ms** |
| `GET /inbox?view=all` (full) p50 / p95 | 57 / 66 ms | 61 / 65 ms |
| All full payload | 3 531 276 B | 3 792 520 B |
| `GET /inbox?view=all&limit=50` | 3.5 MB (limit ignored) | **26 283 B**, p50 **47 ms** |
| MCP `inbox_query` (full) p50 / p95 | 66 / 73 ms | 70 / 80 ms |
| Poll initial (web Atención page) | 3.4 MB snapshot | **112 KB page** |
| Poll steady-state | 3.4 MB snapshot | **257 B delta** |

### UI load

| Metric | BEFORE | AFTER |
|---|---:|---:|
| Atención → first row | Chromium crash (~2832 DOM rows) | **34 ms** |
| Atención → interactive | crash | **51 ms** |
| Todo → first row | crash (~6000 DOM rows) | **145 ms** (goal ≤300) |
| Todo → interactive | crash | **163 ms** |

### Wheel scroll (mouse.wheel + rAF + CDP)

| View | fps | p95 frame | >16.7 ms | >32 ms |
|---|---:|---:|---:|---:|
| Atención | **60.1** | **16.8 ms** | 38 | **0** |
| Todo | **59.3** | **16.7 ms** | 45 | 2 |

Frames above 16.7 ms are mostly compositor scheduling jitter around the 60 Hz
quantum; Atención has **zero** >32 ms long frames. CDP on Todo: LayoutCount 3,
ScriptDuration ~0.27 s over the whole sample window.

## AC3 SLA (MCP→DOM, spec oldest-first)

| Seed | overall max | Result |
|---|---:|---|
| Demo (`pnpm seed`) | **720 ms** | PASS ≤2000 |
| Large (`pnpm seed:large`) | **695 ms** | PASS ≤2000 |

## Trade-offs

- Atención first page is **200** rows (API max) so Te necesita + Atascado fit
  under oldest-first; payload **~112 KB** after omitting duplicated `sections`
  bodies from paged JSON (client rebuilds sections).
- Full-snapshot inbox latency is unchanged in ballpark; the win is **paged web
  loads**, **delta poll**, and **stable wheel scroll**.
- Newest-first was reverted (out of product scope); proposal remains open in the PR.
