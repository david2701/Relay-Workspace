import Foundation

public enum RelayAPIError: Error, Sendable, Equatable {
    case invalidURL(String)
    case httpStatus(Int, body: String)
    case decoding(String)
    case transport(String)
}
