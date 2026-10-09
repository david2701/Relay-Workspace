package app.relay.ui.attention

import app.relay.data.FakeAttentionRepository
import app.relay.data.FixtureLoader
import app.relay.data.RelayApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
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
        val vm = AttentionViewModel(FakeAttentionRepository(inbox))
        val state = vm.state.value
        assertTrue(state is AttentionUiState.Ready)
        assertTrue((state as AttentionUiState.Ready).inbox.counters.needsYou >= 1)
    }
}
