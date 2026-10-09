import Foundation

public struct DueChip: Sendable, Equatable {
    public enum Tone: String, Sendable, Equatable {
        case muted
        case warn
        case crit
    }

    public let text: String
    public let tone: Tone

    public init(text: String, tone: Tone) {
        self.text = text
        self.tone = tone
    }
}

/// Relative / due / reminder formatting for Atención rows (web §1.15 Spanish shape).
/// Uses an injectable `Calendar` so Linux tests stay deterministic.
public enum RelativeTimeFormat {
    public static func formatRelative(
        iso: String,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> String {
        guard let date = ISO8601Parsing.date(from: iso) else { return iso }
        return formatRelative(date: date, now: now, calendar: calendar)
    }

    public static func formatRelative(
        date: Date,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> String {
        let diffMs = now.timeIntervalSince(date) * 1000
        let mins = Int(floor(diffMs / 60_000))
        if mins < 1 { return "ahora" }
        if mins < 60 { return "hace \(mins) min" }
        let hours = mins / 60
        if hours < 24 { return "hace \(hours) h" }
        let timeText = formatClock(date, calendar: calendar)
        let dayDiff = startOfDayDiff(from: date, to: now, calendar: calendar)
        if dayDiff == 1 { return "ayer \(timeText)" }
        if dayDiff < 7 {
            return "\(shortWeekday(date, calendar: calendar)) \(timeText)"
        }
        return formatDayMonth(date, calendar: calendar, includeYear: !sameYear(date, now, calendar: calendar))
    }

    public static func formatDue(
        iso: String,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> DueChip {
        guard let date = ISO8601Parsing.date(from: iso) else {
            return DueChip(text: iso, tone: .muted)
        }
        let timeText = formatClock(date, calendar: calendar)
        if date < now {
            let relative = formatRelativeShort(date: date, now: now)
            return DueChip(text: "Venció \(relative)", tone: .crit)
        }
        let dayDiff = startOfDayDiff(from: now, to: date, calendar: calendar)
        if dayDiff == 0 {
            let hoursLeft = date.timeIntervalSince(now) / 3_600
            return DueChip(
                text: "Hoy \(timeText)",
                tone: hoursLeft < 4 ? .warn : .muted
            )
        }
        if dayDiff == 1 {
            return DueChip(text: "Mañana \(timeText)", tone: .muted)
        }
        if dayDiff < 7 {
            return DueChip(
                text: "\(shortWeekday(date, calendar: calendar)) \(timeText)",
                tone: .muted
            )
        }
        return DueChip(
            text: "\(formatDayMonth(date, calendar: calendar, includeYear: false)) \(timeText)",
            tone: .muted
        )
    }

    public static func formatReminder(
        iso: String,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> DueChip {
        guard let date = ISO8601Parsing.date(from: iso) else {
            return DueChip(text: iso, tone: .muted)
        }
        if date < now {
            let relative = formatRelativeShort(date: date, now: now)
            return DueChip(text: "Avisó \(relative)", tone: .muted)
        }
        return formatDue(iso: iso, now: now, calendar: calendar)
    }

    public static func formatDateTimeField(
        iso: String,
        calendar: Calendar = .current
    ) -> String {
        guard let date = ISO8601Parsing.date(from: iso) else { return iso }
        let day = formatDayMonth(date, calendar: calendar, includeYear: true)
        let time = formatClock(date, calendar: calendar)
        return "\(day), \(time)"
    }

    public static func formatSyncSubtitle(
        isOffline: Bool,
        lastSuccessAt: Date?,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> String {
        if isOffline {
            guard let lastSuccessAt else { return AttentionStrings.syncOffline }
            let relative = formatRelative(date: lastSuccessAt, now: now, calendar: calendar)
            return "\(AttentionStrings.syncOffline) · datos de \(relative)"
        }
        guard let lastSuccessAt else { return AttentionStrings.syncUpToDatePrefix }
        let relative = formatRelative(date: lastSuccessAt, now: now, calendar: calendar)
        return "\(AttentionStrings.syncUpToDatePrefix) · \(relative)"
    }

    public static func formatRelativeShort(date: Date, now: Date) -> String {
        let diffMs = now.timeIntervalSince(date) * 1000
        let mins = Int(floor(diffMs / 60_000))
        if mins < 1 { return "hace un momento" }
        if mins < 60 { return "hace \(mins) min" }
        let hours = mins / 60
        if hours < 24 { return "hace \(hours) h" }
        let days = hours / 24
        return "hace \(days) d"
    }

    private static func formatClock(_ date: Date, calendar: Calendar) -> String {
        let hour = calendar.component(.hour, from: date)
        let minute = calendar.component(.minute, from: date)
        return String(format: "%02d:%02d", hour, minute)
    }

    private static func shortWeekday(_ date: Date, calendar: Calendar) -> String {
        let symbols = calendar.shortWeekdaySymbols
        let index = calendar.component(.weekday, from: date) - 1
        guard index >= 0, index < symbols.count else { return "" }
        return symbols[index].lowercased()
    }

    private static func formatDayMonth(
        _ date: Date,
        calendar: Calendar,
        includeYear: Bool
    ) -> String {
        let day = calendar.component(.day, from: date)
        let monthIndex = calendar.component(.month, from: date) - 1
        let months = calendar.shortMonthSymbols
        let month = (monthIndex >= 0 && monthIndex < months.count)
            ? months[monthIndex].lowercased()
            : ""
        if includeYear {
            let year = calendar.component(.year, from: date)
            return "\(day) \(month) \(year)"
        }
        return "\(day) \(month)"
    }

    private static func startOfDayDiff(from: Date, to: Date, calendar: Calendar) -> Int {
        let startFrom = calendar.startOfDay(for: from)
        let startTo = calendar.startOfDay(for: to)
        let components = calendar.dateComponents([.day], from: startFrom, to: startTo)
        return components.day ?? 0
    }

    private static func sameYear(_ a: Date, _ b: Date, calendar: Calendar) -> Bool {
        calendar.component(.year, from: a) == calendar.component(.year, from: b)
    }
}
