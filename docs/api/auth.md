# Device auth & pairing

Relay stores data on your own machine. On **loopback** (`127.0.0.1` /
`localhost`) with no public URL (or a loopback `RELAY_PUBLIC_URL`) the API stays
open for the local web UI and MCP stdio — same as before — **unless** a proxy
header is present or `RELAY_REQUIRE_TOKEN=1` is set.

When the server listens on **anything else** (LAN `0.0.0.0`, a LAN IP), **or**
when `RELAY_PUBLIC_URL` points at a **non-loopback** host (typical reverse-proxy
/ `tailscale serve` setup even while binding `127.0.0.1`), **every request needs
a per-device token**. A non-loopback public URL on a loopback bind is treated
**as if `RELAY_REQUIRE_TOKEN=1`** (no HTTP loopback exemption for `pair/start`).

Tailscale is the supported way to reach the server from outside the house.
Nothing is hosted externally. See [lan-and-tailscale.md](../deploy/lan-and-tailscale.md).

## Policy

| Bind / public URL | Default `RELAY_REQUIRE_TOKEN` | Behaviour |
| --- | --- | --- |
| `127.0.0.1` / `localhost` / `::1`, no public URL or loopback public URL | `false` | No token required (local web + MCP), **unless** proxy headers are present |
| `0.0.0.0` or LAN IP | `true` | Bearer token required on `/api/*`, `/mcp`, and `/mcp/invoke` |
| Loopback bind + non-loopback `RELAY_PUBLIC_URL` | `true` (as explicit `1`) | Same as `RELAY_REQUIRE_TOKEN=1` — tokens required; `pair/start` has no HTTP loopback exemption |

- Override with `RELAY_REQUIRE_TOKEN=0` or `1`.
- Non-loopback bind **or** non-loopback `RELAY_PUBLIC_URL` + `RELAY_REQUIRE_TOKEN=0`
  **refuses to start** with a clear security message.
- Public without a token (even when required): `GET /api/health`,
  `POST /api/pair/claim`.
- `GET /api/health` also reports `{ require_token, require_token_explicit }`.
- Startup logs a one-line **auth mode** notice (never tokens), e.g.
  `Auth mode: tokens required (non-loopback RELAY_PUBLIC_URL; as RELAY_REQUIRE_TOKEN=1)`.

### Route auth coverage

| Route | Auth when tokens required |
| --- | --- |
| `GET /api/health` | Public |
| `POST /api/pair/claim` | Public |
| `POST /api/pair/start` | Device token, or trusted loopback (never with proxy headers / explicit flag / non-loopback public URL on loopback bind) |
| `GET/PATCH/DELETE /api/*` (rest) | Device token (Bearer); `/api/stream` also accepts stream ticket |
| `GET /api/stream` | Device token or `?access_token=` stream ticket |
| `POST /api/stream/ticket` | Device token |
| `ALL /mcp` (Streamable HTTP) | Device token |
| `POST /mcp/invoke` | Device token |
| Static SPA / `/` | Not an API surface |

### Proxy headers (no loopback spoofing)

If a request carries any of `Forwarded`, `X-Forwarded-For`, `X-Forwarded-Host`,
`X-Forwarded-Proto`, `X-Real-IP`, or any `Tailscale-*` header (e.g.
`Tailscale-User-Login`), Relay treats it as **remote**: tokens are required and
the loopback exemption for `pair/start` is refused. This closes the hole where
`tailscale serve` (or any reverse proxy) makes every peer look like `127.0.0.1`.

**Also:** setting a non-loopback `RELAY_PUBLIC_URL` while binding loopback enforces
tokens even when the proxy adds **no** forwarded headers (defence in depth for
minimal proxies). Prefer `RELAY_REQUIRE_TOKEN=1` explicitly in operator docs too.

### Explicit `RELAY_REQUIRE_TOKEN=1`

When the operator sets the flag explicitly (or when a non-loopback
`RELAY_PUBLIC_URL` forces the same policy on a loopback bind):

- **No** HTTP loopback exemption at all — every `/api/*` (except public),
  `/mcp`, and `/mcp/invoke` needs a valid device token.
- `POST /api/pair/start` requires an **already-authenticated device**.
- Bootstrap a new code from the host with the local admin CLI (talks to SQLite
  directly — unreachable through a proxy):

```bash
pnpm relay:pair
```

Prints a 6-digit code + QR payload. Claim via `POST /api/pair/claim` (or Settings
→ Devices → Register this browser).

**Why CLI (not a one-time admin secret):** a secret printed at startup can still
be replayed over HTTP if it leaks into a log or screenshot; the CLI never opens
an HTTP surface for pairing start.

## Tokens

- One opaque token per device (32 random bytes, base64url).
- Stored as **SHA-256 hex** only (`devices.token_hash`). Plaintext is returned
  once from `pair/claim` and never written to the DB or logs.
- Send as `Authorization: Bearer <token>`.
- Revoke with `DELETE /api/devices/:id` → subsequent requests get `401`, open
  SSE streams for that device close immediately, and its stream tickets are
  deleted.

### Web browser under token auth

The web UI keeps its device token in **`localStorage`** (`relay.device_token`),
not `sessionStorage`. Justification: the token is a long-lived paired-device
credential (same model as a phone); `sessionStorage` would force re-pairing on
every tab close. Revoke from Settings → Devices if the browser is shared.

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

Trusted loopback **or** Bearer device required — never when
`RELAY_REQUIRE_TOKEN=1` is explicit (or when a non-loopback `RELAY_PUBLIC_URL`
forces that policy on a loopback bind — use `pnpm relay:pair`), and never when
proxy headers are present.

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
| `RELAY_HOST` | Bind address (`127.0.0.1`, `0.0.0.0`, LAN IP, Tailscale IP) |
| `RELAY_REQUIRE_TOKEN` | Force token auth (`0`/`1`); default from bind **and** public URL. Explicit `1` (or non-loopback public URL on loopback bind) disables HTTP loopback pairing. |
| `RELAY_PUBLIC_URL` | Base URL in pairing QR (no trailing slash). Non-loopback value on a loopback bind enforces tokens. |

Never commit tokens or pairing codes. Never log them.
