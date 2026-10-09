package app.relay.data

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class RelayApiClientTest {
    private lateinit var server: MockWebServer
    private lateinit var client: RelayApiClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        client = RelayApiClient(baseUrl = server.url("/").toString().trimEnd('/'))
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun fetchAttentionAgainstFaithfulMock() = runBlocking {
        val body = FixtureLoader.read("inbox_attention.json")
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(body)
                .addHeader("Content-Type", "application/json"),
        )
        val inbox = client.fetchAttention()
        assertEquals("attention", inbox.view)
        assertTrue(inbox.counters.needsYou >= 1)
        val request = server.takeRequest()
        assertEquals("/api/inbox?view=attention", request.path)
    }

    @Test
    fun healthAgainstMock() = runBlocking {
        server.enqueue(
            MockResponse()
                .setBody("""{"ok":true}""")
                .addHeader("Content-Type", "application/json"),
        )
        assertTrue(client.health().ok)
        assertEquals("/api/health", server.takeRequest().path)
    }
}
