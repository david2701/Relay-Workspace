import Foundation
import SwiftUI

#if DEBUG
#if canImport(AppKit)
import AppKit
#endif

/// Writes PNG screenshots from inside the DEBUG app via SwiftUI ImageRenderer.
enum RelayScreenshotWriter {
    private static var didSchedule = false

    static func outputDirectories() -> [URL] {
        var dirs: [URL] = [
            URL(fileURLWithPath: "/tmp/relay-apple-screenshots", isDirectory: true),
        ]
        if let raw = ProcessInfo.processInfo.environment["RELAY_SCREENSHOT_DIR"], !raw.isEmpty {
            dirs.insert(URL(fileURLWithPath: raw, isDirectory: true), at: 0)
        }
        return dirs
    }

    static func log(_ message: String) {
        let line = "RelayScreenshotWriter: \(message)\n"
        fputs(line, stderr)
        fflush(stderr)
        NSLog("%@", "RelayScreenshotWriter: \(message)")
    }

    static func writePNG(named name: String, data: Data) {
        for directory in outputDirectories() {
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let url = directory.appendingPathComponent("\(name).png")
                try data.write(to: url, options: .atomic)
                log("wrote \(url.path) (\(data.count) bytes)")
            } catch {
                log("failed \(name): \(error)")
            }
        }
    }

    #if canImport(AppKit)
    @MainActor
    static func captureMacView<V: View>(
        named name: String,
        size: CGSize,
        colorScheme: ColorScheme?,
        content: V
    ) {
        // RelayTheme uses NSColor dynamicProvider — ImageRenderer follows NSApp.appearance,
        // not SwiftUI preferredColorScheme alone. Force aqua/darkAqua for distinct light/dark PNGs.
        let previousAppearance = NSApp.appearance
        switch colorScheme {
        case .dark:
            NSApp.appearance = NSAppearance(named: .darkAqua)
        case .light:
            NSApp.appearance = NSAppearance(named: .aqua)
        default:
            break
        }
        defer { NSApp.appearance = previousAppearance }

        let scheme = colorScheme ?? .light
        let rooted = content
            .environment(\.colorScheme, scheme)
            .preferredColorScheme(scheme)
            .frame(width: size.width, height: size.height)
            .background(RelayTheme.paper)
        let renderer = ImageRenderer(content: rooted)
        renderer.scale = 2
        guard let nsImage = renderer.nsImage,
              let tiff = nsImage.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff),
              let data = rep.representation(using: .png, properties: [:])
        else {
            log("ImageRenderer failed for \(name)")
            return
        }
        writePNG(named: name, data: data)
    }

    /// Schedule Mac PNG captures. Safe to call from AppDelegate (preferred on CI)
    /// or SwiftUI onAppear; only the first call runs.
    @MainActor
    static func scheduleMacCapturesIfNeeded(viewModel: AttentionViewModel) {
        guard PenpotSampleData.shouldLoadForUIScreenshots else {
            log("skip — UI screenshot launch args not present")
            return
        }
        guard !didSchedule else {
            log("skip — already scheduled")
            return
        }
        didSchedule = true

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
        log("scheduling \(name) screen=\(screen) appearance=\(appearance)")
        RelayScreenshotPalette.forceDark = (appearance == "dark")
        log("palette forceDark=\(String(describing: RelayScreenshotPalette.forceDark))")

        viewModel.bootstrap()
        if viewModel.selectedItemId == nil, let first = viewModel.itemIds.first {
            viewModel.selectItem(id: first)
        }

        // Short delay so SwiftUI/ImageRenderer layout settles on CI.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            NSApp.activate(ignoringOtherApps: true)
            if screen == "detail" {
                guard let item = viewModel.selectedItem else {
                    log("no selected item for detail capture")
                    NSApp.terminate(nil)
                    return
                }
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
                captureMacView(
                    named: name,
                    size: CGSize(width: 720, height: 760),
                    colorScheme: scheme,
                    content: detail
                )
            } else {
                let root = MacAttentionRootView(viewModel: viewModel)
                    .preferredColorScheme(scheme)
                captureMacView(
                    named: name,
                    size: CGSize(width: 1180, height: 760),
                    colorScheme: scheme,
                    content: root
                )
            }
            let marker = URL(fileURLWithPath: "/tmp/relay-apple-screenshots/\(name).done")
            try? FileManager.default.createDirectory(
                at: marker.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try? Data().write(to: marker)
            log("done marker \(marker.path)")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                NSApp.terminate(nil)
            }
        }
    }
    #endif
}
#endif
