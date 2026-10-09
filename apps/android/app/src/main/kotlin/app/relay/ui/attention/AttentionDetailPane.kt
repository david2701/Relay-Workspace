package app.relay.ui.attention

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Undo
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.People
import androidx.compose.material.icons.automirrored.outlined.StickyNote2
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.relay.R
import app.relay.data.Agent
import app.relay.data.Status
import app.relay.data.WorkItem
import app.relay.theme.RelayDimens
import app.relay.theme.RelayThemeTokens

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AttentionDetailPane(
    item: WorkItem?,
    showBack: Boolean,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    agentsById: Map<String, Agent> = emptyMap(),
    nowMillis: Long = System.currentTimeMillis(),
) {
    val colors = RelayThemeTokens.colors
    if (item == null) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(colors.paper)
                .testTag("attention_detail_placeholder"),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = stringResource(R.string.detail_placeholder),
                style = MaterialTheme.typography.bodyMedium,
                color = colors.inkMuted,
            )
        }
        return
    }
    Scaffold(
        modifier = modifier
            .fillMaxSize()
            .testTag("attention_detail"),
        containerColor = colors.paper,
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    if (showBack) {
                        IconButton(
                            onClick = onBack,
                            modifier = Modifier.testTag("detail_back"),
                        ) {
                            Icon(
                                Icons.AutoMirrored.Outlined.ArrowBack,
                                contentDescription = stringResource(R.string.back),
                                tint = colors.ink,
                            )
                        }
                    }
                },
                actions = {
                    IconButton(onClick = {}) {
                        Icon(
                            Icons.Outlined.Link,
                            contentDescription = stringResource(R.string.link),
                            tint = colors.ink,
                        )
                    }
                    IconButton(onClick = {}) {
                        Icon(
                            Icons.Outlined.MoreVert,
                            contentDescription = stringResource(R.string.more),
                            tint = colors.ink,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = colors.paper,
                    navigationIconContentColor = colors.ink,
                    actionIconContentColor = colors.ink,
                ),
            )
        },
        bottomBar = {
            DetailBottomAppBar()
        },
    ) { innerPadding ->
        DetailBody(
            item = item,
            agentsById = agentsById,
            nowMillis = nowMillis,
            contentPadding = innerPadding,
        )
    }
}

@Composable
private fun DetailBottomAppBar() {
    val colors = RelayThemeTokens.colors
    BottomAppBar(
        modifier = Modifier.testTag("detail_bottom_bar"),
        containerColor = colors.paper,
        contentColor = colors.inkMuted,
        tonalElevation = 0.dp,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            DetailBarAction(
                icon = { Icon(Icons.Outlined.People, contentDescription = null) },
                label = stringResource(R.string.cta_assign),
                testTag = "detail_action_assign",
            )
            DetailBarAction(
                icon = { Icon(Icons.AutoMirrored.Outlined.StickyNote2, contentDescription = null) },
                label = stringResource(R.string.cta_note),
                testTag = "detail_action_note",
            )
            DetailBarAction(
                icon = { Icon(Icons.Outlined.Notifications, contentDescription = null) },
                label = stringResource(R.string.cta_notice),
                testTag = "detail_action_notice",
            )
        }
    }
}

@Composable
private fun DetailBarAction(
    icon: @Composable () -> Unit,
    label: String,
    testTag: String,
) {
    val colors = RelayThemeTokens.colors
    Column(
        modifier = Modifier
            .testTag(testTag)
            .padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(modifier = Modifier.size(24.dp), contentAlignment = Alignment.Center) {
            icon()
        }
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = colors.inkMuted,
        )
    }
}

@Composable
private fun DetailBody(
    item: WorkItem,
    agentsById: Map<String, Agent>,
    nowMillis: Long,
    contentPadding: PaddingValues,
) {
    val colors = RelayThemeTokens.colors
    var decisionDraft by rememberSaveable(item.id) { mutableStateOf("") }
    val agentName = AttentionPresentation.returnAgentName(item, agentsById)
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        StatusBadge(status = item.status)
        Text(
            text = item.title,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = colors.ink,
            modifier = Modifier.testTag("detail_title"),
        )
        if (item.status == Status.NeedsYou) {
            NeedsYouActionCard(
                item = item,
                agentName = agentName,
                agentsById = agentsById,
                nowMillis = nowMillis,
                decisionDraft = decisionDraft,
                onDecisionChange = { decisionDraft = it },
            )
        }
        HandoffSection(item = item, agentsById = agentsById, nowMillis = nowMillis)
        ContextSection(item = item)
        Spacer(modifier = Modifier.height(8.dp))
    }
}

@Composable
private fun StatusBadge(status: Status) {
    val colors = RelayThemeTokens.colors
    val isNeedsYou = status == Status.NeedsYou
    val label = when (status) {
        Status.NeedsYou -> stringResource(R.string.section_needs_you)
        Status.Blocked -> stringResource(R.string.section_blocked)
        else -> stringResource(R.string.section_today)
    }
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .border(
                width = if (isNeedsYou) RelayDimens.needsYouRuleWidth else 1.dp,
                color = if (isNeedsYou) colors.attentionRule else colors.line,
                shape = RoundedCornerShape(999.dp),
            )
            .background(if (isNeedsYou) colors.accentTint else colors.sunken)
            .padding(horizontal = 10.dp, vertical = 5.dp)
            .testTag("detail_status_badge"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StatusGlyph(status = status)
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = if (isNeedsYou) colors.accentInk else colors.ink,
        )
    }
}

@Composable
private fun NeedsYouActionCard(
    item: WorkItem,
    agentName: String,
    agentsById: Map<String, Agent>,
    nowMillis: Long,
    decisionDraft: String,
    onDecisionChange: (String) -> Unit,
) {
    val colors = RelayThemeTokens.colors
    val shape = RoundedCornerShape(16.dp)
    val relative = RelativeTimeFormat.formatRelative(iso = item.updatedAt, nowMillis = nowMillis)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(colors.accentTint)
            .border(RelayDimens.needsYouRuleWidth, colors.attentionRule, shape)
            .padding(16.dp)
            .testTag("detail_needs_you_card"),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.needs_you_meta, agentName, relative),
                style = MaterialTheme.typography.labelMedium,
                color = colors.inkMuted,
                modifier = Modifier.weight(1f),
            )
            Spacer(modifier = Modifier.width(8.dp))
            ActorFlow(
                from = AttentionPresentation.mark(
                    type = item.lastActorType,
                    actorId = item.lastActorId,
                    agentsById = agentsById,
                ),
                to = AttentionPresentation.witnessMark(item, agentsById),
            )
        }
        val body = item.needsYouReason
        if (!body.isNullOrBlank()) {
            Text(
                text = body,
                style = MaterialTheme.typography.bodyMedium,
                color = colors.ink,
            )
        }
        DueReminderChips(item = item, nowMillis = nowMillis)
        OutlinedTextField(
            value = decisionDraft,
            onValueChange = onDecisionChange,
            modifier = Modifier
                .fillMaxWidth()
                .testTag("detail_decision_input"),
            placeholder = {
                Text(stringResource(R.string.decision_placeholder))
            },
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
                .testTag("detail_return_agent"),
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
        DoMyselfOverflowRow(
            doMyselfTag = "detail_do_myself",
            overflowTag = "detail_overflow",
        )
    }
}

@Composable
private fun HandoffSection(
    item: WorkItem,
    agentsById: Map<String, Agent>,
    nowMillis: Long,
) {
    val colors = RelayThemeTokens.colors
    val model = AttentionPresentation.handoff(item, agentsById, nowMillis)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = stringResource(R.string.section_handoff),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = colors.inkMuted,
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(colors.sunken)
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = model.relativeTime,
                    style = MaterialTheme.typography.labelMedium,
                    color = colors.inkMuted,
                )
                Spacer(modifier = Modifier.width(8.dp))
                ActorFlow(from = model.fromMark, to = model.toMark)
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = model.summary,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = colors.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
            }
            Text(
                text = model.detailLine,
                style = MaterialTheme.typography.bodySmall,
                color = colors.inkMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun ContextSection(item: WorkItem) {
    val colors = RelayThemeTokens.colors
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = stringResource(R.string.section_context),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = colors.inkMuted,
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(colors.raised)
                .border(1.dp, colors.line, RoundedCornerShape(12.dp))
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = stringResource(R.string.context_decision),
                style = MaterialTheme.typography.labelMedium,
                color = colors.inkMuted,
            )
            Text(
                text = stringResource(R.string.context_product_name),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = colors.ink,
            )
            val snippet = item.needsYouReason ?: item.goal
            if (!snippet.isNullOrBlank()) {
                Text(
                    text = snippet,
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.ink2,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
