# Deploying push notifications (APNs + FCM)

Relay sends pushes **directly** to Apple Push Notification service and Firebase
Cloud Messaging. No third-party push relay. Keys stay on the host that runs
`@relay/server`; never commit them.

If credentials are missing, the server starts normally and logs a single line:

```
Push: disabled (no APNs/FCM credentials)
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `RELAY_APNS_KEY_PATH` | for iOS | Path to AuthKey_XXXXX.p8 |
| `RELAY_APNS_KEY_ID` | for iOS | 10-char Key ID from Apple Developer |
| `RELAY_APNS_TEAM_ID` | for iOS | 10-char Team ID |
| `RELAY_APNS_TOPIC` | for iOS | App bundle id / APNs topic |
| `RELAY_FCM_CREDENTIALS_PATH` | for Android | Path to Firebase service-account JSON |
| `RELAY_PUSH_REDACT` | no | **Default ON** (omit titles; D3). Set `0` to include a truncated title in payloads |
| `RELAY_PUSH_SKIP_OPEN_SSE` | no | Default `1` (D4: no push while SSE open). `0` = always push |
| `RELAY_PUSH_DEDUPE_MS` | no | Dedupe window for `(device, item, reason)` (default `60000`) |
| `RELAY_PUSH_REMINDER_POLL_MS` | no | How often to emit `reminder_fired` (default `15000`) |

Partial APNs config (some vars set, others missing) refuses to start with a
clear error. FCM is enabled only when the credentials path is set and readable.

### Keeping credentials out of git

The repo `.gitignore` excludes APNs keys and common FCM service-account filenames
so they are never committed by accident:

- `*.p8` / `AuthKey_*.p8`
- `*firebase-adminsdk*.json`
- `fcm-credentials*.json`

Prefer storing keys outside the tree (e.g. `/etc/relay/AuthKey_XXXXX.p8` with
mode `600`) and pointing `RELAY_APNS_KEY_PATH` /
`RELAY_FCM_CREDENTIALS_PATH` at those paths.

## Creating an APNs key

1. Apple Developer → **Certificates, Identifiers & Profiles** → **Keys**.
2. Create a key with **Apple Push Notifications service (APNs)** enabled.
3. Download the `.p8` once. Note the **Key ID**.
4. Note your **Team ID** (Membership details).
5. The APNs **topic** is the iOS app’s bundle identifier.
6. Place the `.p8` on the Relay host (e.g. `/etc/relay/AuthKey_XXXXX.p8`,
   mode `600`) and point `RELAY_APNS_KEY_PATH` at it.

Relay uses token-based auth (ES256 JWT, cached ~50 minutes) over HTTP/2.
Sandbox vs production is chosen per device registration
(`environment: sandbox | production`).

## Creating an FCM service account

1. Firebase Console → project settings → **Service accounts**.
2. **Generate new private key** → download the JSON.
3. Ensure the Firebase Cloud Messaging API is enabled for the GCP project.
4. Store the JSON on the host (mode `600`) and set
   `RELAY_FCM_CREDENTIALS_PATH`.

Relay exchanges a short-lived OAuth2 access token (RS256 JWT assertion,
cached until near expiry) and sends HTTP v1 messages with
`android.notification.channel_id = relay_items`.

## Security notes

- Never log provider tokens, `.p8` contents, or service-account JSON.
- By default push payloads are `item_id` + `reason` only (`RELAY_PUSH_REDACT`
  defaults on). Titles reach Apple/Google only if you set `RELAY_PUSH_REDACT=0`.
- Revoking a device deletes its push token.
- Prefer filesystem permissions over embedding secrets in process managers’
  world-readable env files; path-based env vars keep material out of `ps` dumps.

See also [api/push.md](../api/push.md) and [api/auth.md](../api/auth.md).
