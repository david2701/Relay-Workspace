import XCTest

/// UI screenshots for RelayMac Atención (DEBUG Penpot samples via `-RelayUIScreenshots`).
final class RelayMacScreenshotTests: XCTestCase {
    private let sampleTitle = "Elegir el titular del post de lanzamiento"

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testCaptureAttentionScreens() throws {
        try capture(appearance: "light", named: "mac-attention-light")
        try capture(appearance: "dark", named: "mac-attention-dark")
    }

    private func capture(appearance: String, named name: String) throws {
        let app = XCUIApplication()
        app.launchArguments = [
            "-RelayUIScreenshots",
            "-RelayAppearance", appearance,
            "-RelayScreenshotScreen", "list",
        ]
        app.launchEnvironment["RELAY_UI_SCREENSHOTS"] = "1"
        if let dir = ProcessInfo.processInfo.environment["RELAY_SCREENSHOT_DIR"] {
            app.launchEnvironment["RELAY_SCREENSHOT_DIR"] = dir
        }
        app.launch()
        let row = app.staticTexts[sampleTitle]
        XCTAssertTrue(row.waitForExistence(timeout: 30), "Sample Mac row missing for \(name)")
        // Ensure detail column is populated (split view selects first item in samples).
        RunLoop.current.run(until: Date().addingTimeInterval(0.8))
        try saveScreenshot(named: name)
        app.terminate()
    }

    private func saveScreenshot(named name: String) throws {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        let directory = screenshotDirectoryURL()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let fileURL = directory.appendingPathComponent("\(name).png")
        try screenshot.pngRepresentation.write(to: fileURL)
        XCTAssertTrue(FileManager.default.fileExists(atPath: fileURL.path), "Missing \(fileURL.path)")
    }

    private func screenshotDirectoryURL() -> URL {
        if let raw = ProcessInfo.processInfo.environment["RELAY_SCREENSHOT_DIR"], !raw.isEmpty {
            return URL(fileURLWithPath: raw, isDirectory: true)
        }
        return URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
            .appendingPathComponent("apple-screenshots", isDirectory: true)
    }
}
