# Device auth & pairing

Relay stores data on your own machine. On **loopback** (`127.0.0.1` /
`localhost`) the API stays open for the local web UI and MCP stdio — same as
before. When the server listens on **anything else** (LAN `0.0.0.0`, a LAN IP),
**every request needs a per-device token**.

Tailscale is the supported way to reach the server from outside the house.
Nothing is hosted externally. See [lan-and-tailscale.md](../deploy/lan-and-tailscale.md).

## Policy

| Bind | Default `RELAY_REQUIRE_TOKEN` | Behaviour |
| --- | --- | --- |
| `127.0.0.1` / `localhost` / `::1` | `false` | No token required (local web + MCP) |
| `0.0.0.0` or LAN IP | `true` | Bearer token required on `/api/*` and `/mcp/invoke` |

- Override with `RELAY_REQUIRE_TOKEN=0` or `1`.
- Non-loopback + `RELAY_REQUIRE_TOKEN=0` **refuses to start**.
- Public without a token (even when required): `GET /api/health`,
  `POST /api/pair/claim`.
- `POST /api/pair/start`: **loopback client** or an **already-authenticated
  device** only.

## Tokens

- One opaque token per device (32 random bytes, base64url).
- Stored as **SHA-256 hex** only (`devices.token_hash`). Plaintext is returned
  once from `pair/claim` and never written to the DB or logs.
- Send as `Authorization: Bearer <token>`.
- Revoke with `DELETE /api/devices/:id` → subsequent requests get `401`.

## EventSource / SSE (`GET /api/stream`)

Browsers’ `EventSource` cannot set `Authorization` headers.

**Choice: short-lived stream ticket as `?access_token=` (not a cookie).**

Why not a cookie?

- The web UI (`:7421`) and API (`:7420`) are different origins in dev; cookie
  credentialed CORS is brittle.
- Native clients already use Bearer; a query ticket matches EventSource without
  teaching cookies to every client.

Flow when tokens are required:

1. `POST /api/stream/ticket` with `Authorization: Bearer <device token>`
2. Response: `{ access_token, expires_at, expires_in }` (TTL **120 s**,
   reusable within the window for reconnects)
3. Connect: `GET /api/stream?access_token=<ticket>&after_seq=…`

Also accepted on `/api/stream`: `Authorization: Bearer <device token>` (for
`fetch` streams / non-EventSource clients).

**Do not** put the long-lived device token in the query string (referrers,
proxy logs). Tickets are hashed at rest like device tokens.

## Pairing

### `POST /api/pair/start`

Loopback or Bearer device required.

```json
{
  "code": "482193",
  "expires_at": "2026-10-09T12:05:00.000Z",
  "qr": { "v": 1, "url": "http://192.168.1.10:7420", "code": "482193" }
}
```

- 6-digit code, **5 minutes**, **single use**
- `qr.url` comes from `RELAY_PUBLIC_URL` (else inferred from host/port)
- mDNS `relay.local` is **not** advertised yet — set `RELAY_PUBLIC_URL` to your
  LAN IP or Tailscale MagicDNS name

### `POST /api/pair/claim`

Public. Body: `{ "code", "device_name", "platform": "ios"|"android"|"web"|"other" }`.

```json
{ "device_id": "dev_…", "token": "…", "device": { … } }
```

Rate limits: **5 failed attempts per code**, plus per-IP backoff after repeated
failures (`429`).

## Device management

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/devices` | List (includes revoked) |
| `PATCH` | `/api/devices/:id` | `{ "name" }` rename |
| `DELETE` | `/api/devices/:id` | Revoke |

Successful auth sets the actor to the human user and updates `last_seen_at`.

## Env

| Variable | Meaning |
| --- | --- |
| `RELAY_HOST` | Bind address (`127.0.0.1`, `0.0.0.0`, LAN IP) |
| `RELAY_REQUIRE_TOKEN` | Force token auth (`0`/`1`); default from bind |
| `RELAY_PUBLIC_URL` | Base URL in pairing QR (no trailing slash) |

Never commit tokens or pairing codes. Never log them.
