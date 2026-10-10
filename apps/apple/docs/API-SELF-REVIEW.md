# SwiftUI API self-review (macOS 14 / iOS 17)

No Xcode on the authoring VM — this is a static availability pass.

## Version-sensitive APIs used

| API | Introduced | Used in | Notes |
| --- | --- | --- | --- |
| `NavigationSplitView` | macOS 13 / iOS 16 | `MacAttentionRootView` | Mac only |
| `navigationSplitViewColumnWidth` | macOS 13 | `MacAttentionRootView` | Mac only |
| `NavigationStack` + `NavigationPath` | iOS 16 | `PhoneAttentionNavigation` | iPhone |
| `navigationDestination(for:)` | iOS 16 | `PhoneAttentionNavigation` | |
| `onKeyPress` / `KeyEquivalent` | macOS 14 / iOS 17 | `MacAttentionRootView` | Matches deployment floor |
| `WindowGroup.defaultSize` | macOS 13 | `RelayMacApp` | |
| `TextField(..., axis:)` | iOS 16 / macOS 13 | rows / detail | Multiline decision field |
| `refreshable` | iOS 15 | `PhoneAttentionListView` | |
| `toolbar(.hidden, for: .navigationBar)` | iOS 16 | phone list | |
| `safeAreaInset(edge:)` | iOS 15 | phone chrome | |
| `FocusState` / `focused` | iOS 15 / macOS 12 | Mac list focus for keys | |
| `NSColor(name:dynamicProvider:)` | macOS 10.15 | `Color+Relay` | Asset-free light/dark |
| `UIColor { traitCollection in }` | iOS 13 | `Color+Relay` | Asset-free light/dark |
| `ObservableObject` / `@Published` / `@StateObject` | existing | view model | Avoided `@Observable` |
| `@MainActor` on class | Swift 5.5+ | `AttentionViewModel` | |
| `ProgressView` / `Label` / `Tab`-less custom bar | existing | shared / phone | Custom tab bar (no iOS 18 `Tab` API) |

## Explicitly avoided

- `@Observable` / Observation macros
- Swift 6 language mode / strict concurrency settings on app targets
- `glassEffect` / Liquid Glass (iOS 26+)
- Third-party packages
- iPad / tablet layouts
