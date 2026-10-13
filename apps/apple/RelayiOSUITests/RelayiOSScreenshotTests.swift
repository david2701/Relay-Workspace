import XCTest

/// UI screenshots for RelayiOS Atención (DEBUG Penpot samples via `-RelayUIScreenshots`).
final class RelayiOSScreenshotTests: XCTestCase {
    private let sampleTitle = "Elegir el titular del post de lanzamiento"

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testCaptureAttentionScreens() throws {
        try captureList(appearance: "light", named: "iphone-attention-light")
        try captureList(appearance: "dark", named: "iphone-attention-dark")
        try captureDetail(appearance: "light", named: "iphone-attention-detail-light")
    }

    private func captureList(appearance: String, named name: String) throws {
        let app = launchApp(appearance: appearance, screen: "list")
        let row = app.staticTexts[sampleTitle]
        XCTAssertTrue(row.waitForExistence(timeout: 30), "Sample list row missing for \(name)")
        try saveScreenshot(named: name)
        app.terminate()
    }

    private func captureDetail(appearance: String, named name: String) throws {
        let app = launchApp(appearance: appearance, screen: "detail")
        // Detail opens via launch arg; fall back to tapping the sample row.
        let detailTitle = app.staticTexts[sampleTitle]
        if !detailTitle.waitForExistence(timeout: 8) {
            let row = app.descendants(matching: .any)["attention-item-itm_32pxnq1110"]
            if row.waitForExistence(timeout: 10) {
                row.tap()
            } else {
                app.staticTexts[sampleTitle].tap()
            }
        }
        XCTAssertTrue(detailTitle.waitForExistence(timeout: 20), "Sample detail missing for \(name)")
        try saveScreenshot(named: name)
        app.terminate()
    }

    private func launchApp(appearance: String, screen: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "-RelayUIScreenshots",
            "-RelayAppearance", appearance,
            "-RelayScreenshotScreen", screen,
        ]
        app.launchEnvironment["RELAY_UI_SCREENSHOTS"] = "1"
        app.launchEnvironment["RELAY_SCREENSHOT_SCREEN"] = screen
        if let dir = ProcessInfo.processInfo.environment["RELAY_SCREENSHOT_DIR"] {
            app.launchEnvironment["RELAY_SCREENSHOT_DIR"] = dir
        }
        app.launch()
        return app
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
