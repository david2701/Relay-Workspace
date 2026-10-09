import Foundation

public enum ISO8601Parsing {
    private static let withFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let withoutFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    public static func date(from iso: String) -> Date? {
        if let date = withFractional.date(from: iso) {
            return date
        }
        return withoutFractional.date(from: iso)
    }
}
