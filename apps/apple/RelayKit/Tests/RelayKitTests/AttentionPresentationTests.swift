import XCTest
@testable import RelayKit

final class AttentionPresentationTests: XCTestCase {
    func testNonEmptySectionsPreserveServerOrder() throws {
        let inbox = try loadAttentionFixture()
        let sections = AttentionPresentation.nonEmptySections(from: inbox)
        XCTAssertEqual(sections.map(\.key), [.needsYou, .blocked, .today])
        XCTAssertFalse(AttentionPresentation.isEmpty(inbox))
    }

    func testNeighborNavigationWrapsSelectionBounds() throws {
        let ids = ["a", "b", "c"]
        XCTAssertEqual(AttentionPresentation.neighborId(of: "a", in: ids, delta: 1), "b")
        XCTAssertEqual(AttentionPresentation.neighborId(of: "c", in: ids, delta: 1), "c")
        XCTAssertEqual(AttentionPresentation.neighborId(of: "a", in: ids, delta: -1), "a")
        XCTAssertEqual(AttentionPresentation.neighborId(of: nil, in: ids, delta: 1), "a")
        XCTAssertEqual(AttentionPresentation.neighborId(of: nil, in: ids, delta: -1), "c")
    }

    func testNeedsYouRowChromeUsesTintAndRule() throws {
        let inbox = try loadAttentionFixture()
        let item = try XCTUnwrap(AttentionPresentation.item(id: "itm_32pxnq1110", in: inbox))
        let chrome = AttentionPresentation.rowChrome(item: item, isSelected: true)
        XCTAssertEqual(chrome.fill, .needsYouTint)
        XCTAssertTrue(chrome.showsNeedsYouRule)
        XCTAssertEqual(chrome.borderWidth, 2)
        XCTAssertEqual(chrome.cornerRadius, 8)
    }

    func testSelectedNonNeedsYouUsesRaisedAndControlBorder() throws {
        let inbox = try loadAttentionFixture()
        let item = try XCTUnwrap(AttentionPresentation.item(id: "itm_cozkg4zncr", in: inbox))
        let chrome = AttentionPresentation.rowChrome(item: item, isSelected: true)
        XCTAssertEqual(chrome.fill, .raised)
        XCTAssertTrue(chrome.showsSelectedBorder)
        XCTAssertTrue(chrome.showsSelectedShadow)
        XCTAssertEqual(chrome.borderWidth, 1)
        XCTAssertFalse(chrome.showsNeedsYouRule)
    }

    func testMetaLineUsesAgentNameForNeedsYou() throws {
        let inbox = try loadAttentionFixture()
        let agents = try loadAgents()
        let item = try XCTUnwrap(AttentionPresentation.item(id: "itm_32pxnq1110", in: inbox))
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let now = ISO8601Parsing.date(from: "2026-10-09T03:40:42.176Z")!
        let line = AttentionPresentation.metaLine(
            item: item,
            agentsById: agents,
            now: now,
            calendar: calendar
        )
        XCTAssertTrue(line.contains("Agente de código") || line.contains("necesita tu decisión"))
        XCTAssertTrue(line.contains("necesita tu decisión"))
    }

    func testSectionTitlesAreSpanish() {
        XCTAssertEqual(AttentionStrings.sectionTitle(for: .needsYou), "Te necesita")
        XCTAssertEqual(AttentionStrings.sectionTitle(for: .blocked), "Atascado")
        XCTAssertEqual(AttentionStrings.sectionTitle(for: .today), "Para hoy")
    }

    func testEmptyBodyMentionsTeamCount() {
        let mac = AttentionStrings.emptyBody(activeItemCount: 1, platform: .mac)
        XCTAssertTrue(mac.contains("1 ítem"))
        let phone = AttentionStrings.emptyBody(activeItemCount: 3, platform: .phone)
        XCTAssertTrue(phone.contains("3 ítems"))
    }

    func testHandoffPointsToHumanForNeedsYou() throws {
        let inbox = try loadAttentionFixture()
        let agents = try loadAgents()
        let item = try XCTUnwrap(AttentionPresentation.item(id: "itm_32pxnq1110", in: inbox))
        let handoff = AttentionPresentation.handoff(item: item, agentsById: agents)
        XCTAssertEqual(handoff.toMark.monogram, RelayDefaults.humanMonogram)
        XCTAssertEqual(handoff.toMark.shape, .circle)
        XCTAssertEqual(handoff.fromMark?.shape, .roundedSquare)
    }

    func testFlattenedIdsFollowSectionOrder() throws {
        let inbox = try loadAttentionFixture()
        let ids = AttentionPresentation.flattenedItemIds(from: inbox)
        XCTAssertEqual(ids.first, "itm_32pxnq1110")
        XCTAssertEqual(ids.count, 4)
    }

    private func loadAttentionFixture() throws -> InboxQueryResult {
        let data = try FixtureLoader.data(named: "inbox_attention")
        return try JSONDecoder().decode(InboxQueryResult.self, from: data)
    }

    private func loadAgents() throws -> [String: Agent] {
        let data = try FixtureLoader.data(named: "agents")
        let envelope = try JSONDecoder().decode(AgentsEnvelope.self, from: data)
        return Dictionary(uniqueKeysWithValues: envelope.agents.map { ($0.id, $0) })
    }
}
