# LAN access & Tailscale

Relay runs on a machine in your home. Phase 2 allows binding beyond loopback
**only with per-device tokens**. Outside the house, use **Tailscale** — Relay
is not a hosted cloud service.

## Recommended setup

Bind **directly** to the Tailscale IP or `0.0.0.0` so peers are real remote
addresses and token auth is enforced by default:

```bash
# Prefer Tailscale IP or 0.0.0.0 — tokens required automatically
RELAY_HOST=0.0.0.0 \
RELAY_PORT=7420 \
RELAY_PUBLIC_URL=http://your-host.tailnet-name.ts.net:7420 \
RELAY_WEB_ORIGIN=http://your-host.tailnet-name.ts.net:7421 \
pnpm --filter @relay/server start
```

Or bind only the Tailscale interface IP. Pair phones with Settings → Devices
(from a trusted loopback session) or `pnpm relay:pair` on the host when
`RELAY_REQUIRE_TOKEN=1` is set explicitly.

### mDNS `relay.local`

Not implemented in this release (keeps dependencies light). Use the LAN IP or
Tailscale MagicDNS. A future pass can add a tiny mDNS advertiser if needed.

## `tailscale serve` / reverse proxies — you MUST set `RELAY_REQUIRE_TOKEN=1`

```bash
RELAY_HOST=127.0.0.1 \
RELAY_REQUIRE_TOKEN=1 \
RELAY_PUBLIC_URL=https://your-host.tailnet-name.ts.net \
pnpm --filter @relay/server start

# Then (illustrative)
tailscale serve --bg 7420
```

**Why:** `tailscale serve` (and nginx, Caddy, …) terminate TLS and forward to
localhost. Every request’s TCP peer is `127.0.0.1`, so the old “loopback needs
no token / can start pairing” rule would let **anyone on the tailnet** in
without a device token and start pairing codes.

With `RELAY_REQUIRE_TOKEN=1`:

- No HTTP loopback exemption — Bearer token on `/api/*` and `/mcp/invoke`.
- Start pairing with **`pnpm relay:pair`** on the host (writes to SQLite
  directly; not reachable through the proxy), or from an already-paired device.
- Register the local web browser via Settings → Devices (enter the CLI code);
  the token is kept in `localStorage`.

Relay also refuses the loopback exemption when proxy headers are present
(`X-Forwarded-For`, `Forwarded`, `Tailscale-*`, …) even if you forgot the env
flag — defence in depth. **Still set `RELAY_REQUIRE_TOKEN=1`** when using a
proxy so pairing cannot be started over HTTP from loopback-looking peers.

## Threat note

| Threat | Mitigation |
| --- | --- |
| Attacker on the tailnet hits `tailscale serve` → localhost | `RELAY_REQUIRE_TOKEN=1` + per-device tokens; proxy headers disable loopback exemption |
| Attacker triggers `pair/start` via proxied “loopback” | Explicit flag → CLI-only bootstrap; otherwise proxy headers → 401 |
| Stolen phone / browser | Revoke device in Settings → Devices |
| Token in URL / logs | Stream tickets for EventSource; never log codes/tokens |

Tailscale is **transport** trust, not app auth. Device tokens remain required.

## Native app notes (guidance only — apps unchanged here)

### Android

- Cleartext HTTP to LAN IPs needs a network-security config allowing cleartext
  for private ranges (or use HTTPS via Tailscale serve).
- Store the device token in **EncryptedSharedPreferences** (planned).

### iOS

- Add `NSLocalNetworkUsageDescription` when browsing/connecting on the LAN.
- App Transport Security: localhost is fine; plain HTTP to LAN IPs may need
  exceptions, or use Tailscale HTTPS.
- Store the device token in the **Keychain** (planned).

Phone pairing UI (QR scan / 6-digit entry) follows the setup designs under
`penpot/`; native implementation is a later PR. The web Settings → Devices
panel is the host-side pairing surface today.

## Security checklist (operators)

- Prefer binding the Tailscale IP / `0.0.0.0` over `tailscale serve` when possible.
- If you use `tailscale serve` or any reverse proxy, set **`RELAY_REQUIRE_TOKEN=1`**.
- Do not set `RELAY_REQUIRE_TOKEN=0` on a non-loopback bind (server exits).
- Do not put long-lived tokens in URLs; use stream tickets for EventSource.
- Revoke lost phones from Settings → Devices.
- Prefer Tailscale over port-forwarding the router to the public internet.
