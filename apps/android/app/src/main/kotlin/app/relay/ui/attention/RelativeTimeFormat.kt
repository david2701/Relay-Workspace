package app.relay.ui.attention

import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit
import kotlin.math.floor

data class DueChip(
    val text: String,
    val tone: Tone,
) {
    enum class Tone {
        Muted,
        Warn,
        Crit,
    }
}

/**
 * Relative / due / reminder / sync formatting for Atención (web §1.15 Spanish shape).
 * Sync line uses seconds under one minute so Penpot `Al día · hace N s` can render.
 */
object RelativeTimeFormat {
    fun formatRelative(
        iso: String,
        nowMillis: Long = System.currentTimeMillis(),
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): String {
        val date = parseIso(iso) ?: return iso
        return formatRelative(date.toEpochMilli(), nowMillis, zoneId)
    }

    fun formatRelative(
        atMillis: Long,
        nowMillis: Long = System.currentTimeMillis(),
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): String {
        val diffMs = (nowMillis - atMillis).toDouble()
        val mins = floor(diffMs / 60_000.0).toInt()
        if (mins < 1) return "ahora"
        if (mins < 60) return "hace $mins min"
        val hours = mins / 60
        if (hours < 24) return "hace $hours h"
        val date = ZonedDateTime.ofInstant(Instant.ofEpochMilli(atMillis), zoneId)
        val now = ZonedDateTime.ofInstant(Instant.ofEpochMilli(nowMillis), zoneId)
        val timeText = formatClock(date)
        val dayDiff = ChronoUnit.DAYS.between(date.toLocalDate(), now.toLocalDate()).toInt()
        if (dayDiff == 1) return "ayer $timeText"
        if (dayDiff < 7) {
            val weekday = date.dayOfWeek.getDisplayName(
                java.time.format.TextStyle.SHORT,
                java.util.Locale("es", "ES"),
            ).lowercase(java.util.Locale("es", "ES"))
            return "$weekday $timeText"
        }
        return formatDayMonth(date, includeYear = date.year != now.year)
    }

    fun formatDue(
        iso: String,
        nowMillis: Long = System.currentTimeMillis(),
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): DueChip {
        val instant = parseIso(iso) ?: return DueChip(text = iso, tone = DueChip.Tone.Muted)
        val date = ZonedDateTime.ofInstant(instant, zoneId)
        val now = ZonedDateTime.ofInstant(Instant.ofEpochMilli(nowMillis), zoneId)
        val timeText = formatClock(date)
        if (instant.toEpochMilli() < nowMillis) {
            val relative = formatRelativeShort(instant.toEpochMilli(), nowMillis)
            return DueChip(text = "Venció $relative", tone = DueChip.Tone.Crit)
        }
        val dayDiff = ChronoUnit.DAYS.between(now.toLocalDate(), date.toLocalDate()).toInt()
        if (dayDiff == 0) {
            val hoursLeft = (instant.toEpochMilli() - nowMillis) / 3_600_000.0
            return DueChip(
                text = "Hoy $timeText",
                tone = if (hoursLeft < 4) DueChip.Tone.Warn else DueChip.Tone.Muted,
            )
        }
        if (dayDiff == 1) {
            return DueChip(text = "Mañana $timeText", tone = DueChip.Tone.Muted)
        }
        if (dayDiff < 7) {
            val weekday = date.dayOfWeek.getDisplayName(
                java.time.format.TextStyle.SHORT,
                java.util.Locale("es", "ES"),
            ).lowercase(java.util.Locale("es", "ES"))
            return DueChip(text = "$weekday $timeText", tone = DueChip.Tone.Muted)
        }
        return DueChip(
            text = "${formatDayMonth(date, includeYear = false)} $timeText",
            tone = DueChip.Tone.Muted,
        )
    }

    fun formatReminder(
        iso: String,
        nowMillis: Long = System.currentTimeMillis(),
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): DueChip {
        val instant = parseIso(iso) ?: return DueChip(text = iso, tone = DueChip.Tone.Muted)
        if (instant.toEpochMilli() < nowMillis) {
            val relative = formatRelativeShort(instant.toEpochMilli(), nowMillis)
            return DueChip(text = "Avisó $relative", tone = DueChip.Tone.Muted)
        }
        return formatDue(iso = iso, nowMillis = nowMillis, zoneId = zoneId)
    }

    /**
     * Online: `Al día · hace N s` under 60s, else `Al día · {relative}`.
     * Missing sync stamp falls back to bare `Al día`.
     */
    fun formatSyncSubtitle(
        lastSuccessAtMillis: Long?,
        nowMillis: Long = System.currentTimeMillis(),
        zoneId: ZoneId = ZoneId.systemDefault(),
        isOffline: Boolean = false,
    ): String {
        if (isOffline) {
            if (lastSuccessAtMillis == null) return "Sin conexión"
            val relative = formatRelative(lastSuccessAtMillis, nowMillis, zoneId)
            return "Sin conexión · datos de $relative"
        }
        if (lastSuccessAtMillis == null) return "Al día"
        val secs = ((nowMillis - lastSuccessAtMillis) / 1000L).toInt().coerceAtLeast(0)
        if (secs < 60) return "Al día · hace $secs s"
        val relative = formatRelative(lastSuccessAtMillis, nowMillis, zoneId)
        return "Al día · $relative"
    }

    fun formatRelativeShort(atMillis: Long, nowMillis: Long): String {
        val diffMs = (nowMillis - atMillis).toDouble()
        val mins = floor(diffMs / 60_000.0).toInt()
        if (mins < 1) return "hace un momento"
        if (mins < 60) return "hace $mins min"
        val hours = mins / 60
        if (hours < 24) return "hace $hours h"
        val days = hours / 24
        return "hace $days d"
    }

    /**
     * Trailing list relative (Penpot 840): `ahora`, `3 h`, `12 min` — no `hace` prefix.
     */
    fun formatTrailingRelative(
        iso: String,
        nowMillis: Long = System.currentTimeMillis(),
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): String {
        val instant = parseIso(iso) ?: return iso
        val diffMs = (nowMillis - instant.toEpochMilli()).toDouble()
        val mins = floor(diffMs / 60_000.0).toInt()
        if (mins < 1) return "ahora"
        if (mins < 60) return "$mins min"
        val hours = mins / 60
        if (hours < 24) return "$hours h"
        return formatRelative(instant.toEpochMilli(), nowMillis, zoneId).removePrefix("hace ")
    }

    private fun parseIso(iso: String): Instant? = runCatching { Instant.parse(iso) }.getOrNull()

    private fun formatClock(date: ZonedDateTime): String =
        String.format("%02d:%02d", date.hour, date.minute)

    private fun formatDayMonth(date: ZonedDateTime, includeYear: Boolean): String {
        val month = date.month.getDisplayName(
            java.time.format.TextStyle.SHORT,
            java.util.Locale("es", "ES"),
        ).lowercase(java.util.Locale("es", "ES"))
        return if (includeYear) {
            "${date.dayOfMonth} $month ${date.year}"
        } else {
            "${date.dayOfMonth} $month"
        }
    }
}
