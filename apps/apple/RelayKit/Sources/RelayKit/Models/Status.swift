import Foundation

/// Work-item collaboration status (packages/core StatusSchema).
public enum Status: String, Codable, Sendable, CaseIterable, Equatable {
    case inbox
    case assigned
    case inProgress = "in_progress"
    case blocked
    case needsYou = "needs_you"
    case done
    case cancelled
}
