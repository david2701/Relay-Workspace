import SwiftUI
import RelayKit

struct AttentionDetailView: View {
    let item: WorkItem
    let agentsById: [String: Agent]
    @Binding var decisionDraft: String
    let onReturn: () -> Void
    let onTakeMyself: () -> Void
    var showsPhoneActions: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                statusBadge
                Text(item.title)
                    .font(.title.weight(.bold))
                    .foregroundStyle(RelayTheme.ink)
                    .accessibilityAddTraits(.isHeader)
                if item.status == .needsYou {
                    needsYouCard
                }
                handoffSection
                goalSection
                reminderSection
                contextSection
            }
            .padding(24)
            .frame(maxWidth: 720, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(RelayTheme.paper)
        .accessibilityIdentifier("attention-detail")
        .accessibilityLabel(AttentionStrings.title)
    }

    private var statusBadge: some View {
        HStack(spacing: 6) {
            StatusGlyphView(status: item.status, size: 12)
            Text(AttentionStrings.statusLabel(item.status))
                .font(.caption.weight(.semibold))
                .foregroundStyle(RelayTheme.onHl)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Capsule().fill(item.status == .needsYou ? RelayTheme.hl : RelayTheme.sunken))
        .foregroundStyle(item.status == .needsYou ? RelayTheme.onHl : RelayTheme.ink)
    }

    private var needsYouCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 0) {
                RoundedRectangle(cornerRadius: 1, style: .continuous)
                    .fill(RelayTheme.attentionRule)
                    .frame(width: RelayTheme.needsYouRuleWidth)
                VStack(alignment: .leading, spacing: 8) {
                    Text(AttentionPresentation.metaLine(item: item, agentsById: agentsById))
                        .font(.caption)
                        .foregroundStyle(RelayTheme.inkMuted)
                    if let body = AttentionPresentation.bodyText(item: item) {
                        Text(body)
                            .font(.body)
                            .foregroundStyle(RelayTheme.ink)
                    }
                    dueReminderRow
                    if showsPhoneActions {
                        phoneActionBlock
                    }
                }
                .padding(14)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(RelayTheme.raised)
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(RelayTheme.line, lineWidth: 1)
                )
        )
    }

    private var phoneActionBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField(AttentionStrings.decisionPlaceholderShort, text: $decisionDraft, axis: .vertical)
                .lineLimit(2...4)
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(RelayTheme.sunken)
                )
            Button(action: onReturn) {
                Text(
                    "← \(AttentionStrings.returnToAgent(AttentionPresentation.returnAgentName(item: item, agentsById: agentsById)))"
                )
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(RelayTheme.onHl)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Capsule().fill(RelayTheme.hl))
            }
            .buttonStyle(.plain)
            HStack {
                Button(AttentionStrings.ctaDoMyself, action: onTakeMyself)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(RelayTheme.ink)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(RelayTheme.sunken))
                    .buttonStyle(.plain)
                Spacer()
            }
        }
    }

    private var handoffSection: some View {
        let model = AttentionPresentation.handoff(item: item, agentsById: agentsById)
        return VStack(alignment: .leading, spacing: 8) {
            sectionHeader(AttentionStrings.handoffCaps)
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(model.relativeTime)
                        .font(.caption)
                        .foregroundStyle(RelayTheme.inkMuted)
                    Spacer()
                    ActorFlowView(from: model.fromMark, to: model.toMark)
                }
                Text(model.summary)
                    .font(.body.weight(.medium))
                    .foregroundStyle(RelayTheme.ink)
                Text(model.detailLine)
                    .font(.callout)
                    .foregroundStyle(RelayTheme.inkMuted)
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(RelayTheme.line, lineWidth: 1)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(RelayTheme.raised)
                    )
            )
            HStack(spacing: 8) {
                Button(AttentionStrings.ctaAssign) {}
                    .buttonStyle(.bordered)
                Button(AttentionStrings.ctaDoMyself, action: onTakeMyself)
                    .buttonStyle(.bordered)
            }
        }
    }

    private var goalSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(AttentionStrings.goalCaps)
            Text(item.goal?.isEmpty == false ? (item.goal ?? "") : AttentionStrings.goalMissing)
                .font(.body)
                .foregroundStyle(item.goal?.isEmpty == false ? RelayTheme.ink : RelayTheme.inkMuted)
        }
    }

    private var reminderSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(AttentionStrings.reminderCaps)
            gridRow(
                AttentionStrings.whenDue,
                item.dueAt.map { RelativeTimeFormat.formatDateTimeField(iso: $0) } ?? "—"
            )
            gridRow(
                AttentionStrings.remindMe,
                item.reminderAt.map { RelativeTimeFormat.formatDateTimeField(iso: $0) } ?? "—"
            )
        }
    }

    private var contextSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                sectionHeader(AttentionStrings.contextCaps)
                Spacer()
                Button(AttentionStrings.ctaLinkNote) {}
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(RelayTheme.accentInk)
                    .buttonStyle(.plain)
            }
            VStack(alignment: .leading, spacing: 8) {
                Text(AttentionStrings.decisionCaps)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(RelayTheme.inkMuted)
                if let reason = item.needsYouReason, !reason.isEmpty {
                    Text("Nombre del producto: Relay provisional")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(RelayTheme.ink)
                    Text(reason)
                        .font(.callout)
                        .foregroundStyle(RelayTheme.ink2)
                } else {
                    Text(AttentionStrings.contextEmpty)
                        .font(.callout)
                        .foregroundStyle(RelayTheme.inkMuted)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(RelayTheme.line, lineWidth: 1)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(RelayTheme.raised)
                    )
            )
        }
    }

    private var dueReminderRow: some View {
        HStack(spacing: 12) {
            if let dueAt = item.dueAt {
                Text(RelativeTimeFormat.formatDue(iso: dueAt).text)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(RelayTheme.accentInk)
            }
            if let reminderAt = item.reminderAt {
                HStack(spacing: 3) {
                    Image(systemName: "bell")
                    Text(RelativeTimeFormat.formatReminder(iso: reminderAt).text)
                }
                .font(.caption)
                .foregroundStyle(RelayTheme.inkMuted)
            }
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.caption.weight(.semibold))
            .foregroundStyle(RelayTheme.inkMuted)
            .tracking(0.6)
    }

    private func gridRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(.callout)
                .foregroundStyle(RelayTheme.inkMuted)
            Spacer()
            Text(value)
                .font(.callout.weight(.medium))
                .foregroundStyle(RelayTheme.ink)
                .multilineTextAlignment(.trailing)
        }
    }
}

struct AttentionDetailPlaceholder: View {
    var body: some View {
        Text(AttentionStrings.detailPlaceholder)
            .font(.callout)
            .foregroundStyle(RelayTheme.inkMuted)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(RelayTheme.paper)
    }
}
