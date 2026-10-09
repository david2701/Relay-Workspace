import Foundation

/// Non-secret defaults for native clients.
/// The API base URL is a preference (UserDefaults / Settings), not a vault secret.
public enum RelayDefaults {
    public static let apiBaseURLString = "http://localhost:7420"
    public static let apiBaseURLPreferenceKey = "relay.apiBaseURL"
    /// Human actor mark used in Atención mockups (circle monogram).
    public static let humanMonogram = "É"
    public static let humanDisplayName = "Tú"
    public static let humanActorId = "user"
}
