import XCTest
@testable import RelayKit
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

final class RelayClientTests: XCTestCase {
    func testClientDecodesFixtureViaDecodeHelper() throws {
        let client = RelayClient.localDefault()
        let data = try FixtureLoader.data(named: "inbox_attention")
        let inbox = try client.decode(InboxQueryResult.self, from: data)
        XCTAssertEqual(inbox.view, .attention)
        XCTAssertEqual(inbox.sections?.first?.key, .needsYou)
    }

    func testClientFetchesHealthFromLiveServerIfAvailable() async throws {
        let client = RelayClient.localDefault()
        do {
            let health = try await client.health()
            XCTAssertTrue(health.ok)
            let inbox = try await client.fetchAttention()
            XCTAssertEqual(inbox.view, .attention)
        } catch RelayAPIError.transport {
            // Server not running in this environment — fixture tests still cover decoding.
            throw XCTSkip("Relay server not reachable at localhost:7420")
        } catch RelayAPIError.httpStatus {
            throw XCTSkip("Relay server returned an error; fixture tests remain authoritative")
        }
    }
}

enum FixtureLoader {
    static func data(named name: String) throws -> Data {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
                ?? Bundle.module.url(forResource: name, withExtension: "json")
        )
        return try Data(contentsOf: url)
    }
}
