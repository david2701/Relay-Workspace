import SwiftUI
import RelayKit

@main
struct RelayMacApp: App {
    @StateObject private var viewModel = AttentionViewModel(platform: .mac)

    var body: some Scene {
        WindowGroup("Relay") {
            MacAttentionRootView(viewModel: viewModel)
                .frame(minWidth: 960, minHeight: 640)
                .background(RelayTheme.paper)
                .onAppear { viewModel.bootstrap() }
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
