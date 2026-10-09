package app.relay.ui.attention

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Notes
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material.icons.outlined.People
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.relay.R
import app.relay.data.AttentionSectionKey
import app.relay.data.Status
import app.relay.data.WorkItem
import app.relay.theme.RelayDimens
import app.relay.theme.RelayThemeTokens
import app.relay.theme.selectedRowShadowLayers

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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AttentionScreen(
    state: AttentionUiState,
    onRetry: () -> Unit,
    onSelectItem: (String?) -> Unit,
    modifier: Modifier = Modifier,
    listState: LazyListState = rememberLazyListState(),
) {
    val colors = RelayThemeTokens.colors
    Scaffold(
        modifier = modifier
            .fillMaxSize()
            .testTag("attention_screen"),
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
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Outlined.CloudDone,
                                contentDescription = null,
                                tint = colors.inkMuted,
                                modifier = Modifier.size(14.dp),
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = stringResource(R.string.sync_up_to_date),
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
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = {},
                modifier = Modifier.testTag("attention_fab"),
                icon = {
                    Icon(
                        Icons.Outlined.Add,
                        contentDescription = null,
                        tint = colors.onHl,
                    )
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
        },
        bottomBar = {
            AttentionBottomBar(
                needsYouCount = when (state) {
                    is AttentionUiState.Ready -> state.inbox.counters.needsYou
                    else -> 0
                },
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
                    AttentionList(
                        state = state,
                        onSelectItem = onSelectItem,
                        scaffoldPadding = innerPadding,
                        listState = listState,
                    )
                }
            }
        }
    }
}

@Composable
private fun AttentionBottomBar(needsYouCount: Int) {
    val colors = RelayThemeTokens.colors
    NavigationBar(containerColor = colors.sunken) {
        NavigationBarItem(
            selected = true,
            onClick = {},
            icon = {
                Icon(Icons.Outlined.Inbox, contentDescription = null)
            },
            label = { Text(stringResource(R.string.nav_attention)) },
            colors = NavigationBarItemDefaults.colors(
                indicatorColor = colors.hl,
                selectedIconColor = colors.onHl,
                selectedTextColor = colors.accentInk,
                unselectedIconColor = colors.inkMuted,
                unselectedTextColor = colors.inkMuted,
            ),
        )
        NavigationBarItem(
            selected = false,
            onClick = {},
            icon = { Icon(Icons.Outlined.People, contentDescription = null) },
            label = { Text(stringResource(R.string.nav_team)) },
            colors = NavigationBarItemDefaults.colors(
                unselectedIconColor = colors.inkMuted,
                unselectedTextColor = colors.inkMuted,
            ),
        )
        NavigationBarItem(
            selected = false,
            onClick = {},
            icon = { Icon(Icons.AutoMirrored.Outlined.Notes, contentDescription = null) },
            label = { Text(stringResource(R.string.nav_notes)) },
            colors = NavigationBarItemDefaults.colors(
                unselectedIconColor = colors.inkMuted,
                unselectedTextColor = colors.inkMuted,
            ),
        )
    }
    @Suppress("UNUSED_VARIABLE")
    val ignored = needsYouCount
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
 * Extra [RelayDimens.fabClearance] is added only to LazyColumn contentPadding.bottom
 * so the last row clears the FAB without double-counting system insets.
 */
@Composable
fun AttentionList(
    state: AttentionUiState.Ready,
    onSelectItem: (String?) -> Unit,
    scaffoldPadding: PaddingValues,
    listState: LazyListState = rememberLazyListState(),
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
            bottom = 8.dp + RelayDimens.fabClearance,
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
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
                    onClick = {
                        onSelectItem(
                            if (state.selectedItemId == item.id) null else item.id,
                        )
                    },
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
) {
    val colors = RelayThemeTokens.colors
    val isDark = RelayThemeTokens.isDark
    val isNeedsYou = item.status == Status.NeedsYou
    val shape = RoundedCornerShape(RelayDimens.cardRadius)
    val background = when {
        isNeedsYou -> colors.needsYouRowFill
        isSelected -> colors.selectedRowFill
        else -> colors.raised
    }
    val borderColor = when {
        isSelected && !isNeedsYou -> colors.control
        else -> colors.line
    }
    val borderWidth = when {
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
    var rowModifier = modifier.fillMaxWidth()
    for (layer in shadowLayers) {
        rowModifier = rowModifier.shadow(
            elevation = layer.elevation,
            shape = rowShape,
            clip = false,
            ambientColor = layer.color,
            spotColor = layer.color,
        )
    }
    // clip → drawWithContent → background/border: drawContent paints fill+border+children,
    // then the 2 dp rule is drawn on top so the 1 dp border cannot cover it (B2 / §9.5 r8).
    Box(
        modifier = rowModifier
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
            .clickable(onClick = onClick)
            .semantics { contentDescription = semanticsLabel }
            .testTag(
                when {
                    isNeedsYou -> "row_needs_you"
                    isSelected -> "row_selected"
                    else -> "row_item"
                },
            ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = if (isNeedsYou) RelayDimens.needsYouRuleWidth + 10.dp else 12.dp)
                .padding(end = 12.dp, top = 12.dp, bottom = 12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    StatusGlyph(status = item.status)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = item.title,
                        style = MaterialTheme.typography.titleMedium,
                        color = colors.ink,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = metaLine(item),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.inkMuted,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                // Body: needs_you reason or goal. Blocked reason is only in metaLine (B7).
                val body = when (item.status) {
                    Status.NeedsYou -> item.needsYouReason
                    Status.Blocked -> item.goal
                    else -> item.goal
                }
                if (!body.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = body,
                        style = MaterialTheme.typography.bodyMedium,
                        color = colors.ink2,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
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

private fun DrawScope.drawNeedsYouRule(color: Color, widthPx: Float) {
    drawRect(color = color, size = Size(widthPx, size.height))
}

@Composable
private fun StatusGlyph(status: Status) {
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

private fun metaLine(item: WorkItem): String {
    val reason = when (item.status) {
        Status.NeedsYou -> "Necesita tu decisión"
        Status.Blocked -> item.blockedReason?.let { "Atascado: $it" }
        else -> item.reminderIntent
    }
    return reason ?: item.status.name.lowercase()
}
