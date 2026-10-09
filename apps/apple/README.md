# Apple clients (Relay)

## This PR: `RelayKit` only

`RelayKit/` is a Swift Package Manager library with:

- Codable/Sendable models (7 work-item statuses + Atención inbox)
- `URLSession` async API client for `apps/server` (`/api/*`)
- Design tokens from ui-spec-v0.3 §9.5 as neutral RGBA/hex (no SwiftUI)

It builds and tests on **Linux** with Swift 5.10:

```bash
cd apps/apple/RelayKit
swift build
swift test
```

`Package.swift` uses `swift-tools-version: 5.10` and platforms `.macOS(.v14)` / `.iOS(.v17)` so the same package compiles on David’s Mac without Swift 6 language mode. Linux-only networking imports are gated with `#if canImport(FoundationNetworking)`.

## Next PR (needs a Mac + Xcode)

- `RelayMac` — Atención split view (see `penpot/mac/mac-home-light.png`)
- `RelayiOS` — Atención phone UI (see `apps-nativas/.../iphone-home-light.png`)

Those targets will depend on `RelayKit`. **No `.xcodeproj` or SwiftUI views ship in this foundation PR** — this VM has no Xcode, and we refuse to land uncompiled UI Swift.

## Security note

No auth tokens yet. The configurable API base URL is a preference, not a vault secret. When credentials appear, store them in Keychain (see apple-on-device-ai-and-vault-security skill); do not put secrets in source or UserDefaults.
