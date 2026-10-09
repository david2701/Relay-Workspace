import Foundation

public enum AssigneeType: String, Codable, Sendable, Equatable {
    case user
    case agent
    case unassigned
}

public enum ActorType: String, Codable, Sendable, Equatable {
    case user
    case agent
    case system
}

public enum Source: String, Codable, Sendable, Equatable {
    case ui
    case mcp
    case system
}

public enum Priority: String, Codable, Sendable, Equatable {
    case none
    case low
    case medium
    case high
}

/// Relay work item — mirrors `WorkItemSchema` from `@relay/core`.
public struct WorkItem: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let title: String
    public let goal: String?
    public let status: Status
    public let assigneeType: AssigneeType
    public let assigneeId: String?
    public let dueAt: String?
    public let reminderAt: String?
    public let reminderIntent: String?
    public let priority: Priority
    public let blockedReason: String?
    public let needsYouReason: String?
    public let source: Source
    public let createdAt: String
    public let updatedAt: String
    public let startedAt: String?
    public let completedAt: String?
    public let completedByType: ActorType?
    public let completedById: String?
    public let lastActorType: ActorType
    public let lastActorId: String
    public let listId: String?

    public init(
        id: String,
        title: String,
        goal: String?,
        status: Status,
        assigneeType: AssigneeType,
        assigneeId: String?,
        dueAt: String?,
        reminderAt: String?,
        reminderIntent: String?,
        priority: Priority,
        blockedReason: String?,
        needsYouReason: String?,
        source: Source,
        createdAt: String,
        updatedAt: String,
        startedAt: String?,
        completedAt: String?,
        completedByType: ActorType?,
        completedById: String?,
        lastActorType: ActorType,
        lastActorId: String,
        listId: String?
    ) {
        self.id = id
        self.title = title
        self.goal = goal
        self.status = status
        self.assigneeType = assigneeType
        self.assigneeId = assigneeId
        self.dueAt = dueAt
        self.reminderAt = reminderAt
        self.reminderIntent = reminderIntent
        self.priority = priority
        self.blockedReason = blockedReason
        self.needsYouReason = needsYouReason
        self.source = source
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.startedAt = startedAt
        self.completedAt = completedAt
        self.completedByType = completedByType
        self.completedById = completedById
        self.lastActorType = lastActorType
        self.lastActorId = lastActorId
        self.listId = listId
    }

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case goal
        case status
        case assigneeType = "assignee_type"
        case assigneeId = "assignee_id"
        case dueAt = "due_at"
        case reminderAt = "reminder_at"
        case reminderIntent = "reminder_intent"
        case priority
        case blockedReason = "blocked_reason"
        case needsYouReason = "needs_you_reason"
        case source
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case startedAt = "started_at"
        case completedAt = "completed_at"
        case completedByType = "completed_by_type"
        case completedById = "completed_by_id"
        case lastActorType = "last_actor_type"
        case lastActorId = "last_actor_id"
        case listId = "list_id"
    }
}

public struct Agent: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let displayName: String
    public let monogram: String

    public init(id: String, displayName: String, monogram: String) {
        self.id = id
        self.displayName = displayName
        self.monogram = monogram
    }

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case monogram
    }
}
