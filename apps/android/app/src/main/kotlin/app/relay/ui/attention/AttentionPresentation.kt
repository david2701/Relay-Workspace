package app.relay.ui.attention

import app.relay.data.ActorType
import app.relay.data.Agent
import app.relay.data.AssigneeType
import app.relay.data.Status
import app.relay.data.WorkItem

data class ActorMarkModel(
    val id: String,
    val monogram: String,
    val displayName: String,
    val shape: Shape,
) {
    enum class Shape {
        Circle,
        RoundedSquare,
    }
}

data class AttentionHandoffModel(
    val relativeTime: String,
    val fromMark: ActorMarkModel?,
    val toMark: ActorMarkModel,
    val summary: String,
    val detailLine: String,
)

/**
 * Pure presentation helpers for Atención — mirrors Apple RelayKit AttentionPresentation.
 */
object AttentionPresentation {
    const val HUMAN_MONOGRAM: String = "É"
    const val HUMAN_ACTOR_ID: String = "user"

    fun mark(
        type: ActorType,
        actorId: String,
        agentsById: Map<String, Agent>,
    ): ActorMarkModel {
        return when (type) {
            ActorType.User -> ActorMarkModel(
                id = actorId,
                monogram = HUMAN_MONOGRAM,
                displayName = "Tú",
                shape = ActorMarkModel.Shape.Circle,
            )
            ActorType.Agent -> {
                val agent = agentsById[actorId]
                if (agent != null) {
                    ActorMarkModel(
                        id = agent.id,
                        monogram = agent.monogram,
                        displayName = agent.displayName,
                        shape = ActorMarkModel.Shape.RoundedSquare,
                    )
                } else {
                    // TODO: drop once agents always load with inbox; prefix is a monogram stand-in.
                    ActorMarkModel(
                        id = actorId,
                        monogram = actorId.take(2).uppercase(),
                        displayName = actorId,
                        shape = ActorMarkModel.Shape.RoundedSquare,
                    )
                }
            }
            ActorType.System -> ActorMarkModel(
                id = actorId,
                monogram = "SY",
                displayName = "Sistema",
                shape = ActorMarkModel.Shape.RoundedSquare,
            )
        }
    }

    fun ownerMark(item: WorkItem, agentsById: Map<String, Agent>): ActorMarkModel? {
        return when (item.assigneeType) {
            AssigneeType.Unassigned -> null
            AssigneeType.User -> mark(
                type = ActorType.User,
                actorId = item.assigneeId ?: HUMAN_ACTOR_ID,
                agentsById = agentsById,
            )
            AssigneeType.Agent -> mark(
                type = ActorType.Agent,
                actorId = item.assigneeId.orEmpty(),
                agentsById = agentsById,
            )
        }
    }

    fun witnessMark(item: WorkItem, agentsById: Map<String, Agent>): ActorMarkModel {
        if (item.status == Status.NeedsYou) {
            return mark(
                type = ActorType.User,
                actorId = HUMAN_ACTOR_ID,
                agentsById = agentsById,
            )
        }
        return ownerMark(item, agentsById) ?: mark(
            type = ActorType.User,
            actorId = HUMAN_ACTOR_ID,
            agentsById = agentsById,
        )
    }

    fun agentDisplayName(
        preferredId: String?,
        agentsById: Map<String, Agent>,
    ): String {
        if (preferredId != null) {
            agentsById[preferredId]?.let { return it.displayName }
        }
        return "Agente"
    }

    fun returnAgentName(item: WorkItem, agentsById: Map<String, Agent>): String {
        if (item.assigneeType == AssigneeType.Agent) {
            item.assigneeId?.let { id ->
                agentsById[id]?.let { return it.displayName }
            }
        }
        if (item.lastActorType == ActorType.Agent) {
            agentsById[item.lastActorId]?.let { return it.displayName }
        }
        return "Agente"
    }

    fun metaLine(
        item: WorkItem,
        agentsById: Map<String, Agent>,
        nowMillis: Long = System.currentTimeMillis(),
    ): String {
        val relative = RelativeTimeFormat.formatRelative(iso = item.updatedAt, nowMillis = nowMillis)
        return when (item.status) {
            Status.NeedsYou -> {
                val preferredId = if (item.lastActorType == ActorType.Agent) {
                    item.lastActorId
                } else {
                    item.assigneeId
                }
                val agentName = agentDisplayName(preferredId, agentsById)
                "$agentName necesita tu decisión · $relative"
            }
            Status.Blocked -> {
                val reason = item.blockedReason
                if (!reason.isNullOrBlank()) "Atascado: $reason" else "Atascado"
            }
            else -> item.reminderIntent ?: item.status.name.lowercase()
        }
    }

    fun bodyText(item: WorkItem): String? {
        item.needsYouReason?.takeIf { it.isNotBlank() }?.let { return it }
        item.blockedReason?.takeIf { it.isNotBlank() }?.let { return it }
        item.goal?.takeIf { it.isNotBlank() }?.let { return it }
        return null
    }

    fun handoff(
        item: WorkItem,
        agentsById: Map<String, Agent>,
        nowMillis: Long = System.currentTimeMillis(),
    ): AttentionHandoffModel {
        val from = mark(
            type = item.lastActorType,
            actorId = item.lastActorId,
            agentsById = agentsById,
        )
        val to = witnessMark(item, agentsById)
        val relative = RelativeTimeFormat.formatRelative(iso = item.updatedAt, nowMillis = nowMillis)
        val summary = if (item.status == Status.NeedsYou) {
            "${from.displayName} te lo pasó"
        } else {
            "${from.displayName} · ${item.status.name.lowercase()}"
        }
        var detail = if (item.status == Status.NeedsYou) {
            "Necesita tu decisión"
        } else {
            item.status.name.lowercase()
        }
        item.dueAt?.let { due ->
            val dueChip = RelativeTimeFormat.formatDue(iso = due, nowMillis = nowMillis)
            detail = "$detail · ${dueChip.text}"
        }
        return AttentionHandoffModel(
            relativeTime = relative,
            fromMark = from,
            toMark = to,
            summary = summary,
            detailLine = detail,
        )
    }
}
