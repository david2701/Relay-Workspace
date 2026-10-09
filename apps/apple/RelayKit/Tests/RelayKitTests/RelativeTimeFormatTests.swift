import XCTest
@testable import RelayKit

final class RelativeTimeFormatTests: XCTestCase {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    private let now = ISO8601Parsing.date(from: "2026-10-09T12:00:00.000Z")!

    func testRelativeMinutesAndHours() {
        let minutesAgo = now.addingTimeInterval(-3 * 60)
        XCTAssertEqual(
            RelativeTimeFormat.formatRelative(date: minutesAgo, now: now, calendar: calendar),
            "hace 3 min"
        )
        let hoursAgo = now.addingTimeInterval(-3 * 3600)
        XCTAssertEqual(
            RelativeTimeFormat.formatRelative(date: hoursAgo, now: now, calendar: calendar),
            "hace 3 h"
        )
        XCTAssertEqual(
            RelativeTimeFormat.formatRelative(date: now, now: now, calendar: calendar),
            "ahora"
        )
    }

    func testDueTodayTomorrowAndOverdue() {
        let today = ISO8601Parsing.date(from: "2026-10-09T15:30:00.000Z")!
        let chip = RelativeTimeFormat.formatDue(
            iso: "2026-10-09T15:30:00.000Z",
            now: now,
            calendar: calendar
        )
        XCTAssertEqual(chip.text, "Hoy 15:30")
        let tomorrow = RelativeTimeFormat.formatDue(
            iso: "2026-10-10T13:12:00.000Z",
            now: now,
            calendar: calendar
        )
        XCTAssertEqual(tomorrow.text, "Mañana 13:12")
        let overdue = RelativeTimeFormat.formatDue(
            iso: "2026-10-09T08:00:00.000Z",
            now: now,
            calendar: calendar
        )
        XCTAssertEqual(overdue.tone, .crit)
        XCTAssertTrue(overdue.text.hasPrefix("Venció"))
        _ = today
    }

    func testReminderKeepsDayLabel() {
        let reminder = RelativeTimeFormat.formatReminder(
            iso: "2026-10-09T23:12:00.000Z",
            now: now,
            calendar: calendar
        )
        XCTAssertEqual(reminder.text, "Hoy 23:12")
    }

    func testSyncSubtitleOnlineAndOffline() {
        let fetched = now.addingTimeInterval(-12 * 60)
        let online = RelativeTimeFormat.formatSyncSubtitle(
            isOffline: false,
            lastSuccessAt: fetched,
            now: now,
            calendar: calendar
        )
        XCTAssertTrue(online.hasPrefix("Al día"))
        XCTAssertTrue(online.contains("hace 12 min"))
        let offline = RelativeTimeFormat.formatSyncSubtitle(
            isOffline: true,
            lastSuccessAt: fetched,
            now: now,
            calendar: calendar
        )
        XCTAssertTrue(offline.hasPrefix("Sin conexión"))
        XCTAssertTrue(offline.contains("hace 12 min"))
    }

    func testDateTimeFieldIncludesYear() {
        let text = RelativeTimeFormat.formatDateTimeField(
            iso: "2026-10-09T13:12:00.000Z",
            calendar: calendar
        )
        XCTAssertTrue(text.contains("2026"))
        XCTAssertTrue(text.contains("13:12"))
    }
}
