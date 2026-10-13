import XCTest

/// UI screenshots for RelayiOS Atención (DEBUG Penpot samples via `-RelayUIScreenshots`).
final class RelayiOSScreenshotTests: XCTestCase {
    private let sampleItemId = "attention-item-itm_32pxnq1110"
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
        XCTAssertTrue(waitForSampleRow(in: app), "Sample list row missing for \(name)")
        try saveScreenshot(named: name)
        app.terminate()
    }

    private func captureDetail(appearance: String, named name: String) throws {
        let app = launchApp(appearance: appearance, screen: "detail")
        if !waitForSampleRow(in: app, timeout: 8) {
            XCTFail("Sample detail content missing for \(name)")
            return
        }
        // If still on the list (auto-push failed), tap the sample row.
        let detail = app.descendants(matching: .any)["attention-detail"]
        if !detail.exists {
            sampleRow(in: app).tap()
            _ = detail.waitForExistence(timeout: 10)
        }
        try saveScreenshot(named: name)
        app.terminate()
    }

    private func sampleRow(in app: XCUIApplication) -> XCUIElement {
        let byId = app.descendants(matching: .any)[sampleItemId]
        if byId.exists { return byId }
        let byButton = app.buttons.matching(
            NSPredicate(format: "label CONTAINS %@", sampleTitle)
        ).firstMatch
        if byButton.exists { return byButton }
        return app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@ OR identifier == %@", sampleTitle, sampleItemId)
        ).firstMatch
    }

    private func waitForSampleRow(in app: XCUIApplication, timeout: TimeInterval = 30) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            let row = sampleRow(in: app)
            if row.waitForExistence(timeout: 1.5) {
                return true
            }
            // Title alone proves the shell rendered; keep polling for sample data.
            _ = app.staticTexts["Atención"].waitForExistence(timeout: 0.2)
        }
        return sampleRow(in: app).exists
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
