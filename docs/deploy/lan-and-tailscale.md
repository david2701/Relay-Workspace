# LAN access & Tailscale

Relay runs on a machine in your home. Phase 2 allows binding beyond loopback
**only with per-device tokens**. Outside the house, use **Tailscale** — Relay
is not a hosted cloud service.

## Run on the LAN

```bash
# Example: listen on all interfaces, advertise this URL in pairing QR codes
RELAY_HOST=0.0.0.0 \
RELAY_PORT=7420 \
RELAY_PUBLIC_URL=http://192.168.1.10:7420 \
RELAY_WEB_ORIGIN=http://192.168.1.10:7421 \
pnpm --filter @relay/server start
```

- `RELAY_REQUIRE_TOKEN` defaults to **true** when the bind is not loopback.
- Pair a phone from the web UI on a loopback session (Settings → Devices), or
  from an already-paired device.
- Point phones at `RELAY_PUBLIC_URL` (LAN IP or Tailscale name).

### mDNS `relay.local`

Not implemented in this release (keeps dependencies light). Use the LAN IP or
Tailscale MagicDNS. A future pass can add a tiny mDNS advertiser if needed.

## Tailscale

1. Install Tailscale on the Relay host and on phones.
2. Prefer **MagicDNS** names (`http://your-host.tailnet-name.ts.net:7420`) as
   `RELAY_PUBLIC_URL`.
3. Optional HTTPS: `tailscale serve` / `tailscale funnel` only if you accept
   exposing the port within the tailnet; still keep device tokens on.

```bash
# On the host (illustrative)
tailscale serve --bg 7420
# Then set RELAY_PUBLIC_URL to the https://… MagicDNS URL Tailscale prints
```

Tokens still apply: Tailscale is transport trust, not app auth.

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

- Do not set `RELAY_REQUIRE_TOKEN=0` on a non-loopback bind (server exits).
- Do not put long-lived tokens in URLs; use stream tickets for EventSource.
- Revoke lost phones from Settings → Devices.
- Prefer Tailscale over port-forwarding the router to the public internet.
