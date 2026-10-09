import Foundation

public enum InboxView: String, Codable, Sendable, Equatable {
    case attention
    case agentWip = "agent_wip"
    case upcoming
    case done
    case all
}

public enum AttentionSectionKey: String, Codable, Sendable, Equatable {
    case needsYou = "needs_you"
    case blocked
    case today
}

public struct AttentionSection: Codable, Sendable, Equatable, Identifiable {
    public var id: AttentionSectionKey { key }
    public let key: AttentionSectionKey
    public let items: [WorkItem]

    public init(key: AttentionSectionKey, items: [WorkItem]) {
        self.key = key
        self.items = items
    }
}

public struct InboxCounters: Codable, Sendable, Equatable {
    public let needsYou: Int

    public init(needsYou: Int) {
        self.needsYou = needsYou
    }

    enum CodingKeys: String, CodingKey {
        case needsYou = "needs_you"
    }
}

public struct InboxSectionCounts: Codable, Sendable, Equatable {
    public let needsYou: Int
    public let blocked: Int
    public let today: Int

    public init(needsYou: Int, blocked: Int, today: Int) {
        self.needsYou = needsYou
        self.blocked = blocked
        self.today = today
    }

    enum CodingKeys: String, CodingKey {
        case needsYou = "needs_you"
        case blocked
        case today
    }
}

/// Response of `GET /api/inbox?view=attention` (and other views).
public struct InboxQueryResult: Codable, Sendable, Equatable {
    public let view: InboxView
    public let items: [WorkItem]
    public let sections: [AttentionSection]?
    public let counters: InboxCounters
    public let totalCount: Int?
    public let nextCursor: String?
    public let hasMore: Bool?
    public let sectionCounts: InboxSectionCounts?
    public let syncCursor: String?
    public let serverTime: String?

    public init(
        view: InboxView,
        items: [WorkItem],
        sections: [AttentionSection]?,
        counters: InboxCounters,
        totalCount: Int?,
        nextCursor: String?,
        hasMore: Bool?,
        sectionCounts: InboxSectionCounts?,
        syncCursor: String?,
        serverTime: String?
    ) {
        self.view = view
        self.items = items
        self.sections = sections
        self.counters = counters
        self.totalCount = totalCount
        self.nextCursor = nextCursor
        self.hasMore = hasMore
        self.sectionCounts = sectionCounts
        self.syncCursor = syncCursor
        self.serverTime = serverTime
    }

    enum CodingKeys: String, CodingKey {
        case view
        case items
        case sections
        case counters
        case totalCount = "total_count"
        case nextCursor = "next_cursor"
        case hasMore = "has_more"
        case sectionCounts = "section_counts"
        case syncCursor = "sync_cursor"
        case serverTime = "server_time"
    }
}

public struct ItemEnvelope: Codable, Sendable, Equatable {
    public let item: WorkItem
}

public struct ItemsEnvelope: Codable, Sendable, Equatable {
    public let items: [WorkItem]
}

public struct AgentsEnvelope: Codable, Sendable, Equatable {
    public let agents: [Agent]
}

public struct HealthResponse: Codable, Sendable, Equatable {
    public let ok: Bool
}
