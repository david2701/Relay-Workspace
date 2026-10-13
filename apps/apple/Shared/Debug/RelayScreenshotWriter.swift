import Foundation
import SwiftUI

#if DEBUG
#if canImport(AppKit)
import AppKit
#endif

/// Writes PNG screenshots from inside the DEBUG app via SwiftUI ImageRenderer.
enum RelayScreenshotWriter {
    static func outputDirectories() -> [URL] {
        var dirs: [URL] = [
            URL(fileURLWithPath: "/tmp/relay-apple-screenshots", isDirectory: true),
        ]
        if let raw = ProcessInfo.processInfo.environment["RELAY_SCREENSHOT_DIR"], !raw.isEmpty {
            dirs.insert(URL(fileURLWithPath: raw, isDirectory: true), at: 0)
        }
        return dirs
    }

    static func writePNG(named name: String, data: Data) {
        for directory in outputDirectories() {
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let url = directory.appendingPathComponent("\(name).png")
                try data.write(to: url, options: .atomic)
                NSLog("RelayScreenshotWriter wrote \(url.path)")
            } catch {
                NSLog("RelayScreenshotWriter failed \(name): \(error)")
            }
        }
    }

    #if canImport(AppKit)
    @MainActor
    static func captureMacView<V: View>(named name: String, size: CGSize, content: V) {
        let rooted = content
            .frame(width: size.width, height: size.height)
            .background(Color(nsColor: .windowBackgroundColor))
        let renderer = ImageRenderer(content: rooted)
        renderer.scale = 2
        guard let nsImage = renderer.nsImage,
              let tiff = nsImage.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff),
              let data = rep.representation(using: .png, properties: [:])
        else {
            NSLog("RelayScreenshotWriter: ImageRenderer failed for \(name)")
            return
        }
        writePNG(named: name, data: data)
    }

    @MainActor
    static func scheduleMacCapturesIfNeeded(viewModel: AttentionViewModel) {
        guard PenpotSampleData.shouldLoadForUIScreenshots else { return }
        let appearance: String
        switch RelayScreenshotAppearance.preferredColorScheme {
        case .dark: appearance = "dark"
        default: appearance = "light"
        }
        let screen = PenpotSampleData.screenshotScreen
        let name: String
        if screen == "detail" {
            name = "mac-attention-detail-\(appearance)"
        } else {
            name = "mac-attention-\(appearance)"
        }
        let scheme = RelayScreenshotAppearance.preferredColorScheme
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            if screen == "detail", let item = viewModel.selectedItem {
                let detail = AttentionDetailView(
                    item: item,
                    agentsById: viewModel.agentsById,
                    decisionDraft: Binding(
                        get: { viewModel.decisionDraft },
                        set: { viewModel.decisionDraft = $0 }
                    ),
                    onReturn: {},
                    onTakeMyself: {},
                    showsPhoneActions: false
                )
                .preferredColorScheme(scheme)
                // Detail pane with selected Penpot item (`attention-detail` a11y id on the view).
                captureMacView(
                    named: name,
                    size: CGSize(width: 720, height: 760),
                    content: detail
                )
            } else {
                let root = MacAttentionRootView(viewModel: viewModel)
                    .preferredColorScheme(scheme)
                captureMacView(
                    named: name,
                    size: CGSize(width: 1180, height: 760),
                    content: root
                )
            }
            let marker = URL(fileURLWithPath: "/tmp/relay-apple-screenshots/\(name).done")
            try? FileManager.default.createDirectory(
                at: marker.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try? Data().write(to: marker)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                NSApp.terminate(nil)
            }
        }
    }
    #endif
}
#endif
