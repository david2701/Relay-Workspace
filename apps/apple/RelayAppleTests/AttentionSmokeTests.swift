import XCTest
import RelayKit

/// Xcode-host smoke tests. Primary coverage lives in `RelayKit` (`swift test` on Linux).
final class AttentionSmokeTests: XCTestCase {
    func testDefaultsAndSectionCopy() {
        XCTAssertEqual(RelayDefaults.apiBaseURLString, "http://localhost:7420")
        XCTAssertEqual(AttentionStrings.sectionTitle(for: .needsYou), "Te necesita")
        XCTAssertEqual(RelayTokens.light.hl.hex, "#F8ED60")
        XCTAssertEqual(RelayTokens.light.onHl.hex, "#1F1D17")
    }

    func testNeighborNavigation() {
        let ids = ["a", "b"]
        XCTAssertEqual(AttentionPresentation.neighborId(of: "a", in: ids, delta: 1), "b")
    }
}
