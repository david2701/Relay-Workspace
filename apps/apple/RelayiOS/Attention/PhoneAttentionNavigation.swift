import SwiftUI
import RelayKit

struct PhoneAttentionNavigation: View {
    @ObservedObject var viewModel: AttentionViewModel
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            PhoneAttentionListView(viewModel: viewModel, path: $path)
                .navigationDestination(for: String.self) { itemId in
                    if let inbox = viewModel.inbox,
                       let item = AttentionPresentation.item(id: itemId, in: inbox) {
                        PhoneAttentionDetailScreen(
                            viewModel: viewModel,
                            item: item
                        )
                    } else {
                        AttentionDetailPlaceholder()
                    }
                }
        }
        .safeAreaInset(edge: .bottom) {
            Color.clear.frame(height: 120)
        }
    }
}

struct PhoneAttentionListView: View {
    @ObservedObject var viewModel: AttentionViewModel
    @Binding var path: NavigationPath
    @State private var showSettings = false

    var body: some View {
        VStack(spacing: 0) {
            PhoneAttentionHeader(
                viewModel: viewModel,
                onSettings: { showSettings = true }
            )
            Group {
                switch viewModel.loadState {
                case .loading:
                    AttentionLoadingView()
                case .error(let message):
                    AttentionErrorView(message: message) {
                        Task { await viewModel.refresh() }
                    }
                case .empty:
                    AttentionEmptyView(
                        bodyText: viewModel.emptyBody,
                        showTeamButton: true,
                        onNewItem: {}
                    )
                case .ready, .offline:
                    AttentionListContent(
                        viewModel: viewModel,
                        expandNeedsYouInline: true,
                        showsKeyboardHints: false,
                        onOpenDetail: { item in
                            path.append(item.id)
                        }
                    )
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(RelayTheme.paper)
        .toolbar(.hidden, for: .navigationBar)
        .refreshable {
            await viewModel.refresh()
        }
        .sheet(isPresented: $showSettings) {
            PhoneAPISettingsView(viewModel: viewModel)
        }
    }
}

struct PhoneAttentionHeader: View {
    @ObservedObject var viewModel: AttentionViewModel
    let onSettings: () -> Void

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(AttentionStrings.title)
                    .font(.largeTitle.weight(.bold))
                    .foregroundStyle(RelayTheme.ink)
                    .accessibilityIdentifier("attention-title")
                HStack(spacing: 4) {
                    Image(systemName: viewModel.isOffline ? "icloud.slash" : "checkmark.circle")
                        .font(.caption)
                        .foregroundStyle(RelayTheme.inkMuted)
                    Text(viewModel.syncSubtitle)
                        .font(.caption)
                        .foregroundStyle(RelayTheme.inkMuted)
                }
            }
            Spacer()
            HStack(spacing: 8) {
                Button {} label: {
                    Image(systemName: "line.3.horizontal.decrease")
                        .foregroundStyle(RelayTheme.ink)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(RelayTheme.sunken))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(AttentionStrings.filter)
                Button(action: onSettings) {
                    Text(RelayDefaults.humanMonogram)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(RelayTheme.paper)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(RelayTheme.ink))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Perfil y URL del servidor")
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }
}

struct PhoneAttentionDetailScreen: View {
    @ObservedObject var viewModel: AttentionViewModel
    let item: WorkItem

    var body: some View {
        AttentionDetailView(
            item: item,
            agentsById: viewModel.agentsById,
            decisionDraft: $viewModel.decisionDraft,
            onReturn: { Task { await viewModel.returnToAgent() } },
            onTakeMyself: { Task { await viewModel.takeMyself() } },
            showsPhoneActions: true
        )
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 12) {
                    Button {} label: {
                        Image(systemName: "link")
                    }
                    .accessibilityLabel(AttentionStrings.ctaLinkNote)
                    Button {} label: {
                        Image(systemName: "ellipsis")
                    }
                    .accessibilityLabel("Más")
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            HStack(spacing: 12) {
                floatingAction(AttentionStrings.ctaDelegate, systemImage: "person.2")
                floatingAction(AttentionStrings.ctaNote, systemImage: "square.and.pencil")
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 10)
        }
        .onAppear {
            viewModel.selectItem(id: item.id)
        }
    }

    private func floatingAction(_ title: String, systemImage: String) -> some View {
        Button {} label: {
            Label(title, systemImage: systemImage)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(RelayTheme.ink)
                .padding(.horizontal, 18)
                .padding(.vertical, 12)
                .background(Capsule().fill(RelayTheme.raised))
                .shadow(color: Color.black.opacity(0.12), radius: 8, x: 0, y: 3)
        }
        .buttonStyle(.plain)
    }
}

struct PhoneAPISettingsView: View {
    @ObservedObject var viewModel: AttentionViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var draft: String = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Servidor") {
                    urlField
                    Text("Por defecto \(RelayDefaults.apiBaseURLString). En el simulador, localhost apunta al Mac anfitrión. Sin secretos; credenciales futuras van al Keychain.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Ajustes")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        viewModel.applyBaseURL(draft)
                        dismiss()
                    }
                }
            }
            .onAppear { draft = viewModel.baseURLString }
        }
    }

    @ViewBuilder
    private var urlField: some View {
        let field = TextField("API base URL", text: $draft)
            .autocorrectionDisabled()
        #if os(iOS)
        field
            .textInputAutocapitalization(.never)
            .keyboardType(.URL)
        #else
        field
        #endif
    }
}
