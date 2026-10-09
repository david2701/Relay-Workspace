import SwiftUI
import RelayKit

struct AttentionLoadingView: View {
    var body: some View {
        ProgressView()
            .controlSize(.regular)
            .tint(RelayTheme.accentInk)
            .accessibilityLabel(AttentionStrings.loading)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct AttentionErrorView: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text(AttentionStrings.errorTitle)
                .font(.title3.weight(.semibold))
                .foregroundStyle(RelayTheme.ink)
            Text(message)
                .font(.callout)
                .foregroundStyle(RelayTheme.inkMuted)
                .multilineTextAlignment(.center)
            Button(AttentionStrings.retry, action: onRetry)
                .buttonStyle(.borderedProminent)
                .tint(RelayTheme.hl)
                .foregroundStyle(RelayTheme.onHl)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct AttentionEmptyView: View {
    let bodyText: String
    var showTeamButton: Bool = true
    let onNewItem: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            HStack(spacing: -6) {
                ForEach(["CO", "RD", "DA"], id: \.self) { mono in
                    Text(mono)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(RelayTheme.ink)
                        .frame(width: 36, height: 36)
                        .background(
                            Circle().stroke(RelayTheme.ink, lineWidth: 1).background(Circle().fill(RelayTheme.raised))
                        )
                }
                Text(RelayDefaults.humanMonogram)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(RelayTheme.paper)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(RelayTheme.ink))
            }
            .accessibilityHidden(true)
            Text(AttentionStrings.emptyTitle)
                .font(.title2.weight(.semibold))
                .foregroundStyle(RelayTheme.ink)
                .multilineTextAlignment(.center)
            Text(bodyText)
                .font(.callout)
                .foregroundStyle(RelayTheme.inkMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 360)
            HStack(spacing: 10) {
                if showTeamButton {
                    Button(AttentionStrings.emptySeeTeam) {}
                        .buttonStyle(.bordered)
                }
                Button("\(AttentionStrings.emptyNewItem)  N", action: onNewItem)
                    .buttonStyle(.bordered)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
    }
}

struct OfflineBannerView: View {
    let onRetry: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "icloud.slash")
                .foregroundStyle(RelayTheme.inkMuted)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(AttentionStrings.offlineBannerTitle)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(RelayTheme.ink)
                Text(AttentionStrings.offlineBannerBody)
                    .font(.caption)
                    .foregroundStyle(RelayTheme.inkMuted)
            }
            Spacer(minLength: 8)
            Button(AttentionStrings.offlineRetry, action: onRetry)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(RelayTheme.accentInk)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(RelayTheme.sunken)
        )
        .accessibilityElement(children: .combine)
    }
}

struct PendingSyncBannerView: View {
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "clock.arrow.circlepath")
                .foregroundStyle(RelayTheme.onHl)
                .accessibilityHidden(true)
            Text(AttentionStrings.pendingSyncBody)
                .font(.caption)
                .foregroundStyle(RelayTheme.onHl)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(RelayTheme.hl)
        )
    }
}

struct QuickCaptureField: View {
    @Binding var text: String
    var placeholder: String
    var showsShortcutBadge: Bool
    var onSubmit: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "plus")
                .foregroundStyle(RelayTheme.inkMuted)
                .accessibilityHidden(true)
            TextField(placeholder, text: $text)
                .textFieldStyle(.plain)
                .foregroundStyle(RelayTheme.ink)
                .onSubmit(onSubmit)
                .accessibilityLabel(AttentionStrings.emptyNewItem)
            if showsShortcutBadge {
                Text("N")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(RelayTheme.inkMuted)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .stroke(RelayTheme.lineStrong, lineWidth: 1)
                    )
                    .accessibilityHidden(true)
            } else {
                Button(action: onSubmit) {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(RelayTheme.onHl)
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(RelayTheme.hl))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(AttentionStrings.emptyNewItem)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(RelayTheme.lineStrong, lineWidth: 1)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(RelayTheme.raised)
                )
        )
    }
}
