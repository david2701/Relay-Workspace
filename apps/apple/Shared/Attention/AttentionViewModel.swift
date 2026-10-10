import Foundation
import Combine
import RelayKit

@MainActor
public final class AttentionViewModel: ObservableObject {
    public enum LoadState: Equatable {
        case loading
        case ready
        case empty
        case offline
        case error(String)
    }

    @Published public private(set) var loadState: LoadState = .loading
    @Published public private(set) var inbox: InboxQueryResult?
    @Published public private(set) var agentsById: [String: Agent] = [:]
    @Published public private(set) var lastSuccessAt: Date?
    @Published public private(set) var isOffline: Bool = false
    @Published public var selectedItemId: String?
    @Published public var decisionDraft: String = ""
    @Published public var quickCaptureText: String = ""
    @Published public var baseURLString: String
    @Published public var pendingSyncItemIds: Set<String> = []
    @Published public var actionError: String?

    private var client: RelayClient
    private let platform: AttentionPlatform

    public init(
        baseURLString: String = RelayDefaults.apiBaseURLString,
        platform: AttentionPlatform
    ) {
        self.baseURLString = baseURLString
        self.platform = platform
        if let client = try? RelayClient.make(baseURLString: baseURLString) {
            self.client = client
        } else {
            self.client = RelayClient.localDefault()
        }
    }

    public var sections: [AttentionSection] {
        guard let inbox else { return [] }
        return AttentionPresentation.nonEmptySections(from: inbox)
    }

    public var itemIds: [String] {
        guard let inbox else { return [] }
        return AttentionPresentation.flattenedItemIds(from: inbox)
    }

    public var selectedItem: WorkItem? {
        guard let inbox, let selectedItemId else { return nil }
        return AttentionPresentation.item(id: selectedItemId, in: inbox)
    }

    public var syncSubtitle: String {
        RelativeTimeFormat.formatSyncSubtitle(
            isOffline: isOffline,
            lastSuccessAt: lastSuccessAt
        )
    }

    public var emptyBody: String {
        let count = inbox.map { AttentionPresentation.teamActiveCount(from: $0) } ?? 0
        return AttentionStrings.emptyBody(activeItemCount: count, platform: platform)
    }

    public var needsYouCount: Int {
        inbox?.counters.needsYou ?? 0
    }

    public func applyBaseURL(_ value: String) {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        baseURLString = trimmed
        UserDefaults.standard.set(trimmed, forKey: RelayDefaults.apiBaseURLPreferenceKey)
        if let client = try? RelayClient.make(baseURLString: trimmed) {
            self.client = client
        }
        Task { await refresh() }
    }

    public func bootstrap() {
        if let saved = UserDefaults.standard.string(forKey: RelayDefaults.apiBaseURLPreferenceKey),
           !saved.isEmpty {
            baseURLString = saved
            if let client = try? RelayClient.make(baseURLString: saved) {
                self.client = client
            }
        }
        Task { await refresh() }
    }

    public func refresh() async {
        let previousInbox = inbox
        if previousInbox == nil {
            loadState = .loading
        }
        do {
            async let inboxTask = client.fetchAttention()
            async let agentsTask = client.fetchAgents()
            let fetchedInbox = try await inboxTask
            let agents = try await agentsTask
            inbox = fetchedInbox
            agentsById = Dictionary(uniqueKeysWithValues: agents.map { ($0.id, $0) })
            lastSuccessAt = Date()
            isOffline = false
            actionError = nil
            if AttentionPresentation.isEmpty(fetchedInbox) {
                loadState = .empty
                selectedItemId = nil
            } else {
                loadState = .ready
                if selectedItemId == nil || AttentionPresentation.item(id: selectedItemId ?? "", in: fetchedInbox) == nil {
                    selectedItemId = AttentionPresentation.flattenedItemIds(from: fetchedInbox).first
                }
            }
        } catch {
            isOffline = true
            if let previousInbox {
                inbox = previousInbox
                loadState = AttentionPresentation.isEmpty(previousInbox) ? .empty : .offline
            } else {
                loadState = .error(Self.describe(error))
            }
        }
    }

    public func selectItem(id: String?) {
        selectedItemId = id
        decisionDraft = ""
    }

    public func moveSelection(delta: Int) {
        let next = AttentionPresentation.neighborId(of: selectedItemId, in: itemIds, delta: delta)
        selectedItemId = next
    }

    public func createQuickItem() async {
        let title = quickCaptureText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        do {
            _ = try await client.createItem(title: title)
            quickCaptureText = ""
            await refresh()
        } catch {
            if isTransport(error) {
                isOffline = true
                loadState = inbox == nil ? .error(Self.describe(error)) : .offline
            } else {
                actionError = Self.describe(error)
            }
        }
    }

    public func returnToAgent() async {
        guard let item = selectedItem else { return }
        do {
            _ = try await client.setStatus(id: item.id, status: .assigned)
            decisionDraft = ""
            pendingSyncItemIds.remove(item.id)
            await refresh()
        } catch {
            handleActionFailure(error, itemId: item.id)
        }
    }

    public func takeMyself() async {
        guard let item = selectedItem else { return }
        do {
            _ = try await client.assignToHuman(id: item.id)
            _ = try await client.setStatus(id: item.id, status: .inProgress)
            decisionDraft = ""
            pendingSyncItemIds.remove(item.id)
            await refresh()
        } catch {
            handleActionFailure(error, itemId: item.id)
        }
    }

    public func completeSelected() async {
        guard let item = selectedItem else { return }
        do {
            _ = try await client.complete(id: item.id)
            await refresh()
        } catch {
            handleActionFailure(error, itemId: item.id)
        }
    }

    private func handleActionFailure(_ error: Error, itemId: String) {
        if isTransport(error) {
            pendingSyncItemIds.insert(itemId)
            isOffline = true
            loadState = .offline
        } else {
            actionError = Self.describe(error)
        }
    }

    private func isTransport(_ error: Error) -> Bool {
        if let api = error as? RelayAPIError {
            switch api {
            case .transport: return true
            default: return false
            }
        }
        return true
    }

    private static func describe(_ error: Error) -> String {
        if let api = error as? RelayAPIError {
            switch api {
            case .invalidURL(let value): return "URL inválida: \(value)"
            case .httpStatus(let code, let body): return "HTTP \(code): \(body)"
            case .decoding(let message): return "Decodificación: \(message)"
            case .transport(let message): return message
            }
        }
        return String(describing: error)
    }
}
