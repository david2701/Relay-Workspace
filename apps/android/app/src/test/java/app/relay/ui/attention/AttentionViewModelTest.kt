package app.relay.ui.attention

import app.relay.data.AgentsEnvelope
import app.relay.data.FakeAttentionRepository
import app.relay.data.FixtureLoader
import app.relay.data.RelayApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AttentionViewModelTest {
    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun loadsSeedInboxIntoReadyState() {
        val inbox = RelayApiClient("http://127.0.0.1:7420")
            .decodeInbox(FixtureLoader.read("inbox_attention.json"))
        val agents = Json { ignoreUnknownKeys = true }
            .decodeFromString(AgentsEnvelope.serializer(), FixtureLoader.read("agents.json"))
            .agents
        val vm = AttentionViewModel(FakeAttentionRepository(inbox, agents))
        val state = vm.state.value
        assertTrue(state is AttentionUiState.Ready)
        val ready = state as AttentionUiState.Ready
        assertTrue(ready.inbox.counters.needsYou >= 1)
        assertNotNull(ready.lastSyncedAtMillis)
        assertEquals("RD", ready.agentsById.getValue("agent-writing").monogram)
        assertTrue(ready.syncSubtitle.startsWith("Al día"))
    }
}
