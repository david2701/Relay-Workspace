import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// HTTP client for the Relay Hono API (`/api/*` on the local server).
/// Uses `URLSession` + async/await. Base URL is injectable (no secrets in source).
/// Prefer Keychain only when credentials are stored; a bare local URL preference is fine.
///
/// Marked `@unchecked Sendable`: `URLSession` is thread-safe for data tasks; we never
/// mutate `baseURL` after init. Required for Swift 5.10 on Linux where Foundation types
/// are not yet `Sendable`.
public final class RelayClient: @unchecked Sendable {
    public let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    /// Convenience for the default local server bind.
    public static func localDefault(session: URLSession = .shared) -> RelayClient {
        guard let url = URL(string: RelayDefaults.apiBaseURLString) else {
            preconditionFailure("Static local URL must parse")
        }
        return RelayClient(baseURL: url, session: session)
    }

    public static func make(baseURLString: String, session: URLSession = .shared) throws -> RelayClient {
        guard let url = URL(string: baseURLString), url.scheme != nil else {
            throw RelayAPIError.invalidURL(baseURLString)
        }
        return RelayClient(baseURL: url, session: session)
    }

    public func health() async throws -> HealthResponse {
        try await get(path: "/api/health")
    }

    public func fetchAttention() async throws -> InboxQueryResult {
        try await fetchInbox(view: .attention)
    }

    public func fetchInbox(view: InboxView) async throws -> InboxQueryResult {
        try await get(path: "/api/inbox", query: ["view": view.rawValue])
    }

    public func fetchItem(id: String) async throws -> WorkItem {
        let envelope: ItemEnvelope = try await get(path: "/api/items/\(id)")
        return envelope.item
    }

    public func fetchItems() async throws -> [WorkItem] {
        let envelope: ItemsEnvelope = try await get(path: "/api/items")
        return envelope.items
    }

    public func fetchAgents() async throws -> [Agent] {
        let envelope: AgentsEnvelope = try await get(path: "/api/agents")
        return envelope.agents
    }

    public func createItem(title: String) async throws -> WorkItem {
        let body = CreateItemBody(title: title)
        let envelope: ItemEnvelope = try await send(
            path: "/api/items",
            method: "POST",
            body: body
        )
        return envelope.item
    }

    public func setStatus(id: String, status: Status) async throws -> WorkItem {
        let body = SetStatusBody(status: status)
        let envelope: ItemEnvelope = try await send(
            path: "/api/items/\(id)/status",
            method: "POST",
            body: body
        )
        return envelope.item
    }

    public func assignToHuman(id: String) async throws -> WorkItem {
        let body = AssignMeBody(
            assigneeType: .user,
            assigneeId: RelayDefaults.humanActorId
        )
        let envelope: ItemEnvelope = try await send(
            path: "/api/items/\(id)",
            method: "PATCH",
            body: body
        )
        return envelope.item
    }

    public func complete(id: String) async throws -> WorkItem {
        let envelope: ItemEnvelope = try await send(
            path: "/api/items/\(id)/complete",
            method: "POST",
            body: EmptyBody()
        )
        return envelope.item
    }

    /// Decode a type from raw Data (used by tests with fixtures).
    public func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw RelayAPIError.decoding(String(describing: error))
        }
    }

    private func get<T: Decodable>(
        path: String,
        query: [String: String] = [:]
    ) async throws -> T {
        let url = try makeURL(path: path, query: query)
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return try await execute(request)
    }

    private func send<Body: Encodable, T: Decodable>(
        path: String,
        method: String,
        body: Body
    ) async throws -> T {
        let url = try makeURL(path: path, query: [:])
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        return try await execute(request)
    }

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await perform(request)
        guard let http = response as? HTTPURLResponse else {
            throw RelayAPIError.transport("Non-HTTP response")
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw RelayAPIError.httpStatus(http.statusCode, body: body)
        }
        return try decode(T.self, from: data)
    }

    private func makeURL(path: String, query: [String: String]) throws -> URL {
        guard var components = URLComponents(
            url: baseURL,
            resolvingAgainstBaseURL: false
        ) else {
            throw RelayAPIError.invalidURL(baseURL.absoluteString)
        }
        let basePath = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let apiPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if basePath.isEmpty {
            components.path = "/\(apiPath)"
        } else {
            components.path = "/\(basePath)/\(apiPath)"
        }
        if !query.isEmpty {
            components.queryItems = query
                .map { URLQueryItem(name: $0.key, value: $0.value) }
                .sorted { $0.name < $1.name }
        }
        guard let url = components.url else {
            throw RelayAPIError.invalidURL(path)
        }
        return url
    }

    /// `URLSession.data(for:)` is unavailable on Linux FoundationNetworking;
    /// use the completion-handler API via a continuation on every platform.
    private func perform(_ request: URLRequest) async throws -> (Data, URLResponse) {
        try await withCheckedThrowingContinuation { continuation in
            let task = session.dataTask(with: request) { data, response, error in
                if let error {
                    continuation.resume(throwing: RelayAPIError.transport(String(describing: error)))
                    return
                }
                guard let data, let response else {
                    continuation.resume(throwing: RelayAPIError.transport("Empty response"))
                    return
                }
                continuation.resume(returning: (data, response))
            }
            task.resume()
        }
    }
}

private struct EmptyBody: Encodable {}

private struct CreateItemBody: Encodable {
    let title: String
}

private struct SetStatusBody: Encodable {
    let status: Status
}

private struct AssignMeBody: Encodable {
    let assigneeType: AssigneeType
    let assigneeId: String

    enum CodingKeys: String, CodingKey {
        case assigneeType = "assignee_type"
        case assigneeId = "assignee_id"
    }
}
