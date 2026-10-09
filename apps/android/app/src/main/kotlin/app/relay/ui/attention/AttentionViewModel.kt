package app.relay.ui.attention

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import app.relay.data.Agent
import app.relay.data.AttentionRepository
import app.relay.data.AttentionSection
import app.relay.data.InboxQueryResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface AttentionUiState {
    data object Loading : AttentionUiState

    data class Ready(
        val inbox: InboxQueryResult,
        val selectedItemId: String? = null,
        val agentsById: Map<String, Agent> = emptyMap(),
        val lastSyncedAtMillis: Long? = null,
        val presentationNowMillis: Long = System.currentTimeMillis(),
    ) : AttentionUiState {
        val sections: List<AttentionSection>
            get() = inbox.sections.orEmpty()
        val isEmpty: Boolean
            get() = sections.all { it.items.isEmpty() } && inbox.items.isEmpty()
        val syncSubtitle: String
            get() = RelativeTimeFormat.formatSyncSubtitle(
                lastSuccessAtMillis = lastSyncedAtMillis,
                nowMillis = presentationNowMillis,
            )
    }

    data class Error(
        val message: String,
    ) : AttentionUiState
}

class AttentionViewModel(
    private val repository: AttentionRepository,
) : ViewModel() {
    private val mutableState = MutableStateFlow<AttentionUiState>(AttentionUiState.Loading)
    val state: StateFlow<AttentionUiState> = mutableState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        mutableState.value = AttentionUiState.Loading
        viewModelScope.launch {
            try {
                val inbox = repository.loadAttention()
                // Agents endpoint exists on RelayApiClient; empty map is OK if it fails.
                val agents = runCatching { repository.loadAgents() }.getOrDefault(emptyList())
                val syncedAt = System.currentTimeMillis()
                mutableState.value = AttentionUiState.Ready(
                    inbox = inbox,
                    agentsById = agents.associateBy { it.id },
                    lastSyncedAtMillis = syncedAt,
                    presentationNowMillis = syncedAt,
                )
            } catch (err: Exception) {
                mutableState.value = AttentionUiState.Error(
                    message = err.message ?: "Unknown error",
                )
            }
        }
    }

    fun selectItem(itemId: String?) {
        mutableState.update { current ->
            when (current) {
                is AttentionUiState.Ready -> current.copy(selectedItemId = itemId)
                else -> current
            }
        }
    }

    companion object {
        fun factory(repository: AttentionRepository): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return AttentionViewModel(repository) as T
                }
            }
    }
}
