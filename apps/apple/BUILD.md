# Relay Apple clients — build notes

## Project form choice

**Hand-written `Relay.xcodeproj` (option a)** with Xcode 16+
`PBXFileSystemSynchronizedRootGroup` folders for `RelayMac/`, `RelayiOS/`,
`Shared/`, and `RelayAppleTests/`, plus a local SPM reference to `RelayKit/`.

Why not a workspace + Package.swift app products (option b)? SPM still does not
produce proper `.app` bundles (Info.plist, ATS, iOS/macOS app lifecycle) without
Xcode app targets. Synchronized groups keep the pbxproj small: new Swift files
under those folders are picked up automatically, which lowers drift risk on
Xcode 16 / Xcode 26.

This VM has **no Xcode**. SwiftUI targets were **not** compiled here. David must
build on his Mac and send the outputs listed in the PR.

## Requirements

| Item | Minimum | Tested-for (expected on David’s Mac) |
| --- | --- | --- |
| macOS | 14.0 Sonoma (deployment) | macOS 15 / 26 SDK host as available |
| Xcode | 16.0 | Xcode 16 or Xcode 26 |
| iOS deployment | 17.0 | iPhone simulator from that Xcode |
| Swift language mode | 5.x (`SWIFT_VERSION = 5.0` in project; RelayKit `swift-tools-version: 5.10`) | Swift 5.10 / 6.0 compiler in 5-mode |
| Dependencies | Apple SDK only + local `RelayKit` | No CocoaPods / no third-party SPM |

Conservative stack for first-compile: `ObservableObject` + `@Published` +
`@StateObject` + `@MainActor` view models. No `@Observable`, no Swift 6 strict
concurrency mode on app targets.

## Open

```bash
cd apps/apple
open Relay.xcodeproj
```

Select scheme **RelayMac** or **RelayiOS**.

### Fallback if the project file is rejected

1. Xcode → File → New → Project → App (SwiftUI, Swift).
2. Create two apps: macOS (bundle `app.relay.mac`) and iOS (bundle `app.relay.ios`),
   deployment macOS 14 / iOS 17.
3. File → Add Package Dependencies → Add Local → select `apps/apple/RelayKit`.
4. Drag `apps/apple/Shared` into both app targets (copy = off, add to both targets).
5. Drag `RelayMac/*.swift` into the Mac app; `RelayiOS/*.swift` into the iOS app.
6. Set Info.plist ATS: `NSAllowsLocalNetworking = YES` (files already under each app folder).

## Linux-verified (no Xcode)

```bash
cd apps/apple/RelayKit
swift build
swift test
```

Expect exit 0. Presentation / relative-time / token / decoding tests live here.

## Start `apps/server` with demo data

From repo root (real scripts — there is no `pnpm demo`):

```bash
# Preferred AC3 demo seed used by native Atención fixtures
pnpm demo:ac3

# Or manual path
pnpm install
pnpm build
pnpm seed
pnpm --filter @relay/server start
```

Server default: `http://localhost:7420` (same as `RelayDefaults.apiBaseURLString`).
iOS Simulator can use `http://localhost:7420` (loopback to the Mac host).

## xcodebuild — Mac

```bash
cd apps/apple
xcodebuild -project Relay.xcodeproj -scheme RelayMac -destination 'platform=macOS' build test
```

## xcodebuild — iPhone simulator

List destinations for your Xcode:

```bash
xcodebuild -project Relay.xcodeproj -scheme RelayiOS -showdestinations
```

Pick a simulator that exists (names vary by Xcode 16/26). Example that often
exists; replace if missing:

```bash
cd apps/apple
xcodebuild -project Relay.xcodeproj -scheme RelayiOS \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  build test
```

If `iPhone 16` is missing, use any iPhone simulator id from `-showdestinations`, e.g.:

```bash
-destination 'platform=iOS Simulator,id=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX'
```

## Screenshots

### Mac (light / dark)

1. Run RelayMac against the local server with Atención data (`pnpm demo:ac3`).
2. Light: System Settings → Appearance → Light, or launch with light appearance.
3. Dark: System Settings → Appearance → Dark, or:

```bash
# Force dark for the app process when launching from Terminal (best-effort)
defaults write app.relay.mac NSRequiresAquaSystemAppearance -bool false
# Or toggle system appearance, then capture the window.
```

Capture the Atención window at default size with a **needs_you** row and a
**selected** row visible (light and dark).

### iPhone simulator (light / dark)

```bash
xcrun simctl boot "iPhone 16"   # or your chosen device
# light
xcrun simctl ui booted appearance light
xcrun simctl io booted screenshot ~/Desktop/relay-iphone-attention-light.png
# dark
xcrun simctl ui booted appearance dark
xcrun simctl io booted screenshot ~/Desktop/relay-iphone-attention-dark.png
```

Also capture one detail screen.

### Host versions to paste back

```bash
xcodebuild -version
sw_vers
```

## Security

API base URL is a UserDefaults preference (Mac Settings / iPhone profile button).
No auth secrets in this PR. When credentials appear, store them in Keychain
(see apple-on-device-ai-and-vault-security skill); never in source or UserDefaults.

## Tablet

Out of scope for this PR (iPhone + Mac only).
