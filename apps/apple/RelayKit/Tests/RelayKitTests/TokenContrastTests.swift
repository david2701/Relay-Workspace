import XCTest
@testable import RelayKit

final class TokenContrastTests: XCTestCase {
    func testYellowFillUsesOnHlInk() {
        for scheme in [RelayTokens.light, RelayTokens.dark] {
            XCTAssertEqual(scheme.hl.hex, "#F8ED60")
            XCTAssertEqual(scheme.onHl.hex, "#1F1D17")
            let ratio = ContrastMath.contrastRatio(scheme.onHl, scheme.hl)
            XCTAssertGreaterThanOrEqual(ratio, 4.5, "on-hl / hl must be ≥ 4.5:1")
            XCTAssertEqual(scheme.selectedRowRadius, 8)
            XCTAssertEqual(scheme.needsYouRuleWidth, 2)
            XCTAssertEqual(scheme.selectedRowBorderWidth, 1)
        }
    }

    func testSelectedRowIsNeutralRaisedNotAccentTint() {
        let light = RelayTokens.light
        let dark = RelayTokens.dark
        XCTAssertEqual(light.selectedRowFill.hex, light.raised.hex)
        XCTAssertEqual(dark.selectedRowFill.hex, dark.raised.hex)
        XCTAssertNotEqual(light.selectedRowFill.hex, light.accentTint.hex)
        XCTAssertNotEqual(dark.selectedRowFill.hex, dark.accentTint.hex)
        XCTAssertEqual(light.needsYouRowFill.hex, "#FBF0AE")
        XCTAssertEqual(dark.needsYouRowFill.hex, "#312C0A")
        XCTAssertEqual(light.attentionRule.hex, "#8F791B")
        XCTAssertEqual(dark.attentionRule.hex, "#F8ED60")
    }

    func testLightOchresAndDarkYellowTextMeetSpecFloors() {
        let light = RelayTokens.light
        XCTAssertEqual(light.accentInk.hex, "#725F02")
        XCTAssertEqual(light.accent.hex, "#8F791B")
        XCTAssertEqual(light.focus.hex, "#725F02")
        XCTAssertGreaterThanOrEqual(
            ContrastMath.contrastRatio(light.accentInk, light.paper),
            4.5
        )
        XCTAssertGreaterThanOrEqual(
            ContrastMath.contrastRatio(light.accentInk, light.raised),
            4.5
        )
        XCTAssertGreaterThanOrEqual(
            ContrastMath.contrastRatio(light.accent, light.paper),
            3.0
        )
        XCTAssertGreaterThanOrEqual(
            ContrastMath.contrastRatio(light.ink, light.paper),
            4.5
        )
        let dark = RelayTokens.dark
        XCTAssertEqual(dark.accentInk.hex, "#F8ED60")
        XCTAssertEqual(dark.accent.hex, "#F8ED60")
        XCTAssertEqual(dark.focus.hex, "#F8ED60")
        XCTAssertGreaterThanOrEqual(
            ContrastMath.contrastRatio(dark.accentInk, dark.paper),
            4.5
        )
        XCTAssertGreaterThanOrEqual(
            ContrastMath.contrastRatio(dark.ink, dark.paper),
            4.5
        )
        // Selected-row control border ≥ 3:1 against raised (WCAG non-text)
        XCTAssertGreaterThanOrEqual(
            ContrastMath.contrastRatio(light.control, light.raised),
            3.0
        )
        XCTAssertGreaterThanOrEqual(
            ContrastMath.contrastRatio(dark.control, dark.raised),
            3.0
        )
    }

    func testInkOnAccentTintMeetsTextFloor() {
        let light = RelayTokens.light
        let dark = RelayTokens.dark
        XCTAssertGreaterThanOrEqual(
            ContrastMath.contrastRatio(light.ink, light.accentTint),
            4.5
        )
        XCTAssertGreaterThanOrEqual(
            ContrastMath.contrastRatio(dark.ink, dark.accentTint),
            4.5
        )
        XCTAssertGreaterThanOrEqual(
            ContrastMath.contrastRatio(light.inkMuted, light.accentTint),
            4.5
        )
        XCTAssertGreaterThanOrEqual(
            ContrastMath.contrastRatio(dark.inkMuted, dark.accentTint),
            4.5
        )
    }
}
