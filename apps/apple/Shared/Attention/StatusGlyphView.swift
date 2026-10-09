import SwiftUI
import RelayKit

struct StatusGlyphView: View {
    let status: Status
    var size: CGFloat = 16

    var body: some View {
        ZStack {
            Circle()
                .stroke(strokeColor, lineWidth: 1.5)
                .frame(width: size, height: size)
            switch status {
            case .needsYou:
                Circle()
                    .fill(strokeColor)
                    .frame(width: size * 0.35, height: size * 0.35)
            case .blocked:
                Capsule()
                    .fill(strokeColor)
                    .frame(width: size * 0.5, height: 2)
            case .inProgress:
                Circle()
                    .trim(from: 0, to: 0.55)
                    .stroke(strokeColor, lineWidth: 1.5)
                    .frame(width: size * 0.7, height: size * 0.7)
            default:
                EmptyView()
            }
        }
        .accessibilityHidden(true)
    }

    private var strokeColor: Color {
        switch status {
        case .needsYou: return RelayTheme.accent
        case .blocked: return RelayTheme.warn
        case .done: return RelayTheme.ok
        default: return RelayTheme.ink2
        }
    }
}
