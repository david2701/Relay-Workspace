import SwiftUI
import RelayKit
#if canImport(AppKit)
import AppKit
#endif
#if canImport(UIKit)
import UIKit
#endif

public extension RelayColor {
    /// Asset-free dynamic SwiftUI color: light/dark resolved via platform dynamic provider.
    static func swiftUIColor(light: RelayColor, dark: RelayColor) -> Color {
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
    public static let paper = RelayColor.swiftUIColor(light: RelayTokens.light.paper, dark: RelayTokens.dark.paper)
    public static let raised = RelayColor.swiftUIColor(light: RelayTokens.light.raised, dark: RelayTokens.dark.raised)
    public static let sunken = RelayColor.swiftUIColor(light: RelayTokens.light.sunken, dark: RelayTokens.dark.sunken)
    public static let line = RelayColor.swiftUIColor(light: RelayTokens.light.line, dark: RelayTokens.dark.line)
    public static let lineStrong = RelayColor.swiftUIColor(light: RelayTokens.light.lineStrong, dark: RelayTokens.dark.lineStrong)
    public static let control = RelayColor.swiftUIColor(light: RelayTokens.light.control, dark: RelayTokens.dark.control)
    public static let ink = RelayColor.swiftUIColor(light: RelayTokens.light.ink, dark: RelayTokens.dark.ink)
    public static let ink2 = RelayColor.swiftUIColor(light: RelayTokens.light.ink2, dark: RelayTokens.dark.ink2)
    public static let inkMuted = RelayColor.swiftUIColor(light: RelayTokens.light.inkMuted, dark: RelayTokens.dark.inkMuted)
    public static let hl = RelayColor.swiftUIColor(light: RelayTokens.light.hl, dark: RelayTokens.dark.hl)
    public static let onHl = RelayColor.swiftUIColor(light: RelayTokens.light.onHl, dark: RelayTokens.dark.onHl)
    public static let accent = RelayColor.swiftUIColor(light: RelayTokens.light.accent, dark: RelayTokens.dark.accent)
    public static let accentInk = RelayColor.swiftUIColor(light: RelayTokens.light.accentInk, dark: RelayTokens.dark.accentInk)
    public static let accentTint = RelayColor.swiftUIColor(light: RelayTokens.light.accentTint, dark: RelayTokens.dark.accentTint)
    public static let attentionRule = RelayColor.swiftUIColor(
        light: RelayTokens.light.attentionRule,
        dark: RelayTokens.dark.attentionRule
    )
    public static let ok = RelayColor.swiftUIColor(light: RelayTokens.light.ok, dark: RelayTokens.dark.ok)
    public static let warn = RelayColor.swiftUIColor(light: RelayTokens.light.warn, dark: RelayTokens.dark.warn)
    public static let crit = RelayColor.swiftUIColor(light: RelayTokens.light.crit, dark: RelayTokens.dark.crit)

    public static let selectedRowRadius: CGFloat = CGFloat(RelayTokens.light.selectedRowRadius)
    public static let needsYouRuleWidth: CGFloat = CGFloat(RelayTokens.light.needsYouRuleWidth)
    public static let selectedRowBorderWidth: CGFloat = CGFloat(RelayTokens.light.selectedRowBorderWidth)
}
