# Push notification API

Server-sent push for native clients when the app is backgrounded. While a
device has an open SSE stream it stays on that stream (**D4**); push fills the
gap when the stream is closed. The server talks **directly** to APNs and FCM
(owner decision **D3**) — no third-party relay.

Native registration of the provider token is a later PR; this document covers
the HTTP surface the clients will call.

## Registration

Authenticated as the **calling device** (`Authorization: Bearer <device token>`).

### `POST /api/devices/me/push`

```json
{
  "platform": "apns",
  "token": "<provider token>",
  "environment": "sandbox",
  "topic": "com.example.relay",
  "muted": false
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `platform` | yes | `apns` \| `fcm` |
| `token` | yes | Provider device/registration token (8…4096 chars) |
| `environment` | yes | `sandbox` \| `production` (APNs host selection; stored for FCM too) |
| `topic` | no | APNs topic / bundle id; defaults to `RELAY_APNS_TOPIC` when sending |
| `muted` | no | When `true`, the device keeps the token but receives no pushes |

Response:

```json
{
  "device": { "id": "dev_…", "has_push_token": true, "push_muted": false, … },
  "push": {
    "platform": "apns",
    "environment": "sandbox",
    "topic": "com.example.relay",
    "muted": false,
    "registered": true
  }
}
```

The plaintext provider token is **never** returned in API responses (only
`has_push_token`). Auth device tokens remain SHA-256 hashes only.

### `DELETE /api/devices/me/push`

Clears the push token (and platform/environment/topic) on this device.

### Revoke

`DELETE /api/devices/:id` clears the push token together with stream tickets
and closes open SSE streams.

## Triggers

A process-local dispatcher subscribes to the **same event hub** as
[`GET /api/stream`](./stream.md) (SQLite `item_events` seq watcher). Cross-process
writes (MCP stdio, CLI) therefore also fan out to push.

| Reason | Derived from |
| --- | --- |
| `needs_you` | `status_changed` with `to=needs_you`, or `created` with `status=needs_you` |
| `assigned` | `assigned` / `created` when assignee is the user |
| `reminder` | `reminder_fired` (emitted by the server reminder watcher when `reminder_at` is due) |

### Delivery rules

- **D4 / SSE:** by default (`RELAY_PUSH_SKIP_OPEN_SSE=1`) a device with an open
  SSE stream is **not** pushed. Set `RELAY_PUSH_SKIP_OPEN_SSE=0` to always push.
- **Mute:** `push_muted` on the device row skips delivery.
- **Dedupe:** at most one push per `(device, item, reason)` inside
  `RELAY_PUSH_DEDUPE_MS` (default 60s).
- **Payload:** `item_id`, truncated `title` (≤80), and `reason`. No note bodies
  or secrets. `RELAY_PUSH_REDACT=1` omits the title.

## Provider behaviour

| Provider | Transport | Invalid token |
| --- | --- | --- |
| APNs | HTTP/2, token auth (`.p8`, ES256 JWT, cached ~50 min), `apns-push-type: alert`, category `RELAY_ITEM`, `thread-id` = item id | `410` / `BadDeviceToken` → clear token |
| FCM | HTTP v1, service-account OAuth2 (RS256 JWT bearer, access token cached), data + notification + `channel_id=relay_items` | `UNREGISTERED` → clear token |

If neither APNs nor FCM credentials are configured, push is disabled cleanly
with one startup log line. See [deploy/push.md](../deploy/push.md).
