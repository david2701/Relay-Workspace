import SwiftUI
import RelayKit

struct ActorMarkView: View {
    let mark: ActorMarkModel
    var size: CGFloat = 22

    var body: some View {
        Text(mark.monogram)
            .font(.system(size: size * 0.42, weight: .semibold))
            .foregroundStyle(mark.shape == .circle && mark.monogram == RelayDefaults.humanMonogram
                ? RelayTheme.paper
                : RelayTheme.ink)
            .frame(width: size, height: size)
            .background {
                if mark.shape == .circle {
                    Circle()
                        .fill(mark.monogram == RelayDefaults.humanMonogram ? RelayTheme.ink : RelayTheme.raised)
                        .overlay(Circle().stroke(RelayTheme.ink, lineWidth: 1))
                } else {
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .stroke(RelayTheme.ink, lineWidth: 1)
                        .background(
                            RoundedRectangle(cornerRadius: 5, style: .continuous)
                                .fill(RelayTheme.raised)
                        )
                }
            }
            .accessibilityLabel(mark.displayName)
    }
}

struct ActorFlowView: View {
    let from: ActorMarkModel?
    let to: ActorMarkModel

    var body: some View {
        HStack(spacing: 4) {
            if let from {
                ActorMarkView(mark: from, size: 20)
                Text("→")
                    .font(.caption)
                    .foregroundStyle(RelayTheme.inkMuted)
            }
            ActorMarkView(mark: to, size: 20)
        }
        .accessibilityElement(children: .combine)
    }
}
