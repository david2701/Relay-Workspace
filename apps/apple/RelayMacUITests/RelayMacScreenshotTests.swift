import XCTest

/// UI screenshots for RelayMac Atención (DEBUG Penpot samples via `-RelayUIScreenshots`).
final class RelayMacScreenshotTests: XCTestCase {
    func testCaptureAttentionScreens() throws {
        try capture(appearance: "light", named: "mac-attention-light")
        try capture(appearance: "dark", named: "mac-attention-dark")
    }

    private func capture(appearance: String, named name: String) throws {
        let app = XCUIApplication()
        app.launchArguments = [
            "-RelayUIScreenshots",
            "-RelayAppearance", appearance,
        ]
        app.launch()
        let title = app.staticTexts["attention-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 20))
        XCTAssertTrue(app.otherElements["attention-list"].waitForExistence(timeout: 10))
        let firstItem = app.buttons["attention-item-itm_32pxnq1110"]
        XCTAssertTrue(firstItem.waitForExistence(timeout: 10))
        firstItem.tap()
        XCTAssertTrue(app.otherElements["attention-detail"].waitForExistence(timeout: 10))
        // Let the split view settle before capturing.
        RunLoop.current.run(until: Date().addingTimeInterval(0.5))
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
