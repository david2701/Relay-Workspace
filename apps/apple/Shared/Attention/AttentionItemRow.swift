import SwiftUI
import RelayKit

struct AttentionItemRow: View {
    let item: WorkItem
    let isSelected: Bool
    let agentsById: [String: Agent]
    let showsExpandedActions: Bool
    let hasPendingSync: Bool
    @Binding var decisionDraft: String
    let onSelect: () -> Void
    let onReturn: () -> Void
    let onTakeMyself: () -> Void
    var showsKeyboardHints: Bool = false

    private var chrome: AttentionRowChrome {
        AttentionPresentation.rowChrome(item: item, isSelected: isSelected)
    }

    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 0) {
                rowHeader
                if showsExpandedActions && item.status == .needsYou && isSelected {
                    expandedNeedsYouBody
                }
            }
            .padding(.leading, chrome.showsNeedsYouRule ? 0 : 12)
            .padding(.trailing, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(rowBackground)
            .overlay(rowBorder)
            .clipShape(RoundedRectangle(cornerRadius: chrome.cornerRadius, style: .continuous))
            .shadow(
                color: chrome.showsSelectedShadow ? Color.black.opacity(0.08) : .clear,
                radius: chrome.showsSelectedShadow ? 6 : 0,
                x: 0,
                y: chrome.showsSelectedShadow ? 2 : 0
            )
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("attention-item-\(item.id)")
        .accessibilityLabel(
            AttentionPresentation.accessibilityLabel(
                item: item,
                isSelected: isSelected,
                agentsById: agentsById
            )
        )
    }

    private var rowHeader: some View {
        HStack(alignment: .top, spacing: 10) {
            if chrome.showsNeedsYouRule {
                RoundedRectangle(cornerRadius: 1, style: .continuous)
                    .fill(RelayTheme.attentionRule)
                    .frame(width: RelayTheme.needsYouRuleWidth)
                    .padding(.vertical, -10)
                    .accessibilityHidden(true)
            }
            StatusGlyphView(status: item.status)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .top, spacing: 8) {
                    Text(item.title)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(RelayTheme.ink)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    ActorFlowView(
                        from: item.status == .needsYou
                            ? AttentionPresentation.mark(
                                forActorType: item.lastActorType,
                                actorId: item.lastActorId,
                                agentsById: agentsById
                            )
                            : nil,
                        to: AttentionPresentation.witnessMark(item: item, agentsById: agentsById)
                    )
                }
                Text(AttentionPresentation.metaLine(item: item, agentsById: agentsById))
                    .font(.caption)
                    .foregroundStyle(item.status == .blocked ? RelayTheme.warn : RelayTheme.inkMuted)
                    .lineLimit(2)
                if let body = AttentionPresentation.bodyText(item: item), item.status == .needsYou {
                    Text(body)
                        .font(.callout)
                        .foregroundStyle(RelayTheme.ink)
                        .lineLimit(4)
                        .padding(.top, 2)
                }
                dueReminderLine
            }
        }
    }

    @ViewBuilder
    private var dueReminderLine: some View {
        if item.dueAt != nil || item.reminderAt != nil {
            HStack(spacing: 10) {
                if let dueAt = item.dueAt {
                    let chip = RelativeTimeFormat.formatDue(iso: dueAt)
                    Text(chip.text)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(dueColor(chip.tone))
                }
                if let reminderAt = item.reminderAt {
                    let chip = RelativeTimeFormat.formatReminder(iso: reminderAt)
                    HStack(spacing: 3) {
                        Image(systemName: "bell")
                            .font(.caption2)
                        Text(chip.text)
                            .font(.caption)
                    }
                    .foregroundStyle(RelayTheme.inkMuted)
                }
            }
            .padding(.top, 2)
        }
    }

    private var expandedNeedsYouBody: some View {
        VStack(alignment: .leading, spacing: 10) {
            if hasPendingSync {
                PendingSyncBannerView()
            }
            TextField(AttentionStrings.decisionPlaceholderShort, text: $decisionDraft, axis: .vertical)
                .lineLimit(2...4)
                .textFieldStyle(.plain)
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(RelayTheme.raised)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(RelayTheme.line, lineWidth: 1)
                        )
                )
            HStack(spacing: 8) {
                Button(action: onReturn) {
                    Label(
                        AttentionStrings.returnToAgent(
                            AttentionPresentation.returnAgentName(item: item, agentsById: agentsById)
                        ),
                        systemImage: "arrow.uturn.left"
                    )
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(RelayTheme.onHl)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(RelayTheme.hl))
                }
                .buttonStyle(.plain)
                Button(AttentionStrings.ctaDoMyself, action: onTakeMyself)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(RelayTheme.ink)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(RelayTheme.sunken))
                    .buttonStyle(.plain)
            }
            if showsKeyboardHints {
                KeyboardHintsView()
            }
        }
        .padding(.top, 10)
        .padding(.leading, chrome.showsNeedsYouRule ? 12 : 0)
    }

    private var rowBackground: Color {
        switch chrome.fill {
        case .needsYouTint: return RelayTheme.accentTint
        case .raised: return RelayTheme.raised
        case .paper: return RelayTheme.paper.opacity(0.001)
        }
    }

    @ViewBuilder
    private var rowBorder: some View {
        if chrome.showsSelectedBorder || (chrome.showsNeedsYouRule && isSelected) {
            RoundedRectangle(cornerRadius: chrome.cornerRadius, style: .continuous)
                .stroke(
                    chrome.showsNeedsYouRule ? RelayTheme.attentionRule : RelayTheme.control,
                    lineWidth: chrome.borderWidth > 0 ? chrome.borderWidth : RelayTheme.selectedRowBorderWidth
                )
        }
    }

    private func dueColor(_ tone: DueChip.Tone) -> Color {
        switch tone {
        case .muted: return RelayTheme.inkMuted
        case .warn: return RelayTheme.warn
        case .crit: return RelayTheme.crit
        }
    }
}

struct KeyboardHintsView: View {
    var body: some View {
        HStack(spacing: 8) {
            hint("J", "K", AttentionStrings.keyboardMove)
            hint("↵", nil, AttentionStrings.keyboardOpen)
            hint("X", nil, AttentionStrings.keyboardComplete)
            hint("D", nil, AttentionStrings.keyboardAssign)
        }
        .font(.caption2)
        .foregroundStyle(RelayTheme.inkMuted)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Atajos: J K mover, Enter abrir, X completar, D asignar")
    }

    @ViewBuilder
    private func hint(_ a: String, _ b: String?, _ label: String) -> some View {
        HStack(spacing: 3) {
            key(a)
            if let b { key(b) }
            Text(label)
        }
    }

    private func key(_ value: String) -> some View {
        Text(value)
            .font(.caption2.monospaced())
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(RelayTheme.sunken)
            )
    }
}
