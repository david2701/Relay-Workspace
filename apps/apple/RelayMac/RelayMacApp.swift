import SwiftUI
import RelayKit
#if canImport(AppKit)
import AppKit
#endif

#if DEBUG
/// CI/headless Mac screenshot hook — runs even when SwiftUI WindowGroup onAppear is skipped.
final class RelayMacScreenshotDelegate: NSObject, NSApplicationDelegate {
    private let screenshotViewModel = AttentionViewModel(platform: .mac)

    func applicationDidFinishLaunching(_ notification: Notification) {
        fputs("RelayMacScreenshotDelegate: applicationDidFinishLaunching\n", stderr)
        fflush(stderr)
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        DispatchQueue.main.async {
            RelayScreenshotWriter.scheduleMacCapturesIfNeeded(viewModel: self.screenshotViewModel)
        }
    }
}
#endif

@main
struct RelayMacApp: App {
    #if DEBUG
    @NSApplicationDelegateAdaptor(RelayMacScreenshotDelegate.self) private var screenshotDelegate
    #endif
    @StateObject private var viewModel = AttentionViewModel(platform: .mac)

    var body: some Scene {
        WindowGroup("Relay") {
            MacAttentionRootView(viewModel: viewModel)
                .frame(minWidth: 960, minHeight: 640)
                .background(RelayTheme.paper)
                .onAppear {
                    viewModel.bootstrap()
                    #if DEBUG
                    // Secondary path when a window does appear (local runs).
                    RelayScreenshotWriter.scheduleMacCapturesIfNeeded(viewModel: viewModel)
                    #endif
                }
                #if DEBUG
                .preferredColorScheme(RelayScreenshotAppearance.preferredColorScheme)
                #endif
        }
        .defaultSize(width: 1180, height: 760)
        Settings {
            MacAPISettingsView(viewModel: viewModel)
        }
    }
}

struct MacAPISettingsView: View {
    @ObservedObject var viewModel: AttentionViewModel
    @State private var draft: String = ""

    var body: some View {
        Form {
            TextField("API base URL", text: $draft)
                .onSubmit { viewModel.applyBaseURL(draft) }
            Text("No secrets. Default \(RelayDefaults.apiBaseURLString). Future credentials go to Keychain.")
                .font(.caption)
                .foregroundStyle(.secondary)
            Button("Guardar y recargar") {
                viewModel.applyBaseURL(draft)
            }
        }
        .padding(20)
        .frame(width: 420)
        .onAppear { draft = viewModel.baseURLString }
    }
}
