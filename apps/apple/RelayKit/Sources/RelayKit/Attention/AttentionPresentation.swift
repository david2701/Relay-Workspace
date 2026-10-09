import Foundation

public enum AttentionRowFill: String, Sendable, Equatable {
    case paper
    case raised
    case needsYouTint
}

public struct AttentionRowChrome: Sendable, Equatable {
    public let fill: AttentionRowFill
    public let showsNeedsYouRule: Bool
    public let showsSelectedBorder: Bool
    public let showsSelectedShadow: Bool
    public let borderWidth: Double
    public let cornerRadius: Double

    public init(
        fill: AttentionRowFill,
        showsNeedsYouRule: Bool,
        showsSelectedBorder: Bool,
        showsSelectedShadow: Bool,
        borderWidth: Double,
        cornerRadius: Double
    ) {
        self.fill = fill
        self.showsNeedsYouRule = showsNeedsYouRule
        self.showsSelectedBorder = showsSelectedBorder
        self.showsSelectedShadow = showsSelectedShadow
        self.borderWidth = borderWidth
        self.cornerRadius = cornerRadius
    }
}

public struct ActorMarkModel: Sendable, Equatable {
    public enum Shape: String, Sendable, Equatable {
        case circle
        case roundedSquare
    }

    public let id: String
    public let monogram: String
    public let displayName: String
    public let shape: Shape

    public init(id: String, monogram: String, displayName: String, shape: Shape) {
        self.id = id
        self.monogram = monogram
        self.displayName = displayName
        self.shape = shape
    }
}

public struct AttentionHandoffModel: Sendable, Equatable {
    public let relativeTime: String
    public let fromMark: ActorMarkModel?
    public let toMark: ActorMarkModel
    public let summary: String
    public let detailLine: String

    public init(
        relativeTime: String,
        fromMark: ActorMarkModel?,
        toMark: ActorMarkModel,
        summary: String,
        detailLine: String
    ) {
        self.relativeTime = relativeTime
        self.fromMark = fromMark
        self.toMark = toMark
        self.summary = summary
        self.detailLine = detailLine
    }
}

/// Pure presentation helpers for Atención — no SwiftUI.
public enum AttentionPresentation {
    public static func nonEmptySections(from inbox: InboxQueryResult) -> [AttentionSection] {
        let sections = inbox.sections ?? []
        return sections.filter { !$0.items.isEmpty }
    }

    public static func isEmpty(_ inbox: InboxQueryResult) -> Bool {
        nonEmptySections(from: inbox).isEmpty && inbox.items.isEmpty
    }

    public static func flattenedItemIds(from inbox: InboxQueryResult) -> [String] {
        nonEmptySections(from: inbox).flatMap { section in
            section.items.map(\.id)
        }
    }

    public static func neighborId(
        of selectedId: String?,
        in itemIds: [String],
        delta: Int
    ) -> String? {
        guard !itemIds.isEmpty else { return nil }
        guard let selectedId, let index = itemIds.firstIndex(of: selectedId) else {
            return delta >= 0 ? itemIds.first : itemIds.last
        }
        let next = index + delta
        guard next >= 0, next < itemIds.count else { return selectedId }
        return itemIds[next]
    }

    public static func item(id: String, in inbox: InboxQueryResult) -> WorkItem? {
        if let match = inbox.items.first(where: { $0.id == id }) {
            return match
        }
        for section in inbox.sections ?? [] {
            if let match = section.items.first(where: { $0.id == id }) {
                return match
            }
        }
        return nil
    }

    public static func rowChrome(
        item: WorkItem,
        isSelected: Bool,
        tokens: RelayTokens = .light
    ) -> AttentionRowChrome {
        let isNeedsYou = item.status == .needsYou
        if isNeedsYou {
            return AttentionRowChrome(
                fill: .needsYouTint,
                showsNeedsYouRule: true,
                showsSelectedBorder: isSelected,
                showsSelectedShadow: false,
                borderWidth: isSelected ? tokens.needsYouRuleWidth : 0,
                cornerRadius: tokens.selectedRowRadius
            )
        }
        if isSelected {
            return AttentionRowChrome(
                fill: .raised,
                showsNeedsYouRule: false,
                showsSelectedBorder: true,
                showsSelectedShadow: true,
                borderWidth: tokens.selectedRowBorderWidth,
                cornerRadius: tokens.selectedRowRadius
            )
        }
        return AttentionRowChrome(
            fill: .paper,
            showsNeedsYouRule: false,
            showsSelectedBorder: false,
            showsSelectedShadow: false,
            borderWidth: 0,
            cornerRadius: tokens.selectedRowRadius
        )
    }

    public static func agent(
        id: String?,
        agentsById: [String: Agent]
    ) -> Agent? {
        guard let id else { return nil }
        return agentsById[id]
    }

    public static func mark(
        forActorType type: ActorType,
        actorId: String,
        agentsById: [String: Agent]
    ) -> ActorMarkModel {
        switch type {
        case .user:
            return ActorMarkModel(
                id: actorId,
                monogram: RelayDefaults.humanMonogram,
                displayName: AttentionStrings.you,
                shape: .circle
            )
        case .agent:
            if let agent = agentsById[actorId] {
                return ActorMarkModel(
                    id: agent.id,
                    monogram: agent.monogram,
                    displayName: agent.displayName,
                    shape: .roundedSquare
                )
            }
            return ActorMarkModel(
                id: actorId,
                monogram: String(actorId.prefix(2)).uppercased(),
                displayName: actorId,
                shape: .roundedSquare
            )
        case .system:
            return ActorMarkModel(
                id: actorId,
                monogram: "SY",
                displayName: AttentionStrings.system,
                shape: .roundedSquare
            )
        }
    }

    public static func ownerMark(
        item: WorkItem,
        agentsById: [String: Agent]
    ) -> ActorMarkModel? {
        switch item.assigneeType {
        case .unassigned:
            return nil
        case .user:
            return mark(
                forActorType: .user,
                actorId: item.assigneeId ?? RelayDefaults.humanActorId,
                agentsById: agentsById
            )
        case .agent:
            return mark(
                forActorType: .agent,
                actorId: item.assigneeId ?? "",
                agentsById: agentsById
            )
        }
    }

    /// Witness mark: for needs_you the human holds the ball; otherwise the assignee.
    public static func witnessMark(
        item: WorkItem,
        agentsById: [String: Agent]
    ) -> ActorMarkModel {
        if item.status == .needsYou {
            return mark(
                forActorType: .user,
                actorId: RelayDefaults.humanActorId,
                agentsById: agentsById
            )
        }
        return ownerMark(item: item, agentsById: agentsById)
            ?? mark(
                forActorType: .user,
                actorId: RelayDefaults.humanActorId,
                agentsById: agentsById
            )
    }

    public static func metaLine(
        item: WorkItem,
        agentsById: [String: Agent],
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> String {
        let relative = RelativeTimeFormat.formatRelative(
            iso: item.updatedAt,
            now: now,
            calendar: calendar
        )
        switch item.status {
        case .needsYou:
            let agentName = agentDisplayName(
                preferredId: item.lastActorType == .agent ? item.lastActorId : item.assigneeId,
                agentsById: agentsById
            )
            return AttentionStrings.needsYouAsk(agent: agentName, relative: relative)
        case .blocked:
            if let reason = item.blockedReason, !reason.isEmpty {
                return AttentionStrings.blockedMeta(reason)
            }
            return AttentionStrings.sectionBlocked
        default:
            if let intent = item.reminderIntent, !intent.isEmpty {
                return intent
            }
            return AttentionStrings.statusLabel(item.status)
        }
    }

    public static func bodyText(item: WorkItem) -> String? {
        if let reason = item.needsYouReason, !reason.isEmpty { return reason }
        if let reason = item.blockedReason, !reason.isEmpty { return reason }
        if let goal = item.goal, !goal.isEmpty { return goal }
        return nil
    }

    public static func handoff(
        item: WorkItem,
        agentsById: [String: Agent],
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> AttentionHandoffModel {
        let from = mark(
            forActorType: item.lastActorType,
            actorId: item.lastActorId,
            agentsById: agentsById
        )
        let to = witnessMark(item: item, agentsById: agentsById)
        let relative = RelativeTimeFormat.formatRelative(
            iso: item.updatedAt,
            now: now,
            calendar: calendar
        )
        let summary: String
        if item.status == .needsYou {
            summary = AttentionStrings.handoffPassed(agent: from.displayName)
        } else {
            summary = "\(from.displayName) · \(AttentionStrings.statusLabel(item.status))"
        }
        var detail = AttentionStrings.statusLabel(item.status)
        if item.status == .needsYou {
            detail = "Necesita tu decisión"
        }
        if let due = item.dueAt {
            let dueChip = RelativeTimeFormat.formatDue(iso: due, now: now, calendar: calendar)
            detail = "\(detail) · \(dueChip.text)"
        }
        return AttentionHandoffModel(
            relativeTime: relative,
            fromMark: from,
            toMark: to,
            summary: summary,
            detailLine: detail
        )
    }

    public static func agentDisplayName(
        preferredId: String?,
        agentsById: [String: Agent]
    ) -> String {
        if let preferredId, let agent = agentsById[preferredId] {
            return agent.displayName
        }
        return "Agente"
    }

    public static func returnAgentName(
        item: WorkItem,
        agentsById: [String: Agent]
    ) -> String {
        if item.assigneeType == .agent, let id = item.assigneeId, let agent = agentsById[id] {
            return agent.displayName
        }
        if item.lastActorType == .agent, let agent = agentsById[item.lastActorId] {
            return agent.displayName
        }
        return "Agente"
    }

    public static func accessibilityLabel(
        item: WorkItem,
        isSelected: Bool,
        agentsById: [String: Agent],
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> String {
        var parts: [String] = [item.title]
        parts.append(AttentionStrings.statusLabel(item.status))
        parts.append(metaLine(item: item, agentsById: agentsById, now: now, calendar: calendar))
        if item.status == .needsYou {
            parts.append(AttentionStrings.a11yNeedsYouRule)
        }
        if isSelected {
            parts.append(AttentionStrings.a11ySelected)
        }
        return parts.joined(separator: ", ")
    }

    public static func teamActiveCount(from inbox: InboxQueryResult) -> Int {
        inbox.totalCount ?? inbox.items.count
    }
}
