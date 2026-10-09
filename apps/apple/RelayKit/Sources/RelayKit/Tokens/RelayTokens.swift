import Foundation

/// Design tokens from ui-spec-v0.3 §9.5 (yellow accent, r8 selected-row revision).
/// Values are neutral RGBA/hex — consumers map them into SwiftUI `Color` later.
public struct RelayTokens: Sendable, Equatable {
    public let paper: RelayColor
    public let raised: RelayColor
    public let sunken: RelayColor
    public let line: RelayColor
    public let lineStrong: RelayColor
    public let control: RelayColor
    public let ink: RelayColor
    public let ink2: RelayColor
    public let inkMuted: RelayColor
    /// Yellow fill only (`--hl`). Never use as text or hairline in light.
    public let hl: RelayColor
    /// Ink on yellow fill (`--on-hl`).
    public let onHl: RelayColor
    /// Fine UI / glyph / rule (`--accent`). Ochre in light, yellow in dark.
    public let accent: RelayColor
    /// Textual accent / links / focus twin (`--accent-ink`).
    public let accentInk: RelayColor
    /// Soft yellow tint for needs_you / chips / selection flash (`--accent-tint`).
    public let accentTint: RelayColor
    public let onAccent: RelayColor
    public let attentionRule: RelayColor
    public let focus: RelayColor
    public let ok: RelayColor
    public let warn: RelayColor
    public let crit: RelayColor
    /// Selected row corner radius (r8 revision).
    public let selectedRowRadius: Double
    /// needs_you left rule width in px.
    public let needsYouRuleWidth: Double
    /// Selected row border width in px (`--control`).
    public let selectedRowBorderWidth: Double

    public static let light = RelayTokens(
        paper: RelayColor(hex: "#FBFAF7"),
        raised: RelayColor(hex: "#FFFEFD"),
        sunken: RelayColor(hex: "#F4F2EE"),
        line: RelayColor(hex: "#E2DFDA"),
        lineStrong: RelayColor(hex: "#C1BDB7"),
        control: RelayColor(hex: "#83807A"),
        ink: RelayColor(hex: "#1F1D17"),
        ink2: RelayColor(hex: "#504D46"),
        inkMuted: RelayColor(hex: "#6B6963"),
        hl: RelayColor(hex: "#F8ED60"),
        onHl: RelayColor(hex: "#1F1D17"),
        accent: RelayColor(hex: "#8F791B"),
        accentInk: RelayColor(hex: "#725F02"),
        accentTint: RelayColor(hex: "#FBF0AE"),
        onAccent: RelayColor(hex: "#1F1D17"),
        attentionRule: RelayColor(hex: "#8F791B"),
        focus: RelayColor(hex: "#725F02"),
        ok: RelayColor(hex: "#317A45"),
        warn: RelayColor(hex: "#925A1A"),
        crit: RelayColor(hex: "#B6322D"),
        selectedRowRadius: 8,
        needsYouRuleWidth: 2,
        selectedRowBorderWidth: 1
    )

    public static let dark = RelayTokens(
        paper: RelayColor(hex: "#141310"),
        raised: RelayColor(hex: "#1B1916"),
        sunken: RelayColor(hex: "#0E0D0A"),
        line: RelayColor(hex: "#302E29"),
        lineStrong: RelayColor(hex: "#4A4742"),
        control: RelayColor(hex: "#6B6963"),
        ink: RelayColor(hex: "#EAE8E3"),
        ink2: RelayColor(hex: "#C0BDB8"),
        inkMuted: RelayColor(hex: "#A19E99"),
        hl: RelayColor(hex: "#F8ED60"),
        onHl: RelayColor(hex: "#1F1D17"),
        accent: RelayColor(hex: "#F8ED60"),
        accentInk: RelayColor(hex: "#F8ED60"),
        accentTint: RelayColor(hex: "#312C0A"),
        onAccent: RelayColor(hex: "#1F1D17"),
        attentionRule: RelayColor(hex: "#F8ED60"),
        focus: RelayColor(hex: "#F8ED60"),
        ok: RelayColor(hex: "#73C385"),
        warn: RelayColor(hex: "#EBB25F"),
        crit: RelayColor(hex: "#F87F73"),
        selectedRowRadius: 8,
        needsYouRuleWidth: 2,
        selectedRowBorderWidth: 1
    )

    /// Selected row uses elevated neutral surface + 1 px control border (r8) — not accent tint.
    public var selectedRowFill: RelayColor { raised }

    /// needs_you row fill is accent tint (with 2 px attention rule).
    public var needsYouRowFill: RelayColor { accentTint }
}
