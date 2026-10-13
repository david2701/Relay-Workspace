import XCTest

/// UI screenshots for RelayMac Atención (DEBUG Penpot samples via `-RelayUIScreenshots`).
/// Matrix: Attention light/dark + detail light (asserted via `attention-detail`).
final class RelayMacScreenshotTests: XCTestCase {
    private let sampleItemId = "attention-item-itm_32pxnq1110"
    private let sampleTitle = "Elegir el titular del post de lanzamiento"

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testCaptureAttentionScreens() throws {
        try captureList(appearance: "light", named: "mac-attention-light")
        try captureList(appearance: "dark", named: "mac-attention-dark")
        try captureDetail(appearance: "light", named: "mac-attention-detail-light")
    }

    private func captureList(appearance: String, named name: String) throws {
        let app = launchApp(appearance: appearance, screen: "list")
        XCTAssertTrue(waitForAttentionShell(in: app), "Atención shell missing for \(name)")
        XCTAssertTrue(waitForSampleRow(in: app, timeout: 12), "Sample row missing for \(name)")
        focusWindow(in: app)
        try saveScreenshot(named: name)
        app.terminate()
    }

    private func captureDetail(appearance: String, named name: String) throws {
        let app = launchApp(appearance: appearance, screen: "detail")
        XCTAssertTrue(waitForAttentionShell(in: app), "Atención shell missing for \(name)")
        let detail = app.descendants(matching: .any)["attention-detail"]
        if !detail.waitForExistence(timeout: 8) {
            XCTAssertTrue(waitForSampleRow(in: app, timeout: 8), "Sample row missing for \(name)")
            sampleRow(in: app).click()
            XCTAssertTrue(detail.waitForExistence(timeout: 8), "Detail missing for \(name)")
        }
        focusWindow(in: app)
        try saveScreenshot(named: name)
        app.terminate()
    }

    private func focusWindow(in app: XCUIApplication) {
        if app.windows.firstMatch.waitForExistence(timeout: 5) {
            app.windows.firstMatch.click()
        }
        RunLoop.current.run(until: Date().addingTimeInterval(0.8))
    }

    private func sampleRow(in app: XCUIApplication) -> XCUIElement {
        let byId = app.descendants(matching: .any)[sampleItemId]
        if byId.exists { return byId }
        return app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@ OR identifier == %@", sampleTitle, sampleItemId)
        ).firstMatch
    }

    private func waitForAttentionShell(in app: XCUIApplication, timeout: TimeInterval = 45) -> Bool {
        app.activate()
        if app.staticTexts["Atención"].waitForExistence(timeout: timeout) {
            return true
        }
        return app.descendants(matching: .any)["attention-title"].waitForExistence(timeout: 5)
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

    private func launchApp(appearance: String, screen: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "-RelayUIScreenshots",
            "-RelayAppearance", appearance,
            "-RelayScreenshotScreen", screen,
        ]
        app.launchEnvironment["RELAY_UI_SCREENSHOTS"] = "1"
        app.launchEnvironment["RELAY_SCREENSHOT_SCREEN"] = screen
        if let dir = ProcessInfo.processInfo.environment["RELAY_SCREENSHOT_DIR"], !dir.isEmpty {
            app.launchEnvironment["RELAY_SCREENSHOT_DIR"] = dir
        }
        app.launch()
        app.activate()
        return app
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
