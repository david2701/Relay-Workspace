import Foundation
import SwiftUI

#if DEBUG
#if canImport(AppKit)
import AppKit
#endif

/// Writes PNG screenshots from inside the DEBUG app.
/// Mac uses NSHostingView bitmap capture — ImageRenderer + NavigationSplitView
/// produces garbage (system yellow/red) on headless CI.
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
        let scheme = colorScheme ?? .light
        RelayScreenshotPalette.forceDark = (scheme == .dark)

        let previousAppearance = NSApp.appearance
        switch scheme {
        case .dark:
            NSApp.appearance = NSAppearance(named: .darkAqua)
        default:
            NSApp.appearance = NSAppearance(named: .aqua)
        }
        defer { NSApp.appearance = previousAppearance }

        let rooted = content
            .environment(\.colorScheme, scheme)
            .preferredColorScheme(scheme)
            .frame(width: size.width, height: size.height)
            .background(RelayTheme.paper)

        // Off-screen hosting view — reliable for ScrollView / split layouts on CI.
        let hosting = NSHostingView(rootView: rooted)
        hosting.appearance = NSApp.appearance
        hosting.frame = CGRect(origin: .zero, size: size)
        // Attach briefly so AppKit finishes layout before rasterizing.
        let window = NSWindow(
            contentRect: CGRect(origin: .zero, size: size),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        window.isReleasedWhenClosed = false
        window.contentView = hosting
        window.orderOut(nil)
        hosting.layoutSubtreeIfNeeded()

        let bounds = hosting.bounds
        guard let rep = hosting.bitmapImageRepForCachingDisplay(in: bounds) else {
            log("bitmapImageRep unavailable for \(name)")
            window.contentView = nil
            window.close()
            return
        }
        hosting.cacheDisplay(in: bounds, to: rep)
        window.contentView = nil
        window.close()

        guard let data = rep.representation(using: .png, properties: [:]) else {
            log("PNG encode failed for \(name)")
            return
        }
        log(
            "captured \(name) scheme=\(scheme == .dark ? "dark" : "light") "
                + "forceDark=\(String(describing: RelayScreenshotPalette.forceDark)) "
                + "bytes=\(data.count)"
        )
        writePNG(named: name, data: data)
    }

    /// Flat HStack canvas — avoids NavigationSplitView, which ImageRenderer/hosting
    /// often rasterizes as system yellow/red garbage on headless runners.
    @MainActor
    private static func listCanvas(viewModel: AttentionViewModel) -> some View {
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                MacAttentionHeader(viewModel: viewModel)
                AttentionListContent(
                    viewModel: viewModel,
                    expandNeedsYouInline: true,
                    showsKeyboardHints: true,
                    eagerLayout: true
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                QuickCaptureField(
                    text: Binding(
                        get: { viewModel.quickCaptureText },
                        set: { viewModel.quickCaptureText = $0 }
                    ),
                    placeholder: AttentionStrings.capturePlaceholder,
                    showsShortcutBadge: true,
                    onSubmit: {}
                )
                .padding(12)
            }
            .frame(width: 420)
            .background(RelayTheme.paper)

            Rectangle()
                .fill(RelayTheme.line)
                .frame(width: 1)

            Group {
                if let item = viewModel.selectedItem {
                    AttentionDetailView(
                        item: item,
                        agentsById: viewModel.agentsById,
                        decisionDraft: Binding(
                            get: { viewModel.decisionDraft },
                            set: { viewModel.decisionDraft = $0 }
                        ),
                        onReturn: {},
                        onTakeMyself: {},
                        showsPhoneActions: false,
                        eagerLayout: true
                    )
                } else {
                    AttentionDetailPlaceholder()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(RelayTheme.paper)
        }
        .background(RelayTheme.paper)
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
        let scheme = RelayScreenshotAppearance.preferredColorScheme ?? .light
        log("scheduling \(name) screen=\(screen) appearance=\(appearance)")
        RelayScreenshotPalette.forceDark = (appearance == "dark")
        log("palette forceDark=\(String(describing: RelayScreenshotPalette.forceDark))")

        viewModel.bootstrap()
        if viewModel.selectedItemId == nil, let first = viewModel.itemIds.first {
            viewModel.selectItem(id: first)
        }
        log(
            "viewModel loadState=\(String(describing: viewModel.loadState)) "
                + "items=\(viewModel.itemIds.count) selected=\(viewModel.selectedItemId ?? "nil")"
        )

        // Short delay so hosting view layout settles on CI.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            NSApp.activate(ignoringOtherApps: true)
            if screen == "detail" {
                guard let item = viewModel.selectedItem else {
                    log("no selected item for detail capture")
                    NSApp.terminate(nil)
                    return
                }
                // Non-scrolling stack so text rasterizes fully off-screen.
                let detail = AttentionDetailView(
                    item: item,
                    agentsById: viewModel.agentsById,
                    decisionDraft: Binding(
                        get: { viewModel.decisionDraft },
                        set: { viewModel.decisionDraft = $0 }
                    ),
                    onReturn: {},
                    onTakeMyself: {},
                    showsPhoneActions: false,
                    eagerLayout: true
                )
                .preferredColorScheme(scheme)
                captureMacView(
                    named: name,
                    size: CGSize(width: 720, height: 760),
                    colorScheme: scheme,
                    content: detail
                )
            } else {
                captureMacView(
                    named: name,
                    size: CGSize(width: 1180, height: 760),
                    colorScheme: scheme,
                    content: listCanvas(viewModel: viewModel).preferredColorScheme(scheme)
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
