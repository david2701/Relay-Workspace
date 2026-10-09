import XCTest
@testable import RelayKit

final class InboxDecodingTests: XCTestCase {
    func testAttentionInboxFixtureDecodes() throws {
        let data = try FixtureLoader.data(named: "inbox_attention")
        let inbox = try JSONDecoder().decode(InboxQueryResult.self, from: data)
        XCTAssertEqual(inbox.view, .attention)
        XCTAssertGreaterThanOrEqual(inbox.counters.needsYou, 1)
        let sections = try XCTUnwrap(inbox.sections)
        XCTAssertEqual(sections.map(\.key), [.needsYou, .blocked, .today])
        let needs = try XCTUnwrap(sections.first { $0.key == .needsYou })
        XCTAssertEqual(needs.items.first?.status, .needsYou)
        XCTAssertNotNil(needs.items.first?.needsYouReason)
        let blocked = try XCTUnwrap(sections.first { $0.key == .blocked })
        XCTAssertEqual(blocked.items.first?.status, .blocked)
    }

    func testAgentsFixtureDecodes() throws {
        let data = try FixtureLoader.data(named: "agents")
        let envelope = try JSONDecoder().decode(AgentsEnvelope.self, from: data)
        XCTAssertFalse(envelope.agents.isEmpty)
        XCTAssertEqual(envelope.agents.first?.monogram.isEmpty, false)
    }
}
