package app.relay.ui.attention

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId

class RelativeTimeFormatTest {
    private val zone: ZoneId = ZoneId.of("Europe/Madrid")
    private val nowMillis: Long = java.time.Instant.parse("2026-10-08T12:00:00Z").toEpochMilli()

    @Test
    fun syncSubtitleUsesSecondsUnderOneMinute() {
        val actual = RelativeTimeFormat.formatSyncSubtitle(
            lastSuccessAtMillis = nowMillis - 1_000L,
            nowMillis = nowMillis,
            zoneId = zone,
        )
        assertEquals("Al día · hace 1 s", actual)
    }

    @Test
    fun dueFormatsTomorrowInMadrid() {
        val actual = RelativeTimeFormat.formatDue(
            iso = "2026-10-09T11:12:00.000Z",
            nowMillis = nowMillis,
            zoneId = zone,
        )
        assertEquals("Mañana 13:12", actual.text)
    }

    @Test
    fun reminderFormatsTodayInMadrid() {
        val actual = RelativeTimeFormat.formatReminder(
            iso = "2026-10-08T21:12:00.000Z",
            nowMillis = nowMillis,
            zoneId = zone,
        )
        assertEquals("Hoy 23:12", actual.text)
    }

    @Test
    fun relativeHours() {
        val actual = RelativeTimeFormat.formatRelative(
            iso = "2026-10-08T09:00:00.000Z",
            nowMillis = nowMillis,
            zoneId = zone,
        )
        assertTrue(actual.startsWith("hace 3 h"))
    }
}
