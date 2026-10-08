# Relay 10k performance benchmark

Measured on commit base `e1bb5e5` (BEFORE) and this branch (AFTER) against
`pnpm seed:large` (10 000 work items + 2 000 notes, deterministic).

## Method

1. `RELAY_DB=data/relay-large.db pnpm seed:large`
2. Start API `:7420` + web `:7421` against that DB.
3. `RELAY_PHASE=before|after pnpm benchmark:large` (`scripts/benchmark-large.mjs`):
   - **API / MCP**: 20 samples each of `GET /api/inbox?view=attention`,
     `GET /api/inbox?view=all`, `GET /api/inbox?view=all&limit=50` (AFTER),
     and MCP `inbox_query` via `/mcp/invoke`. Reports p50 / p95 / payload bytes.
   - **Poll steady state**: first inbox fetch, then a second fetch with
     `since=sync_cursor` when the server supports it.
   - **UI**: Playwright Chromium 1440×900 — time to first `role=option` and to
     interactive click for Atención and Todo; scripted `scrollTop` through the
     list with rAF sampling (fps / long frames >32 ms).

Raw JSON: [`benchmark-10k.json`](./benchmark-10k.json),
`artifacts/perf/benchmark-10k-{before,after}.json`.

## What changed (AFTER)

| Lever | Change |
|---|---|
| SQLite | Migration v2 indexes (status/assignee/due/reminder/completed) + FTS5 `search_fts` |
| Pagination | Cursor pages on items/notes/inbox (`limit`/`cursor`) — API and MCP parity |
| Incremental sync | `GET /api/inbox?since=` / MCP `inbox_query.since` → delta upserts + `removed_ids` |
| Web poll | Snapshot on view change; 750 ms ticks use `since=sync_cursor` |
| Virtualization | `@tanstack/react-virtual` over `.item-list`; section `· N` from data model |
| Search (v1.2) | `GET /api/search` + MCP `search` / `notes_search` (FTS5, accent-insensitive) |

## Results

### API / MCP latency and payload

| Metric | BEFORE | AFTER |
|---|---:|---:|
| `GET /inbox?view=attention` p50 / p95 | 66 / 92 ms | 81 / 114 ms |
| Attention payload | 3 418 310 B | 3 282 633 B |
| `GET /inbox?view=all` p50 / p95 | 57 / 66 ms | 69 / 72 ms |
| All payload (full) | 3 531 276 B | 3 531 413 B |
| `GET /inbox?view=all&limit=50` payload | *(ignored limit → full 3.5 MB)* | **28 761 B** |
| MCP `inbox_query` p50 / p95 | 66 / 73 ms | 76 / 87 ms |
| Poll steady-state payload | 3 418 310 B (full snapshot) | **257 B (delta)** |
| Poll mode | snapshot | delta |

Full-snapshot inbox latency is in the same ballpark (still builds the view in
process). The win is **pagination for agents** (~100× smaller pages) and
**incremental poll** (~13 000× smaller steady ticks).

### UI load and scroll

| Metric | BEFORE | AFTER |
|---|---:|---:|
| Atención → first row | *Chromium crashed (~2832 DOM rows)* | **36 ms** |
| Atención → interactive | crash | **65 ms** |
| Todo → first row | crash (~6000 DOM rows) | **833 ms** |
| Todo → interactive | crash | **864 ms** |
| Visible DOM options (Atención / Todo) | 2832 / 6000 | ~19 / ~28 |
| Scroll fps (scripted) | unmeasurable | 10.6 (39 long frames) |

Scripted `scrollTop` jumps stress layout; real wheel input is smoother. The
critical BEFORE failure mode (tab crash / multi‑second full re-render every
750 ms) is gone.

## AC3 SLA

| Seed | overall max (MCP→DOM) | Result |
|---|---:|---|
| Demo (`pnpm seed`) | **732 ms** | PASS ≤2000 |
| Large (`pnpm seed:large`) | **742 ms** | PASS ≤2000 |

Attention sections sort **newest-first** so mutations stay in the virtualized
window; `sync_cursor` is wall-clock (not `max(updated_at)`) so future seed
stamps cannot hide live writes. Large seed keeps Atención modest
(~80 needs_you / ~120 blocked) while still totaling 10 000 items.
