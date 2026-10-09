package app.relay.ui.attention

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Notes
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.automirrored.outlined.Undo
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.BackHand
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.People
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.adaptive.ExperimentalMaterial3AdaptiveApi
import androidx.compose.material3.adaptive.layout.AnimatedPane
import androidx.compose.material3.adaptive.layout.PaneScaffoldDirective
import androidx.compose.material3.adaptive.layout.ListDetailPaneScaffoldRole
import androidx.compose.material3.adaptive.layout.PaneAdaptedValue
import androidx.compose.material3.adaptive.navigation.NavigableListDetailPaneScaffold
import androidx.compose.material3.adaptive.navigation.rememberListDetailPaneScaffoldNavigator
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteDefaults
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteItem
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteType
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.window.core.layout.WindowSizeClass
import app.relay.R
import app.relay.data.Agent
import app.relay.data.AttentionSectionKey
import app.relay.data.Status
import app.relay.data.WorkItem
import app.relay.theme.RelayDimens
import app.relay.theme.RelayThemeTokens
import app.relay.theme.selectedRowShadowLayers
import kotlinx.coroutines.launch

/** Medium single-pane list column max width (Penpot 600). */
private val MediumListMaxWidth = 488.dp

private enum class RelayDestination {
    Attention,
    Team,
    Notes,
}

@Composable
fun AttentionRoute(
    viewModel: AttentionViewModel,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    AttentionScreen(
        state = state,
        onRetry = viewModel::refresh,
        onSelectItem = viewModel::selectItem,
    )
}

/**
 * Adaptive Atención shell:
 * - Compact (&lt;600 dp): bottom bar + extended FAB; list/detail single-pane
 * - Medium (600–839): navigation rail + FAB in rail header; single pane, list max ~488 dp centered
 * - Expanded (≥840): rail + list-detail side by side (list ~360 dp)
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3AdaptiveApi::class)
@Composable
fun AttentionScreen(
    state: AttentionUiState,
    onRetry: () -> Unit,
    onSelectItem: (String?) -> Unit,
    modifier: Modifier = Modifier,
    listState: LazyListState = rememberLazyListState(),
) {
    val colors = RelayThemeTokens.colors
    val isDark = RelayThemeTokens.isDark
    // Prefer Configuration width so Robolectric qualifiers / tests drive the suite type.
    val widthDp = LocalConfiguration.current.screenWidthDp
    val navSuiteType = relayNavigationSuiteTypeForWidth(widthDp)
    val isExpandedWidth = widthDp >= WindowSizeClass.WIDTH_DP_EXPANDED_LOWER_BOUND
    val listDetailDirective = PaneScaffoldDirective.Default.copy(
        maxHorizontalPartitions = if (isExpandedWidth) 2 else 1,
        horizontalPartitionSpacerSize = 12.dp,
        defaultPanePreferredWidth = 360.dp,
    )
    val navigator = rememberListDetailPaneScaffoldNavigator<String>(
        scaffoldDirective = listDetailDirective,
    )
    val scope = rememberCoroutineScope()
    var currentDestination by rememberSaveable { mutableStateOf(RelayDestination.Attention) }
    val needsYouCount = when (state) {
        is AttentionUiState.Ready -> state.inbox.counters.needsYou
        else -> 0
    }
    val selectedId = (state as? AttentionUiState.Ready)?.selectedItemId
    val isListDetailVisible =
        navigator.scaffoldValue[ListDetailPaneScaffoldRole.List] == PaneAdaptedValue.Expanded &&
            navigator.scaffoldValue[ListDetailPaneScaffoldRole.Detail] == PaneAdaptedValue.Expanded
    LaunchedEffect(selectedId) {
        if (selectedId != null &&
            navigator.currentDestination?.contentKey != selectedId
        ) {
            navigator.navigateTo(ListDetailPaneScaffoldRole.Detail, selectedId)
        }
    }
    val canNavigateBack = navigator.canNavigateBack()
    BackHandler(enabled = canNavigateBack) {
        scope.launch {
            navigator.navigateBack()
            if (!isListDetailVisible) {
                onSelectItem(null)
            }
        }
    }
    val showingCompactDetail =
        !isListDetailVisible && selectedId != null &&
            navigator.currentDestination?.pane == ListDetailPaneScaffoldRole.Detail
    val effectiveNavSuiteType =
        if (showingCompactDetail) NavigationSuiteType.None else navSuiteType
        NavigationSuiteScaffold(
        modifier = modifier
            .fillMaxSize()
            .testTag("attention_screen"),
        navigationSuiteType = effectiveNavSuiteType,
        containerColor = colors.paper,
        contentColor = colors.ink,
        navigationSuiteColors = NavigationSuiteDefaults.colors(
            navigationBarContainerColor = colors.sunken,
            navigationRailContainerColor = colors.sunken,
            navigationDrawerContainerColor = colors.sunken,
        ),
        primaryActionContent = {
            if (!showingCompactDetail) {
                AttentionPrimaryFab(isExtended = navSuiteType == NavigationSuiteType.NavigationBar)
            }
        },
        navigationItems = {
            val itemColors = attentionNavItemColors()
            NavigationSuiteItem(
                selected = currentDestination == RelayDestination.Attention,
                onClick = { currentDestination = RelayDestination.Attention },
                icon = {
                    AttentionNavIcon(
                        selected = currentDestination == RelayDestination.Attention,
                        needsYouCount = needsYouCount,
                        isDark = isDark,
                    )
                },
                label = { Text(stringResource(R.string.nav_attention)) },
                colors = itemColors,
                modifier = Modifier.testTag("nav_item_attention"),
            )
            NavigationSuiteItem(
                selected = currentDestination == RelayDestination.Team,
                onClick = { currentDestination = RelayDestination.Team },
                icon = { Icon(Icons.Outlined.People, contentDescription = null) },
                label = { Text(stringResource(R.string.nav_team)) },
                modifier = Modifier.testTag("nav_item_team"),
            )
            NavigationSuiteItem(
                selected = currentDestination == RelayDestination.Notes,
                onClick = { currentDestination = RelayDestination.Notes },
                icon = { Icon(Icons.AutoMirrored.Outlined.Notes, contentDescription = null) },
                label = { Text(stringResource(R.string.nav_notes)) },
                modifier = Modifier.testTag("nav_item_notes"),
            )
        },
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            Box(
                modifier = Modifier
                    .size(1.dp)
                    .then(modifierForNavType(navSuiteType)),
            )
            when (currentDestination) {
            RelayDestination.Attention -> {
                NavigableListDetailPaneScaffold(
                    navigator = navigator,
                    modifier = Modifier
                        .fillMaxSize()
                        .testTag("attention_list_detail"),
                    listPane = {
                        AnimatedPane {
                            AttentionListPane(
                                state = state,
                                onRetry = onRetry,
                                listState = listState,
                                isDualPane = isListDetailVisible,
                                fabClearance = if (navSuiteType == NavigationSuiteType.NavigationBar) {
                                    RelayDimens.fabClearance
                                } else {
                                    16.dp
                                },
                                constrainListWidth = navSuiteType != NavigationSuiteType.NavigationBar &&
                                    !isListDetailVisible,
                                onOpenItem = { itemId ->
                                    onSelectItem(itemId)
                                    scope.launch {
                                        navigator.navigateTo(
                                            ListDetailPaneScaffoldRole.Detail,
                                            itemId,
                                        )
                                    }
                                },
                            )
                        }
                    },
                    detailPane = {
                        AnimatedPane {
                            val detailId = navigator.currentDestination?.contentKey
                                ?: selectedId
                            val detailItem = (state as? AttentionUiState.Ready)?.let { ready ->
                                ready.findItem(detailId)
                            }
                            val ready = state as? AttentionUiState.Ready
                            AttentionDetailPane(
                                item = detailItem,
                                agentsById = ready?.agentsById.orEmpty(),
                                nowMillis = ready?.presentationNowMillis
                                    ?: System.currentTimeMillis(),
                                showBack = showingCompactDetail || (!isListDetailVisible && detailItem != null),
                                onBack = {
                                    scope.launch {
                                        navigator.navigateBack()
                                        onSelectItem(null)
                                    }
                                },
                            )
                        }
                    },
                )
            }
            RelayDestination.Team -> DestinationPlaceholder(label = stringResource(R.string.nav_team))
            RelayDestination.Notes -> DestinationPlaceholder(label = stringResource(R.string.nav_notes))
            }
        }
    }
}

internal fun relayNavigationSuiteType(sizeClass: WindowSizeClass): NavigationSuiteType =
    relayNavigationSuiteTypeForWidth(sizeClass.minWidthDp)

internal fun relayNavigationSuiteTypeForWidth(widthDp: Int): NavigationSuiteType {
    return when {
        widthDp >= WindowSizeClass.WIDTH_DP_MEDIUM_LOWER_BOUND -> NavigationSuiteType.NavigationRail
        else -> NavigationSuiteType.NavigationBar
    }
}

private fun modifierForNavType(type: NavigationSuiteType): Modifier {
    val tag = when (type) {
        NavigationSuiteType.NavigationBar -> "nav_suite_bar"
        NavigationSuiteType.NavigationRail -> "nav_suite_rail"
        NavigationSuiteType.NavigationDrawer -> "nav_suite_drawer"
        else -> "nav_suite_other"
    }
    return Modifier.testTag(tag)
}

@Composable
private fun attentionNavItemColors(): androidx.compose.material3.NavigationItemColors {
    val colors = RelayThemeTokens.colors
    return androidx.compose.material3.ShortNavigationBarItemDefaults.colors(
        selectedIconColor = colors.onHl,
        selectedTextColor = colors.accentInk,
        selectedIndicatorColor = colors.hl,
        unselectedIconColor = colors.inkMuted,
        unselectedTextColor = colors.inkMuted,
    )
}

@Composable
private fun AttentionNavIcon(
    selected: Boolean,
    needsYouCount: Int,
    isDark: Boolean,
) {
    val colors = RelayThemeTokens.colors
    val icon = if (selected) Icons.Filled.Inbox else Icons.Outlined.Inbox
    // Dark selected: filled glyph + on-hl ink over hl pill (high contrast on OLED).
    val tint = when {
        selected -> colors.onHl
        isDark -> colors.ink2
        else -> colors.inkMuted
    }
    val badgeDesc = stringResource(R.string.cd_nav_attention_badge, needsYouCount)
    BadgedBox(
        badge = {
            if (needsYouCount > 0) {
                Badge(
                    containerColor = colors.hl,
                    contentColor = colors.onHl,
                    modifier = Modifier.testTag("nav_attention_badge"),
                ) {
                    Text(
                        text = needsYouCount.toString(),
                        modifier = Modifier.semantics { contentDescription = badgeDesc },
                    )
                }
            }
        },
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.testTag(
                if (selected) "nav_attention_icon_selected" else "nav_attention_icon",
            ),
        )
    }
}

@Composable
private fun AttentionPrimaryFab(isExtended: Boolean) {
    val colors = RelayThemeTokens.colors
    if (isExtended) {
        ExtendedFloatingActionButton(
            onClick = {},
            modifier = Modifier.testTag("attention_fab"),
            icon = {
                Icon(Icons.Outlined.Add, contentDescription = null, tint = colors.onHl)
            },
            text = {
                Text(
                    text = stringResource(R.string.fab_new_item),
                    color = colors.onHl,
                    fontWeight = FontWeight.SemiBold,
                )
            },
            containerColor = colors.hl,
            contentColor = colors.onHl,
            shape = RoundedCornerShape(16.dp),
        )
    } else {
        FloatingActionButton(
            onClick = {},
            modifier = Modifier.testTag("attention_fab"),
            containerColor = colors.hl,
            contentColor = colors.onHl,
            shape = RoundedCornerShape(16.dp),
        ) {
            Icon(
                Icons.Outlined.Add,
                contentDescription = stringResource(R.string.fab_new_item),
                tint = colors.onHl,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AttentionListPane(
    state: AttentionUiState,
    onRetry: () -> Unit,
    listState: LazyListState,
    isDualPane: Boolean,
    fabClearance: androidx.compose.ui.unit.Dp,
    constrainListWidth: Boolean,
    onOpenItem: (String) -> Unit,
) {
    val colors = RelayThemeTokens.colors
    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = colors.paper,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = stringResource(R.string.attention_title),
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Bold,
                            color = colors.ink,
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.testTag("attention_sync_line"),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.CloudDone,
                                contentDescription = null,
                                tint = colors.inkMuted,
                                modifier = Modifier.size(14.dp),
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = (state as? AttentionUiState.Ready)?.syncSubtitle
                                    ?: stringResource(R.string.sync_up_to_date),
                                style = MaterialTheme.typography.labelMedium,
                                color = colors.inkMuted,
                            )
                        }
                    }
                },
                actions = {
                    IconButton(onClick = {}) {
                        Icon(
                            Icons.Outlined.Search,
                            contentDescription = stringResource(R.string.search),
                        )
                    }
                    IconButton(onClick = {}) {
                        Icon(
                            Icons.Outlined.FilterList,
                            contentDescription = stringResource(R.string.filter),
                        )
                    }
                    Box(
                        modifier = Modifier
                            .padding(end = 12.dp)
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(colors.ink),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "É",
                            color = colors.paper,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = colors.paper,
                    titleContentColor = colors.ink,
                    actionIconContentColor = colors.ink,
                ),
            )
        },
    ) { innerPadding ->
        when (state) {
            AttentionUiState.Loading -> LoadingBody(innerPadding)
            is AttentionUiState.Error -> ErrorBody(
                message = state.message,
                onRetry = onRetry,
                padding = innerPadding,
            )
            is AttentionUiState.Ready -> {
                if (state.isEmpty) {
                    EmptyBody(padding = innerPadding)
                } else {
                    val listContent: @Composable () -> Unit = {
                        AttentionList(
                            state = state,
                            onSelectItem = onOpenItem,
                            scaffoldPadding = innerPadding,
                            listState = listState,
                            fabClearance = fabClearance,
                            condensed = isDualPane,
                        )
                    }
                    if (constrainListWidth) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(
                                    start = innerPadding.calculateStartPadding(LocalLayoutDirection.current),
                                    end = innerPadding.calculateEndPadding(LocalLayoutDirection.current),
                                ),
                            contentAlignment = Alignment.TopCenter,
                        ) {
                            Box(
                                modifier = Modifier
                                    .widthIn(max = MediumListMaxWidth)
                                    .fillMaxWidth()
                                    .fillMaxHeight()
                                    .testTag("attention_list_max_width"),
                            ) {
                                AttentionList(
                                    state = state,
                                    onSelectItem = onOpenItem,
                                    scaffoldPadding = PaddingValues(
                                        top = innerPadding.calculateTopPadding(),
                                        bottom = innerPadding.calculateBottomPadding(),
                                    ),
                                    listState = listState,
                                    fabClearance = fabClearance,
                                    condensed = isDualPane,
                                )
                            }
                        }
                    } else {
                        listContent()
                    }
                }
            }
        }
    }
}

@Composable
private fun DestinationPlaceholder(label: String) {
    val colors = RelayThemeTokens.colors
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = label, color = colors.inkMuted)
    }
}

@Composable
private fun LoadingBody(padding: PaddingValues) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(
            color = RelayThemeTokens.colors.accentInk,
            modifier = Modifier.semantics {
                contentDescription = "Cargando Atención"
            },
        )
    }
}

@Composable
private fun ErrorBody(
    message: String,
    onRetry: () -> Unit,
    padding: PaddingValues,
) {
    val colors = RelayThemeTokens.colors
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.error_title),
            style = MaterialTheme.typography.titleMedium,
            color = colors.ink,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = colors.inkMuted,
        )
        Spacer(modifier = Modifier.height(16.dp))
        TextButton(onClick = onRetry) {
            Text(
                text = stringResource(R.string.retry),
                color = colors.accentInk,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

@Composable
private fun EmptyBody(padding: PaddingValues) {
    val colors = RelayThemeTokens.colors
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .padding(24.dp)
            .testTag("attention_empty"),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.empty_title),
            style = MaterialTheme.typography.titleLarge,
            color = colors.ink,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.empty_body),
            style = MaterialTheme.typography.bodyMedium,
            color = colors.inkMuted,
        )
    }
}

/**
 * Scaffold [scaffoldPadding] already includes top bar + bottom nav / gesture insets.
 * Extra [fabClearance] is added only to LazyColumn contentPadding.bottom
 * so the last row clears the FAB without double-counting system insets.
 */
@Composable
fun AttentionList(
    state: AttentionUiState.Ready,
    onSelectItem: (String) -> Unit,
    scaffoldPadding: PaddingValues,
    listState: LazyListState = rememberLazyListState(),
    fabClearance: androidx.compose.ui.unit.Dp = RelayDimens.fabClearance,
    condensed: Boolean = false,
) {
    val colors = RelayThemeTokens.colors
    val layoutDirection = LocalLayoutDirection.current
    LazyColumn(
        state = listState,
        modifier = Modifier
            .fillMaxSize()
            .padding(
                start = scaffoldPadding.calculateStartPadding(layoutDirection),
                top = scaffoldPadding.calculateTopPadding(),
                end = scaffoldPadding.calculateEndPadding(layoutDirection),
                bottom = scaffoldPadding.calculateBottomPadding(),
            )
            .testTag("attention_list"),
        contentPadding = PaddingValues(
            start = 16.dp,
            top = 8.dp,
            end = 16.dp,
            bottom = 8.dp + fabClearance,
        ),
        verticalArrangement = Arrangement.spacedBy(if (condensed) 8.dp else 12.dp),
    ) {
        state.sections.forEach { section ->
            if (section.items.isEmpty()) return@forEach
            item(key = "header_${section.key}") {
                Text(
                    text = "${sectionLabel(section.key)} ${section.items.size}",
                    style = MaterialTheme.typography.titleSmall,
                    color = colors.inkMuted,
                    modifier = Modifier.padding(top = 8.dp, bottom = 4.dp),
                )
            }
            items(section.items, key = { it.id }) { item ->
                AttentionItemRow(
                    item = item,
                    isSelected = state.selectedItemId == item.id,
                    onClick = { onSelectItem(item.id) },
                    condensed = condensed,
                    agentsById = state.agentsById,
                    nowMillis = state.presentationNowMillis,
                    showInlineDecision = !condensed && item.status == Status.NeedsYou,
                    modifier = Modifier.testTag("row_${item.id}"),
                )
            }
        }
    }
}

@Composable
private fun sectionLabel(key: AttentionSectionKey): String = when (key) {
    AttentionSectionKey.NeedsYou -> stringResource(R.string.section_needs_you)
    AttentionSectionKey.Blocked -> stringResource(R.string.section_blocked)
    AttentionSectionKey.Today -> stringResource(R.string.section_today)
}

@Composable
fun AttentionItemRow(
    item: WorkItem,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    condensed: Boolean = false,
    agentsById: Map<String, Agent> = emptyMap(),
    nowMillis: Long = System.currentTimeMillis(),
    showInlineDecision: Boolean = false,
) {
    val colors = RelayThemeTokens.colors
    val isDark = RelayThemeTokens.isDark
    val isNeedsYou = item.status == Status.NeedsYou
    val shape = RoundedCornerShape(RelayDimens.cardRadius)
    val background = when {
        isNeedsYou && !condensed -> colors.needsYouRowFill
        isNeedsYou && condensed && isSelected -> colors.needsYouRowFill
        isNeedsYou -> colors.needsYouRowFill
        isSelected -> colors.selectedRowFill
        else -> colors.raised
    }
    val borderColor = when {
        isNeedsYou && (showInlineDecision || (condensed && isSelected)) -> colors.attentionRule
        isSelected && !isNeedsYou -> colors.control
        else -> colors.line
    }
    val borderWidth = when {
        isNeedsYou && (showInlineDecision || (condensed && isSelected)) -> RelayDimens.needsYouRuleWidth
        isSelected && !isNeedsYou -> RelayDimens.selectedRowBorderWidth
        else -> 1.dp
    }
    val rowShape = if (isSelected && !isNeedsYou) {
        RoundedCornerShape(RelayDimens.selectedRowRadius)
    } else {
        shape
    }
    val semanticsLabel = buildString {
        append(item.title)
        if (isNeedsYou) append(", ${stringResource(R.string.cd_needs_you_rule)}")
        if (isSelected) append(", ${stringResource(R.string.cd_selected_row)}")
    }
    val shadowLayers = if (isSelected && !isNeedsYou) {
        selectedRowShadowLayers(darkTheme = isDark)
    } else {
        emptyList()
    }
    val attentionRuleColor = colors.attentionRule
    var chromeModifier = Modifier.fillMaxWidth()
    for (layer in shadowLayers) {
        chromeModifier = chromeModifier.shadow(
            elevation = layer.elevation,
            shape = rowShape,
            clip = false,
            ambientColor = layer.color,
            spotColor = layer.color,
        )
    }
    var decisionDraft by rememberSaveable(item.id) { mutableStateOf("") }
    val agentName = AttentionPresentation.returnAgentName(item, agentsById)
    // clip → drawWithContent → background/border: drawContent paints fill+border+children,
    // then the 2 dp rule is drawn on top so the 1 dp border cannot cover it (B2 / §9.5 r8).
    Box(
        modifier = chromeModifier
            .clip(rowShape)
            .then(
                if (isNeedsYou) {
                    Modifier.drawWithContent {
                        drawContent()
                        drawNeedsYouRule(
                            color = attentionRuleColor,
                            widthPx = RelayDimens.needsYouRuleWidth.toPx(),
                        )
                    }
                } else {
                    Modifier
                },
            )
            .background(background)
            .border(borderWidth, borderColor, rowShape)
            .semantics { contentDescription = semanticsLabel }
            .testTag(
                when {
                    isNeedsYou -> "row_needs_you"
                    isSelected -> "row_selected"
                    else -> "row_item"
                },
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = if (isNeedsYou) RelayDimens.needsYouRuleWidth + 10.dp else 12.dp)
                .padding(end = 12.dp, top = 12.dp, bottom = 12.dp),
        ) {
            // Header carries row testTag + click; inline controls stay outside clickable.
            Column(
                modifier = modifier
                    .fillMaxWidth()
                    .clickable(onClick = onClick),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Top,
                ) {
                    StatusGlyph(status = item.status)
                    Spacer(modifier = Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.Top) {
                            Text(
                                text = item.title,
                                style = MaterialTheme.typography.titleMedium,
                                color = colors.ink,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = if (condensed) 1 else 2,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f),
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            ActorFlow(
                                from = if (isNeedsYou) {
                                    AttentionPresentation.mark(
                                        type = item.lastActorType,
                                        actorId = item.lastActorId,
                                        agentsById = agentsById,
                                    )
                                } else {
                                    null
                                },
                                to = AttentionPresentation.witnessMark(item, agentsById),
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = AttentionPresentation.metaLine(item, agentsById, nowMillis),
                            style = MaterialTheme.typography.bodySmall,
                            color = if (item.status == Status.Blocked) colors.warn else colors.inkMuted,
                            maxLines = if (isNeedsYou) 2 else 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.testTag(
                                if (item.status == Status.Blocked) "blocked_reason" else "row_meta",
                            ),
                        )
                        val body = when {
                            condensed && !showInlineDecision -> null
                            item.status == Status.NeedsYou -> item.needsYouReason
                            item.status == Status.Blocked -> null
                            else -> null
                        }
                        if (!body.isNullOrBlank()) {
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = body,
                                style = MaterialTheme.typography.bodyMedium,
                                color = colors.ink2,
                                maxLines = 4,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        DueReminderChips(item = item, nowMillis = nowMillis)
                    }
                }
            }
            if (showInlineDecision) {
                Spacer(modifier = Modifier.height(10.dp))
                InlineNeedsYouActions(
                    agentName = agentName,
                    decisionDraft = decisionDraft,
                    onDecisionChange = { decisionDraft = it },
                )
            }
        }
        if (isNeedsYou) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterStart)
                    .width(RelayDimens.needsYouRuleWidth)
                    .fillMaxHeight()
                    .testTag("needs_you_rule"),
            )
        }
    }
}

@Composable
internal fun ActorFlow(
    from: ActorMarkModel?,
    to: ActorMarkModel,
    modifier: Modifier = Modifier,
) {
    val colors = RelayThemeTokens.colors
    Row(
        modifier = modifier.testTag("actor_flow"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (from != null) {
            ActorMark(mark = from)
            Text("→", color = colors.inkMuted, style = MaterialTheme.typography.labelSmall)
        }
        ActorMark(mark = to)
    }
}

@Composable
internal fun ActorMark(
    mark: ActorMarkModel,
    modifier: Modifier = Modifier,
) {
    val colors = RelayThemeTokens.colors
    val isHuman = mark.shape == ActorMarkModel.Shape.Circle
    val shape = if (isHuman) CircleShape else RoundedCornerShape(5.dp)
    Box(
        modifier = modifier
            .size(20.dp)
            .clip(shape)
            .background(if (isHuman) colors.ink else colors.raised)
            .border(1.dp, colors.ink, shape)
            .testTag("actor_mark_${mark.monogram}"),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = mark.monogram,
            color = if (isHuman) colors.paper else colors.ink,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
internal fun DueReminderChips(
    item: WorkItem,
    nowMillis: Long,
    modifier: Modifier = Modifier,
) {
    val dueAt = item.dueAt
    val reminderAt = item.reminderAt
    if (dueAt == null && reminderAt == null) return
    val colors = RelayThemeTokens.colors
    Row(
        modifier = modifier
            .padding(top = 6.dp)
            .testTag("due_reminder_chips"),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (dueAt != null) {
            val chip = RelativeTimeFormat.formatDue(iso = dueAt, nowMillis = nowMillis)
            Text(
                text = chip.text,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = when (chip.tone) {
                    DueChip.Tone.Crit -> colors.crit
                    DueChip.Tone.Warn -> colors.warn
                    DueChip.Tone.Muted -> colors.inkMuted
                },
                modifier = Modifier.testTag("due_chip"),
            )
        }
        if (reminderAt != null) {
            val chip = RelativeTimeFormat.formatReminder(iso = reminderAt, nowMillis = nowMillis)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.testTag("reminder_chip"),
            ) {
                Icon(
                    imageVector = Icons.Outlined.Notifications,
                    contentDescription = null,
                    tint = colors.inkMuted,
                    modifier = Modifier.size(12.dp),
                )
                Spacer(modifier = Modifier.width(3.dp))
                Text(
                    text = chip.text,
                    style = MaterialTheme.typography.labelMedium,
                    color = colors.inkMuted,
                )
            }
        }
    }
}

@Composable
private fun InlineNeedsYouActions(
    agentName: String,
    decisionDraft: String,
    onDecisionChange: (String) -> Unit,
) {
    val colors = RelayThemeTokens.colors
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.testTag("inline_decision_card"),
    ) {
        OutlinedTextField(
            value = decisionDraft,
            onValueChange = onDecisionChange,
            modifier = Modifier
                .fillMaxWidth()
                .testTag("inline_decision_input"),
            placeholder = { Text(stringResource(R.string.decision_placeholder)) },
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = colors.raised,
                unfocusedContainerColor = colors.raised,
                focusedBorderColor = colors.lineStrong,
                unfocusedBorderColor = colors.line,
                focusedTextColor = colors.ink,
                unfocusedTextColor = colors.ink,
                cursorColor = colors.accentInk,
            ),
        )
        Button(
            onClick = {},
            modifier = Modifier
                .fillMaxWidth()
                .testTag("inline_return_agent"),
            colors = ButtonDefaults.buttonColors(
                containerColor = colors.hl,
                contentColor = colors.onHl,
            ),
            shape = RoundedCornerShape(999.dp),
        ) {
            Icon(Icons.AutoMirrored.Outlined.Undo, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = stringResource(R.string.cta_return_to_agent, agentName),
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = {},
                modifier = Modifier.testTag("inline_do_myself"),
                shape = RoundedCornerShape(999.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = colors.ink),
            ) {
                Icon(Icons.Outlined.BackHand, contentDescription = null)
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = stringResource(R.string.cta_do_myself),
                    fontWeight = FontWeight.SemiBold,
                )
            }
            IconButton(
                onClick = {},
                modifier = Modifier
                    .border(1.dp, colors.line, CircleShape)
                    .testTag("inline_overflow"),
            ) {
                Icon(
                    Icons.Outlined.MoreVert,
                    contentDescription = stringResource(R.string.more),
                    tint = colors.ink,
                )
            }
        }
    }
}

private fun DrawScope.drawNeedsYouRule(color: Color, widthPx: Float) {
    drawRect(color = color, size = Size(widthPx, size.height))
}

@Composable
internal fun StatusGlyph(status: Status) {
    val colors = RelayThemeTokens.colors
    val tint = when (status) {
        Status.NeedsYou -> colors.accent
        Status.Blocked -> colors.warn
        else -> colors.ink2
    }
    Box(
        modifier = Modifier
            .size(18.dp)
            .border(1.5.dp, tint, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        when (status) {
            Status.NeedsYou -> Box(
                modifier = Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(tint),
            )
            Status.Blocked -> Box(
                modifier = Modifier
                    .width(8.dp)
                    .height(2.dp)
                    .background(tint),
            )
            else -> Unit
        }
    }
}

internal fun metaLine(item: WorkItem): String =
    AttentionPresentation.metaLine(item, agentsById = emptyMap())

private fun AttentionUiState.Ready.findItem(itemId: String?): WorkItem? {
    if (itemId == null) return null
    sections.forEach { section ->
        section.items.firstOrNull { it.id == itemId }?.let { return it }
    }
    return inbox.items.firstOrNull { it.id == itemId }
}
