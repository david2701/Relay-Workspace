import SwiftUI
import RelayKit

struct AttentionListContent: View {
    @ObservedObject var viewModel: AttentionViewModel
    var expandNeedsYouInline: Bool
    var showsKeyboardHints: Bool
    var onOpenDetail: ((WorkItem) -> Void)?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                if viewModel.loadState == .offline {
                    OfflineBannerView {
                        Task { await viewModel.refresh() }
                    }
                    .padding(.horizontal, 4)
                }
                ForEach(viewModel.sections) { section in
                    sectionBlock(section)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
    }

    @ViewBuilder
    private func sectionBlock(_ section: AttentionSection) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(AttentionStrings.sectionTitle(for: section.key)) \(section.items.count)")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(RelayTheme.inkMuted)
                .padding(.horizontal, 4)
            ForEach(section.items) { item in
                AttentionItemRow(
                    item: item,
                    isSelected: viewModel.selectedItemId == item.id,
                    agentsById: viewModel.agentsById,
                    showsExpandedActions: expandNeedsYouInline,
                    hasPendingSync: viewModel.pendingSyncItemIds.contains(item.id),
                    decisionDraft: $viewModel.decisionDraft,
                    onSelect: {
                        viewModel.selectItem(id: item.id)
                        if let onOpenDetail {
                            onOpenDetail(item)
                        }
                    },
                    onReturn: {
                        Task { await viewModel.returnToAgent() }
                    },
                    onTakeMyself: {
                        Task { await viewModel.takeMyself() }
                    },
                    showsKeyboardHints: showsKeyboardHints && viewModel.selectedItemId == item.id
                )
            }
        }
    }
}
