import SwiftUI
import RelayKit
#if canImport(AppKit)
import AppKit
#endif
#if canImport(UIKit)
import UIKit
#endif

#if DEBUG
/// Forces RelayTheme token resolution for ImageRenderer screenshot captures.
enum RelayScreenshotPalette {
    /// When non-nil, `RelayColor.swiftUIColor` returns static light/dark tokens.
    static var forceDark: Bool?
}
#endif

public extension RelayColor {
    /// Asset-free dynamic SwiftUI color: light/dark resolved via platform dynamic provider.
    static func swiftUIColor(light: RelayColor, dark: RelayColor) -> Color {
        #if DEBUG
        // ImageRenderer does not honor NSColor dynamic appearance. Pin tokens for screenshots.
        if let forceDark = RelayScreenshotPalette.forceDark {
            return (forceDark ? dark : light).color
        }
        if PenpotSampleData.shouldLoadForUIScreenshots {
            let useDark = RelayScreenshotAppearance.preferredColorScheme == .dark
            return (useDark ? dark : light).color
        }
        #endif
        #if canImport(AppKit) && !targetEnvironment(macCatalyst)
        return Color(
            nsColor: NSColor(name: nil, dynamicProvider: { appearance in
                let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
                let token = isDark ? dark : light
                return NSColor(
                    calibratedRed: CGFloat(token.red),
                    green: CGFloat(token.green),
                    blue: CGFloat(token.blue),
                    alpha: CGFloat(token.alpha)
                )
            })
        )
        #elseif canImport(UIKit)
        return Color(
            uiColor: UIColor { traits in
                let isDark = traits.userInterfaceStyle == .dark
                let token = isDark ? dark : light
                return UIColor(
                    red: CGFloat(token.red),
                    green: CGFloat(token.green),
                    blue: CGFloat(token.blue),
                    alpha: CGFloat(token.alpha)
                )
            }
        )
        #else
        return Color(
            red: light.red,
            green: light.green,
            blue: light.blue,
            opacity: light.alpha
        )
        #endif
    }

    var color: Color {
        Color(
            red: red,
            green: green,
            blue: blue,
            opacity: alpha
        )
    }
}

public enum RelayTheme {
    // Computed so DEBUG screenshot palette can flip light/dark per capture process.
    public static var paper: Color { RelayColor.swiftUIColor(light: RelayTokens.light.paper, dark: RelayTokens.dark.paper) }
    public static var raised: Color { RelayColor.swiftUIColor(light: RelayTokens.light.raised, dark: RelayTokens.dark.raised) }
    public static var sunken: Color { RelayColor.swiftUIColor(light: RelayTokens.light.sunken, dark: RelayTokens.dark.sunken) }
    public static var line: Color { RelayColor.swiftUIColor(light: RelayTokens.light.line, dark: RelayTokens.dark.line) }
    public static var lineStrong: Color { RelayColor.swiftUIColor(light: RelayTokens.light.lineStrong, dark: RelayTokens.dark.lineStrong) }
    public static var control: Color { RelayColor.swiftUIColor(light: RelayTokens.light.control, dark: RelayTokens.dark.control) }
    public static var ink: Color { RelayColor.swiftUIColor(light: RelayTokens.light.ink, dark: RelayTokens.dark.ink) }
    public static var ink2: Color { RelayColor.swiftUIColor(light: RelayTokens.light.ink2, dark: RelayTokens.dark.ink2) }
    public static var inkMuted: Color { RelayColor.swiftUIColor(light: RelayTokens.light.inkMuted, dark: RelayTokens.dark.inkMuted) }
    public static var hl: Color { RelayColor.swiftUIColor(light: RelayTokens.light.hl, dark: RelayTokens.dark.hl) }
    public static var onHl: Color { RelayColor.swiftUIColor(light: RelayTokens.light.onHl, dark: RelayTokens.dark.onHl) }
    public static var accent: Color { RelayColor.swiftUIColor(light: RelayTokens.light.accent, dark: RelayTokens.dark.accent) }
    public static var accentInk: Color { RelayColor.swiftUIColor(light: RelayTokens.light.accentInk, dark: RelayTokens.dark.accentInk) }
    public static var accentTint: Color { RelayColor.swiftUIColor(light: RelayTokens.light.accentTint, dark: RelayTokens.dark.accentTint) }
    public static var attentionRule: Color {
        RelayColor.swiftUIColor(light: RelayTokens.light.attentionRule, dark: RelayTokens.dark.attentionRule)
    }
    public static var ok: Color { RelayColor.swiftUIColor(light: RelayTokens.light.ok, dark: RelayTokens.dark.ok) }
    public static var warn: Color { RelayColor.swiftUIColor(light: RelayTokens.light.warn, dark: RelayTokens.dark.warn) }
    public static var crit: Color { RelayColor.swiftUIColor(light: RelayTokens.light.crit, dark: RelayTokens.dark.crit) }

    public static let selectedRowRadius: CGFloat = CGFloat(RelayTokens.light.selectedRowRadius)
    public static let needsYouRuleWidth: CGFloat = CGFloat(RelayTokens.light.needsYouRuleWidth)
    public static let selectedRowBorderWidth: CGFloat = CGFloat(RelayTokens.light.selectedRowBorderWidth)
}
