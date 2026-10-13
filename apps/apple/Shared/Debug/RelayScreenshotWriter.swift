import Foundation
import SwiftUI

#if DEBUG
#if canImport(AppKit)
import AppKit
import CoreGraphics
#endif
#if canImport(UIKit)
import UIKit
#endif

/// Writes PNG screenshots from inside the DEBUG app (no Accessibility TCC needed on CI).
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
    static func captureMacWindow(named name: String) {
        NSApp.activate(ignoringOtherApps: true)
        guard let window = NSApp.windows.first(where: { $0.isVisible }) ?? NSApp.windows.first else {
            NSLog("RelayScreenshotWriter: no Mac window for \(name)")
            return
        }
        window.makeKeyAndOrderFront(nil)
        let windowID = CGWindowID(window.windowNumber)
        let image: CGImage?
        if #available(macOS 14.0, *) {
            image = CGWindowListCreateImage(
                .null,
                .optionIncludingWindow,
                windowID,
                [.boundsIgnoreFraming, .bestResolution]
            )
        } else {
            image = CGWindowListCreateImage(
                .null,
                .optionIncludingWindow,
                windowID,
                [.boundsIgnoreFraming, .bestResolution]
            )
        }
        guard let cgImage = image else {
            NSLog("RelayScreenshotWriter: CGWindowListCreateImage failed for \(name)")
            return
        }
        let rep = NSBitmapImageRep(cgImage: cgImage)
        guard let data = rep.representation(using: .png, properties: [:]) else {
            NSLog("RelayScreenshotWriter: PNG encode failed for \(name)")
            return
        }
        writePNG(named: name, data: data)
    }
    #endif

    @MainActor
    static func scheduleMacCapturesIfNeeded() {
        #if canImport(AppKit)
        guard PenpotSampleData.shouldLoadForUIScreenshots else { return }
        let appearance: String
        switch RelayScreenshotAppearance.preferredColorScheme {
        case .dark: appearance = "dark"
        default: appearance = "light"
        }
        let name = "mac-attention-\(appearance)"
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
            captureMacWindow(named: name)
            // Signal completion for the capture script.
            let marker = URL(fileURLWithPath: "/tmp/relay-apple-screenshots/\(name).done")
            try? FileManager.default.createDirectory(
                at: marker.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try? Data().write(to: marker)
        }
        #endif
    }
}
#endif
