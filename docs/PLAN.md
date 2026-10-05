# Relay P0 — Implementation Plan

## Stack (decided)

- **TypeScript pnpm monorepo** on **Node 24.21 LTS**, TS 7.0.2 strict, ESM, Vitest, committed lockfile.
- `packages/core` — domain (WorkItem, Note, ItemNoteLink, agent catalog), zod schemas, transitions, recommend, context pack, SQLite (`node:sqlite` WAL) + migrations.
- `apps/server` — one local process: Hono HTTP API + MCP (`@modelcontextprotocol/sdk`, Streamable HTTP + stdio). Same core services, same SQLite file.
- `apps/web` — Vite + React SPA, 2 s polling, optimistic own mutations, Spanish UI copy from specs v1.1.

**Why:** one language + shared schemas makes AC1 (web↔MCP field parity) structural; MCP needs a standalone process anyway.

**Discarded:** Next.js (SSR adds nothing for single-user local); Rust/Go (slower for UI-heavy P0).

## Layout

```
apps/server/          Hono API + MCP mounts
apps/web/             Vite React SPA
packages/core/        schemas, store, services, recommend
scripts/              seed, ac3-demo, contrast-matrix
docs/                 PLAN, brief, UI specs v1.1, tokens
```

## Data model (brief §4)

| Entity | Fields |
| --- | --- |
| WorkItem | id, title, goal, status, assignee_*, due_at, reminder_at, reminder_intent, priority, blocked_reason, needs_you_reason, source, timestamps, completed_*, last_actor_* |
| Note | id, title, body_md, created_at, updated_at |
| ItemNoteLink | item_id, note_id, role ∈ {context, reference, decision} |
| Agent | id, display_name, monogram (catalog; UI never invents) |

Status enum: `inbox | assigned | in_progress | blocked | needs_you | done | cancelled`. Reasons required for blocked/needs_you. Reopen → `assigned` if assignee else `inbox`; clears `completed_*`. `items_ask_user` sets `needs_you` without changing assignee.

## MCP tools

`items_list/get/create/update/set_status/complete/reopen/delegate/ask_user`, `notes_create/get/update/list/link/unlink`, `context_get`, `inbox_query`, `inbox_recommend`. Actor via `actor` param + `X-Relay-Actor` header, validated against catalog. Agent ≠ user (AC10).

## ≤2 s sync

Web polls `inbox_query` + open `items_get` every 2 s. Own mutations optimistic. Changed rows flash `--accent-tint` 800 ms. No SSE/toasts for foreign changes.

## Risks

- R1 Todoist-like CRUD → gate AC3/5/7/12 + §5 checklist.
- R2 Agents skip status close → scripted AC3 demo each verify.
- R3 Schibsted license → OFL self-host; fallback Onest (not Inter/Geist).

## Verification

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm exec playwright test
node scripts/contrast-matrix.mjs
pnpm seed && pnpm demo:ac3
```

Ports: API/MCP `127.0.0.1:7420`, web `127.0.0.1:7421`. UI canonical: `docs/relay-ui-specs.md` (v1.1).
