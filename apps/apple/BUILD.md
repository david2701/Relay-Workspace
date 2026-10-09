# Relay Apple clients — build notes

## Pasos para David

1. Open: `cd apps/apple && open Relay.xcodeproj`
2. Build + test Mac (scheme **RelayMac**) — see [xcodebuild — Mac](#xcodebuild--mac)
3. Build + test iPhone simulator (scheme **RelayiOS**) — see [xcodebuild — iPhone simulator](#xcodebuild--iphone-simulator)
4. Start the local server with seed data — see [Start apps/server](#start-appsserver-with-demo-data)
5. Screenshots (Mac light/dark, iPhone light/dark + one detail) — see [Screenshots](#screenshots)
6. Capture host versions: `xcodebuild -version` and `sw_vers`
7. Send back: both `xcodebuild` full logs, the screenshots, and the two version commands

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

From repo root. Order matters.

**Terminal 1** — install, build, seed Atención rows, start the API:

```bash
pnpm install && pnpm build && pnpm seed && pnpm --filter @relay/server start
```

`pnpm seed` reset-and-seeds `data/relay.db` with `needs_you`, `blocked`, and “para hoy” items — enough for native Atención screens.

Check the server is up:

```bash
curl -s 'http://localhost:7420/api/inbox?view=attention' | head
```

You should see JSON with `"view":"attention"` and a `sections` array.

**Terminal 2 (optional)** — only if you want extra AC3 loop items on that live store.
Bare `pnpm demo:ac3` uses an isolated temp DB and does **not** feed the apps; point it at the running server:

```bash
RELAY_API=http://127.0.0.1:7420 pnpm demo:ac3 -- --variant=needs_you
# or: --variant=blocked
```

Once PR #5 lands on main, `pnpm demo` will do the install/build/seed/start flow in one command.

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

1. With the server running (seed data), launch RelayMac and open Atención at the default window size with a **needs_you** row and a **selected** row visible.
2. Light: System Settings → Appearance → Light, or:

```bash
osascript -e 'tell application "System Events" to tell appearance preferences to set dark mode to false'
```

3. Capture the window (interactive — click the Relay window):

```bash
screencapture -w ~/Desktop/relay-mac-attention-light.png
```

4. Dark: System Settings → Appearance → Dark, or:

```bash
osascript -e 'tell application "System Events" to tell appearance preferences to set dark mode to true'
```

5. Capture again:

```bash
screencapture -w ~/Desktop/relay-mac-attention-dark.png
```

6. Optional: switch appearance back to light with the `dark mode to false` osascript above.

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
