package app.relay.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class StatusDecodingTest {
    private val client = RelayApiClient(baseUrl = "http://127.0.0.1:7420")

    @Test
    fun allSevenStatusesDecodeFromFixtures() {
        val expected = Status.entries.toSet()
        assertEquals(7, expected.size)
        expected.forEach { status ->
            val raw = FixtureLoader.read("item_${status.wireName()}.json")
            val item = client.decodeItemEnvelope(raw).item
            assertEquals(status, item.status)
        }
    }

    @Test
    fun itemsAllStatusesFixtureCoversSeven() {
        val raw = FixtureLoader.read("items_all_statuses.json")
        val items = client.decodeItemsEnvelope(raw).items
        assertEquals(7, items.map { it.status }.toSet().size)
        assertTrue(items.map { it.status }.toSet().containsAll(Status.entries))
    }

    @Test
    fun attentionInboxFixtureDecodes() {
        val raw = FixtureLoader.read("inbox_attention.json")
        val inbox = client.decodeInbox(raw)
        assertEquals("attention", inbox.view)
        assertTrue(inbox.counters.needsYou >= 1)
        val sections = requireNotNull(inbox.sections)
        assertEquals(
            listOf(
                AttentionSectionKey.NeedsYou,
                AttentionSectionKey.Blocked,
                AttentionSectionKey.Today,
            ),
            sections.map { it.key },
        )
        assertEquals(Status.NeedsYou, sections.first().items.first().status)
    }

    private fun Status.wireName(): String = when (this) {
        Status.Inbox -> "inbox"
        Status.Assigned -> "assigned"
        Status.InProgress -> "in_progress"
        Status.Blocked -> "blocked"
        Status.NeedsYou -> "needs_you"
        Status.Done -> "done"
        Status.Cancelled -> "cancelled"
    }
}
