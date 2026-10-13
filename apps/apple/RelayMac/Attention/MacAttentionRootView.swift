import SwiftUI
import RelayKit

struct MacAttentionRootView: View {
    @ObservedObject var viewModel: AttentionViewModel
    @FocusState private var listFocused: Bool

    var body: some View {
        NavigationSplitView {
            listColumn
                .navigationSplitViewColumnWidth(min: 360, ideal: 420, max: 560)
        } detail: {
            detailColumn
        }
        .navigationSplitViewStyle(.balanced)
        .background(RelayTheme.paper)
        .focused($listFocused)
        .onAppear { listFocused = true }
        .onKeyPress("j") {
            viewModel.moveSelection(delta: 1)
            return .handled
        }
        .onKeyPress(.downArrow) {
            viewModel.moveSelection(delta: 1)
            return .handled
        }
        .onKeyPress("k") {
            viewModel.moveSelection(delta: -1)
            return .handled
        }
        .onKeyPress(.upArrow) {
            viewModel.moveSelection(delta: -1)
            return .handled
        }
        .onKeyPress("x") {
            Task { await viewModel.completeSelected() }
            return .handled
        }
    }

    private var listColumn: some View {
        VStack(spacing: 0) {
            MacAttentionHeader(viewModel: viewModel)
            Group {
                switch viewModel.loadState {
                case .loading:
                    AttentionLoadingView()
                case .error(let message):
                    AttentionErrorView(message: message) {
                        Task { await viewModel.refresh() }
                    }
                case .empty:
                    AttentionEmptyView(bodyText: viewModel.emptyBody) {
                        // Focus capture field — no-op placeholder for now.
                    }
                case .ready, .offline:
                    AttentionListContent(
                        viewModel: viewModel,
                        expandNeedsYouInline: true,
                        showsKeyboardHints: true
                    )
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            QuickCaptureField(
                text: $viewModel.quickCaptureText,
                placeholder: AttentionStrings.capturePlaceholder,
                showsShortcutBadge: true,
                onSubmit: {
                    Task { await viewModel.createQuickItem() }
                }
            )
            .padding(12)
        }
        .background(RelayTheme.paper)
    }

    @ViewBuilder
    private var detailColumn: some View {
        if let item = viewModel.selectedItem {
            AttentionDetailView(
                item: item,
                agentsById: viewModel.agentsById,
                decisionDraft: $viewModel.decisionDraft,
                onReturn: { Task { await viewModel.returnToAgent() } },
                onTakeMyself: { Task { await viewModel.takeMyself() } },
                showsPhoneActions: false
            )
        } else {
            AttentionDetailPlaceholder()
        }
    }
}

struct MacAttentionHeader: View {
    @ObservedObject var viewModel: AttentionViewModel

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
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
                macIconButton(systemName: "line.3.horizontal.decrease", label: AttentionStrings.filter)
                macIconButton(systemName: "magnifyingglass", label: AttentionStrings.search)
                macIconButton(systemName: "plus", label: AttentionStrings.emptyNewItem)
            }
            .padding(6)
            .background(Capsule().fill(RelayTheme.sunken))
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }

    private func macIconButton(systemName: String, label: String) -> some View {
        Button {} label: {
            Image(systemName: systemName)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(RelayTheme.ink)
                .frame(width: 28, height: 28)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
