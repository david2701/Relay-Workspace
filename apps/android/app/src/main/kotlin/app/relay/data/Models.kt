package app.relay.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class Status {
    @SerialName("inbox")
    Inbox,

    @SerialName("assigned")
    Assigned,

    @SerialName("in_progress")
    InProgress,

    @SerialName("blocked")
    Blocked,

    @SerialName("needs_you")
    NeedsYou,

    @SerialName("done")
    Done,

    @SerialName("cancelled")
    Cancelled,
}

@Serializable
enum class AssigneeType {
    @SerialName("user")
    User,

    @SerialName("agent")
    Agent,

    @SerialName("unassigned")
    Unassigned,
}

@Serializable
enum class ActorType {
    @SerialName("user")
    User,

    @SerialName("agent")
    Agent,

    @SerialName("system")
    System,
}

@Serializable
enum class Source {
    @SerialName("ui")
    Ui,

    @SerialName("mcp")
    Mcp,

    @SerialName("system")
    System,
}

@Serializable
enum class Priority {
    @SerialName("none")
    None,

    @SerialName("low")
    Low,

    @SerialName("medium")
    Medium,

    @SerialName("high")
    High,
}

@Serializable
data class WorkItem(
    val id: String,
    val title: String,
    val goal: String? = null,
    val status: Status,
    @SerialName("assignee_type") val assigneeType: AssigneeType,
    @SerialName("assignee_id") val assigneeId: String? = null,
    @SerialName("due_at") val dueAt: String? = null,
    @SerialName("reminder_at") val reminderAt: String? = null,
    @SerialName("reminder_intent") val reminderIntent: String? = null,
    val priority: Priority = Priority.None,
    @SerialName("blocked_reason") val blockedReason: String? = null,
    @SerialName("needs_you_reason") val needsYouReason: String? = null,
    val source: Source,
    @SerialName("created_at") val createdAt: String,
    @SerialName("updated_at") val updatedAt: String,
    @SerialName("started_at") val startedAt: String? = null,
    @SerialName("completed_at") val completedAt: String? = null,
    @SerialName("completed_by_type") val completedByType: ActorType? = null,
    @SerialName("completed_by_id") val completedById: String? = null,
    @SerialName("last_actor_type") val lastActorType: ActorType,
    @SerialName("last_actor_id") val lastActorId: String,
    @SerialName("list_id") val listId: String? = null,
)

@Serializable
enum class AttentionSectionKey {
    @SerialName("needs_you")
    NeedsYou,

    @SerialName("blocked")
    Blocked,

    @SerialName("today")
    Today,
}

@Serializable
data class AttentionSection(
    val key: AttentionSectionKey,
    val items: List<WorkItem>,
)

@Serializable
data class InboxCounters(
    @SerialName("needs_you") val needsYou: Int,
)

@Serializable
data class InboxSectionCounts(
    @SerialName("needs_you") val needsYou: Int,
    val blocked: Int,
    val today: Int,
)

@Serializable
data class InboxQueryResult(
    val view: String,
    val items: List<WorkItem>,
    val sections: List<AttentionSection>? = null,
    val counters: InboxCounters,
    @SerialName("total_count") val totalCount: Int? = null,
    @SerialName("next_cursor") val nextCursor: String? = null,
    @SerialName("has_more") val hasMore: Boolean? = null,
    @SerialName("section_counts") val sectionCounts: InboxSectionCounts? = null,
    @SerialName("sync_cursor") val syncCursor: String? = null,
    @SerialName("server_time") val serverTime: String? = null,
)

@Serializable
data class Agent(
    val id: String,
    @SerialName("display_name") val displayName: String,
    val monogram: String,
)

@Serializable
data class AgentsEnvelope(
    val agents: List<Agent>,
)

@Serializable
data class ItemEnvelope(
    val item: WorkItem,
)

@Serializable
data class ItemsEnvelope(
    val items: List<WorkItem>,
)

@Serializable
data class HealthResponse(
    val ok: Boolean,
)
