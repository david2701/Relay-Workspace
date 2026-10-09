# Realtime stream API (`GET /api/stream`)

Server-Sent Events (SSE) over the global `item_events` log. While an app or web
page is open it stays on this stream (owner decision **D4**); push notifications
when the page is closed come later.

MCP tooling is unchanged — agents keep using `changes_list` / `inbox_query` /
`context_get`.

## Endpoint

```
GET /api/stream?after_seq=
Accept: text/event-stream
Last-Event-ID: <seq>   # optional; preferred over query when both are set
```

| Status | When |
| --- | --- |
| `200` | Stream open (`Content-Type: text/event-stream`) |
| `400` | Bad or **empty** `Last-Event-ID` / `after_seq` (same rules as [events.md](./events.md); response names the field) |
| `503` | Concurrent connection cap exceeded (default **50**, `RELAY_SSE_MAX_CONNECTIONS`) |

Empty values (`after_seq=`, `Last-Event-ID:` with a blank value) return **400**
`validation_error` with `field` set to `after_seq` or `Last-Event-ID`. Omit the
parameter/header to start from `0`.

### Auth

When `RELAY_REQUIRE_TOKEN` is on (default for non-loopback binds), `/api/stream`
requires auth via `authorizeStream`:

- `Authorization: Bearer <device token>`, or
- short-lived `?access_token=` stream ticket from `POST /api/stream/ticket`
  (EventSource cannot set headers — see [auth.md](./auth.md)).

Loopback with tokens optional stays unauthenticated for local web.

## Wire format

On connect the server sends:

```
retry: 3000
```

Each `item_events` row is one SSE message:

```
id: 12
event: status_changed
data: {"id":"evt_…","seq":12,"item_id":"itm_…","type":"status_changed",…}
```

| Field | Meaning |
| --- | --- |
| `id` | Global `seq` (EventSource resumes with `Last-Event-ID`) |
| `event` | Item event `type` (`created`, `answered`, `taken`, …) |
| `data` | Full event JSON (same shape as [events.md](./events.md)) |

Heartbeat (SSE comment) every **15 s**:

```
: heartbeat
```

### Far behind → `resync`

If the client cursor is more than **N** events behind the head (default
`RELAY_SSE_RESYNC_THRESHOLD=5000`), the server skips a huge replay and sends:

```
id: <head_seq>
event: resync
data: {"reason":"too_far_behind","after_seq":…,"head_seq":…,"threshold":5000}
```

Clients should refetch the inbox (snapshot) and continue from `head_seq`.

## Connect / resume (no gap, no duplicate)

1. Honour `Last-Event-ID` or `?after_seq=` (integer `0…MAX_SAFE_INTEGER`).
   Prefer `Last-Event-ID` when present. Empty values are **400**, not `0`.
2. **Subscribe first** and buffer live fan-out.
3. Replay missed rows from `item_events` in order (paged).
4. Flush the buffer, **dedupe by `seq`**, then stay live.

Browsers reconnect automatically (`retry: 3000`) and send `Last-Event-ID`.

## Cross-process delivery

Writes from HTTP, MCP stdio in another process, and the CLI all commit into the
same SQLite file. The stream hub polls `MAX(seq)` every **250 ms**
(`RELAY_SSE_WATCH_MS`) and fans new pages out to every connected client — so the
**client never polls**. This reuses the same multi-process visibility model as
`PRAGMA data_version` cache invalidation in `@relay/core`.

## Web client

The SPA opens one `EventSource` to `/api/stream`. On each event it applies an
inbox delta via `GET /api/inbox?after_seq=`. Sync seal states:

| State | Seal copy (EN) |
| --- | --- |
| connected | `Up to date · {relative}` |
| reconnecting | `Reconnecting…` |
| offline | `Offline` |

There is **no** 750 ms polling fallback for normal operation.

## Config

| Env | Default | Role |
| --- | --- | --- |
| `RELAY_SSE_MAX_CONNECTIONS` | `50` | Cap → `503` |
| `RELAY_SSE_RESYNC_THRESHOLD` | `5000` | Far-behind `resync` |
| `RELAY_SSE_WATCH_MS` | `250` | Server-side `MAX(seq)` poll |
