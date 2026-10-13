import SwiftUI
import RelayKit

@main
struct RelayiOSApp: App {
    @StateObject private var viewModel = AttentionViewModel(platform: .phone)

    var body: some Scene {
        WindowGroup {
            PhoneRootView(viewModel: viewModel)
                .background(RelayTheme.paper)
                .onAppear { viewModel.bootstrap() }
                #if DEBUG
                .preferredColorScheme(RelayScreenshotAppearance.preferredColorScheme)
                #endif
        }
    }
}

struct PhoneRootView: View {
    @ObservedObject var viewModel: AttentionViewModel
    @State private var selectedTab: PhoneTab = .attention

    var body: some View {
        ZStack(alignment: .bottom) {
            Group {
                switch selectedTab {
                case .attention:
                    PhoneAttentionNavigation(viewModel: viewModel)
                case .team:
                    PhonePlaceholderView(title: AttentionStrings.navTeam)
                case .notes:
                    PhonePlaceholderView(title: AttentionStrings.navNotes)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            VStack(spacing: 10) {
                if selectedTab == .attention {
                    QuickCaptureField(
                        text: $viewModel.quickCaptureText,
                        placeholder: AttentionStrings.capturePlaceholderPhone,
                        showsShortcutBadge: false,
                        onSubmit: {
                            Task { await viewModel.createQuickItem() }
                        }
                    )
                    .padding(.horizontal, 16)
                }
                PhoneTabBar(
                    selectedTab: $selectedTab,
                    needsYouCount: viewModel.needsYouCount
                )
            }
            .padding(.bottom, 8)
        }
        .background(RelayTheme.paper)
    }
}

enum PhoneTab: Hashable {
    case attention
    case team
    case notes
}

struct PhoneTabBar: View {
    @Binding var selectedTab: PhoneTab
    let needsYouCount: Int

    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 4) {
                tabButton(.attention, title: AttentionStrings.title, systemImage: "tray.full")
                tabButton(.team, title: AttentionStrings.navTeam, systemImage: "person.2")
                tabButton(.notes, title: AttentionStrings.navNotes, systemImage: "doc.text")
            }
            .padding(6)
            .background(Capsule().fill(RelayTheme.sunken.opacity(0.95)))
            Button {} label: {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(RelayTheme.ink)
                    .frame(width: 48, height: 48)
                    .background(Circle().fill(RelayTheme.raised))
                    .overlay(Circle().stroke(RelayTheme.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(AttentionStrings.search)
        }
        .padding(.horizontal, 16)
    }

    private func tabButton(_ tab: PhoneTab, title: String, systemImage: String) -> some View {
        Button {
            selectedTab = tab
        } label: {
            VStack(spacing: 2) {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: systemImage)
                        .font(.system(size: 16, weight: .semibold))
                    if tab == .attention && needsYouCount > 0 {
                        Text("\(needsYouCount)")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(RelayTheme.onHl)
                            .padding(3)
                            .background(Circle().fill(RelayTheme.hl))
                            .offset(x: 8, y: -6)
                    }
                }
                Text(title)
                    .font(.caption2.weight(.semibold))
            }
            .foregroundStyle(selectedTab == tab ? RelayTheme.accentInk : RelayTheme.inkMuted)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                Capsule().fill(selectedTab == tab ? RelayTheme.accentTint.opacity(0.65) : Color.clear)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }
}

struct PhonePlaceholderView: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.title2.weight(.semibold))
            .foregroundStyle(RelayTheme.inkMuted)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(RelayTheme.paper)
    }
}
