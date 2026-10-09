import XCTest
@testable import RelayKit

final class StatusDecodingTests: XCTestCase {
    func testAllSevenStatusesDecodeFromFixtures() throws {
        let expected: [Status] = [
            .inbox, .assigned, .inProgress, .blocked, .needsYou, .done, .cancelled,
        ]
        XCTAssertEqual(Status.allCases.count, 7)
        XCTAssertEqual(Set(Status.allCases), Set(expected))
        for status in expected {
            let name = status.rawValue
            let data = try FixtureLoader.data(named: "item_\(name)")
            let envelope = try JSONDecoder().decode(ItemEnvelope.self, from: data)
            XCTAssertEqual(envelope.item.status, status, "Failed for \(name)")
        }
    }

    func testItemsAllStatusesFixtureCoversSeven() throws {
        let data = try FixtureLoader.data(named: "items_all_statuses")
        let envelope = try JSONDecoder().decode(ItemsEnvelope.self, from: data)
        let statuses = Set(envelope.items.map(\.status))
        XCTAssertEqual(statuses.count, 7)
        XCTAssertEqual(statuses, Set(Status.allCases))
    }
}
