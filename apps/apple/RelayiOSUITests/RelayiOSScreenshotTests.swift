import XCTest

/// UI screenshots for RelayiOS Atención (DEBUG Penpot samples via `-RelayUIScreenshots`).
final class RelayiOSScreenshotTests: XCTestCase {
    func testCaptureAttentionScreens() throws {
        try captureList(appearance: "light", named: "iphone-attention-light")
        try captureList(appearance: "dark", named: "iphone-attention-dark")
        try captureDetail(appearance: "light", named: "iphone-attention-detail-light")
    }

    private func captureList(appearance: String, named name: String) throws {
        let app = launchApp(appearance: appearance)
        let title = app.staticTexts["attention-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 20))
        XCTAssertTrue(app.otherElements["attention-list"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["attention-item-itm_32pxnq1110"].waitForExistence(timeout: 10))
        try saveScreenshot(named: name)
        app.terminate()
    }

    private func captureDetail(appearance: String, named name: String) throws {
        let app = launchApp(appearance: appearance)
        let firstItem = app.buttons["attention-item-itm_32pxnq1110"]
        XCTAssertTrue(firstItem.waitForExistence(timeout: 20))
        firstItem.tap()
        XCTAssertTrue(app.otherElements["attention-detail"].waitForExistence(timeout: 10))
        try saveScreenshot(named: name)
        app.terminate()
    }

    private func launchApp(appearance: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "-RelayUIScreenshots",
            "-RelayAppearance", appearance,
        ]
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
