# Apple clients (Relay)

SwiftUI Atención for **Mac** and **iPhone**, on top of `RelayKit`.

## Layout

| Path | Role |
| --- | --- |
| `RelayKit/` | SPM library: models, API client, §9.5 tokens, Atención presentation (Linux-tested) |
| `Shared/` | SwiftUI color bridge + shared Attention views / view model |
| `RelayMac/` | macOS app — `NavigationSplitView` list + detail |
| `RelayiOS/` | iOS app — `NavigationStack` list → detail |
| `RelayAppleTests/` | Xcode-hosted smoke tests (RelayKit) |
| `Relay.xcodeproj` | App targets + local RelayKit package |
| `BUILD.md` | Open / build / test / screenshot instructions |
| `docs/reference/` | Reference renders this PR was implemented against |

## Linux (this CI / agent VM)

```bash
cd apps/apple/RelayKit
swift build && swift test
```

SwiftUI app sources are **not** compiled here (no Xcode).

## Mac (David)

See `BUILD.md`. Short path:

```bash
cd apps/apple
open Relay.xcodeproj
# or
xcodebuild -project Relay.xcodeproj -scheme RelayMac -destination 'platform=macOS' build test
```

## Security

Configurable API base URL (default `http://localhost:7420`) is a preference.
No secrets in source. Future credentials → Keychain.
