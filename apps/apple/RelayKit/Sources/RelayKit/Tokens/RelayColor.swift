import Foundation

/// Neutral RGBA color token — no SwiftUI / UIKit dependency.
public struct RelayColor: Sendable, Equatable, Codable {
    public let red: Double
    public let green: Double
    public let blue: Double
    public let alpha: Double
    public let hex: String

    public init(red: Double, green: Double, blue: Double, alpha: Double = 1.0, hex: String) {
        self.red = red
        self.green = green
        self.blue = blue
        self.alpha = alpha
        self.hex = hex.uppercased()
    }

    /// Parse `#RRGGBB` or `RRGGBB`.
    public init(hex: String, alpha: Double = 1.0) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
            .uppercased()
        precondition(cleaned.count == 6, "Expected 6-digit hex, got \(hex)")
        guard
            let ri = Int(cleaned.prefix(2), radix: 16),
            let gi = Int(cleaned.dropFirst(2).prefix(2), radix: 16),
            let bi = Int(cleaned.suffix(2), radix: 16)
        else {
            preconditionFailure("Invalid hex digits in \(hex)")
        }
        self.init(
            red: Double(ri) / 255.0,
            green: Double(gi) / 255.0,
            blue: Double(bi) / 255.0,
            alpha: alpha,
            hex: "#\(cleaned)"
        )
    }
}

/// WCAG 2.x relative luminance and contrast helpers for token tests.
public enum ContrastMath {
    public static func relativeLuminance(of color: RelayColor) -> Double {
        func channel(_ c: Double) -> Double {
            if c <= 0.03928 {
                return c / 12.92
            }
            return pow((c + 0.055) / 1.055, 2.4)
        }
        let r = channel(color.red)
        let g = channel(color.green)
        let b = channel(color.blue)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    public static func contrastRatio(_ a: RelayColor, _ b: RelayColor) -> Double {
        let l1 = relativeLuminance(of: a)
        let l2 = relativeLuminance(of: b)
        let lighter = max(l1, l2)
        let darker = min(l1, l2)
        return (lighter + 0.05) / (darker + 0.05)
    }
}
