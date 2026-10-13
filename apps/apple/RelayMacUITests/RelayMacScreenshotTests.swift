import XCTest

/// UI screenshots for RelayMac Atención (DEBUG Penpot samples via `-RelayUIScreenshots`).
final class RelayMacScreenshotTests: XCTestCase {
    private let sampleItemId = "attention-item-itm_32pxnq1110"
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
        app.launch()
        app.activate()
        XCTAssertTrue(waitForAttentionShell(in: app), "Atención shell missing for \(name)")
        _ = waitForSampleRow(in: app, timeout: 12)
        if app.windows.firstMatch.waitForExistence(timeout: 5) {
            app.windows.firstMatch.click()
        }
        RunLoop.current.run(until: Date().addingTimeInterval(1.0))
        try saveScreenshot(named: name)
        app.terminate()
    }

    private func sampleRow(in app: XCUIApplication) -> XCUIElement {
        let byId = app.descendants(matching: .any)[sampleItemId]
        if byId.exists { return byId }
        return app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@ OR identifier == %@", sampleTitle, sampleItemId)
        ).firstMatch
    }

    private func waitForAttentionShell(in app: XCUIApplication, timeout: TimeInterval = 30) -> Bool {
        app.staticTexts["Atención"].waitForExistence(timeout: timeout)
            || app.descendants(matching: .any)["attention-title"].waitForExistence(timeout: 2)
    }

    private func waitForSampleRow(in app: XCUIApplication, timeout: TimeInterval = 30) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if sampleRow(in: app).waitForExistence(timeout: 1.0) {
                return true
            }
        }
        return sampleRow(in: app).exists
    }

    private func saveScreenshot(named name: String) throws {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        let data = screenshot.pngRepresentation
        for directory in screenshotDirectories() {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try data.write(to: directory.appendingPathComponent("\(name).png"))
        }
    }

    private func screenshotDirectories() -> [URL] {
        var dirs: [URL] = [
            URL(fileURLWithPath: "/tmp/relay-apple-screenshots", isDirectory: true),
        ]
        if let raw = ProcessInfo.processInfo.environment["RELAY_SCREENSHOT_DIR"], !raw.isEmpty {
            dirs.insert(URL(fileURLWithPath: raw, isDirectory: true), at: 0)
        }
        return dirs
    }
}
