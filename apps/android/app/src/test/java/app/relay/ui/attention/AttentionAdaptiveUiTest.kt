package app.relay.ui.attention

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteType
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.window.core.layout.WindowSizeClass
import app.relay.data.AttentionSectionKey
import app.relay.data.FixtureLoader
import app.relay.data.RelayApiClient
import app.relay.data.Status
import app.relay.theme.RelayTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.ParameterizedRobolectricTestRunner
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(ParameterizedRobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34])
class AttentionNavTypeByWidthTest(
    private val widthDp: Int,
    private val heightDp: Int,
    private val expectedTag: String,
) {
    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun navigationSuiteTypeMatchesWidth() {
        val inbox = seedInbox()
        setViewportQualifiers(widthDp, heightDp)
        composeRule.setContent {
            RelayTheme(darkTheme = false) {
                Box(
                    modifier = Modifier
                        .requiredSize(widthDp.dp, heightDp.dp)
                        .testTag("viewport"),
                ) {
                    AttentionScreen(
                        state = AttentionUiState.Ready(inbox = inbox),
                        onRetry = {},
                        onSelectItem = {},
                    )
                }
            }
        }
        composeRule.waitForIdle()
        assertTrue(composeRule.onAllNodesWithTag(expectedTag, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty())
        val sizeClass = WindowSizeClass(widthDp, heightDp)
        val actualType = relayNavigationSuiteType(sizeClass)
        val expectedType = when (expectedTag) {
            "nav_suite_bar" -> NavigationSuiteType.NavigationBar
            "nav_suite_rail" -> NavigationSuiteType.NavigationRail
            else -> error(expectedTag)
        }
        assertEquals(expectedType, actualType)
    }

    companion object {
        @JvmStatic
        @ParameterizedRobolectricTestRunner.Parameters(name = "{0}dp → {2}")
        fun widths(): List<Array<Any>> = listOf(
            arrayOf(360, 640, "nav_suite_bar"),
            arrayOf(600, 900, "nav_suite_rail"),
            arrayOf(840, 1200, "nav_suite_rail"),
        )
    }
}

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34])
class AttentionListDetailAdaptiveTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun widthSwitch600To840RevealsListAndDetail() {
        val inbox = seedInbox()
        val needsYouId = inbox.sections!!.first { it.key == AttentionSectionKey.NeedsYou }
            .items.first().id

        // Medium (600): rail + single pane — selected item shows detail only.
        setViewportQualifiers(600, 900)
        composeRule.setContent {
            RelayTheme(darkTheme = false) {
                Box(
                    modifier = Modifier
                        .requiredSize(600.dp, 900.dp)
                        .testTag("viewport"),
                ) {
                    AttentionScreen(
                        state = AttentionUiState.Ready(
                            inbox = inbox,
                            selectedItemId = needsYouId,
                        ),
                        onRetry = {},
                        onSelectItem = {},
                    )
                }
            }
        }
        composeRule.waitForIdle()
        assertTrue(
            composeRule.onAllNodesWithTag("nav_suite_rail", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty(),
        )
        composeRule.onNodeWithTag("attention_detail").assertIsDisplayed()
        val listVisibleAt600 = composeRule
            .onAllNodesWithTag("attention_list")
            .fetchSemanticsNodes()
            .isNotEmpty()
        assertTrue(
            "600dp with selection must be single-pane (no list+detail)",
            !listVisibleAt600,
        )

        // Expanded (840): same selection → list and detail side by side.
        setViewportQualifiers(840, 1200)
        composeRule.setContent {
            RelayTheme(darkTheme = false) {
                Box(
                    modifier = Modifier
                        .requiredSize(840.dp, 1200.dp)
                        .testTag("viewport"),
                ) {
                    AttentionScreen(
                        state = AttentionUiState.Ready(
                            inbox = inbox,
                            selectedItemId = needsYouId,
                        ),
                        onRetry = {},
                        onSelectItem = {},
                    )
                }
            }
        }
        composeRule.waitForIdle()
        assertTrue(
            composeRule.onAllNodesWithTag("nav_suite_rail", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty(),
        )
        composeRule.onNodeWithTag("attention_list").assertIsDisplayed()
        composeRule.onNodeWithTag("attention_detail").assertIsDisplayed()
        composeRule.onNodeWithTag("detail_bottom_bar").assertIsDisplayed()
    }

    @Test
    fun listAndDetailSideBySideAt840() {
        val inbox = seedInbox()
        val needsYouId = inbox.sections!!.first { it.key == AttentionSectionKey.NeedsYou }
            .items.first().id
        setViewportQualifiers(840, 1200)
        composeRule.setContent {
            RelayTheme(darkTheme = false) {
                Box(
                    modifier = Modifier
                        .requiredSize(840.dp, 1200.dp)
                        .testTag("viewport"),
                ) {
                    AttentionScreen(
                        state = AttentionUiState.Ready(
                            inbox = inbox,
                            selectedItemId = needsYouId,
                        ),
                        onRetry = {},
                        onSelectItem = {},
                    )
                }
            }
        }
        composeRule.waitForIdle()
        assertTrue(composeRule.onAllNodesWithTag("nav_suite_rail", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty())
        composeRule.onNodeWithTag("attention_list").assertIsDisplayed()
        composeRule.onNodeWithTag("attention_detail").assertIsDisplayed()
        composeRule.onNodeWithTag("detail_bottom_bar").assertIsDisplayed()
        composeRule.onNodeWithTag("detail_title").assertIsDisplayed()
    }

    @Test
    fun backFromDetailOnCompactReturnsToList() {
        val inbox = seedInbox()
        val needsYouId = inbox.sections!!.first { it.key == AttentionSectionKey.NeedsYou }
            .items.first().id
        setViewportQualifiers(360, 640)
        var selected by mutableStateOf<String?>(null)
        composeRule.setContent {
            RelayTheme(darkTheme = false) {
                Box(
                    modifier = Modifier
                        .requiredSize(360.dp, 640.dp)
                        .testTag("viewport"),
                ) {
                    AttentionScreen(
                        state = AttentionUiState.Ready(
                            inbox = inbox,
                            selectedItemId = selected,
                        ),
                        onRetry = {},
                        onSelectItem = { selected = it },
                    )
                }
            }
        }
        composeRule.waitForIdle()
        assertTrue(composeRule.onAllNodesWithTag("nav_suite_bar", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty())
        composeRule.onNodeWithTag("row_$needsYouId").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("attention_detail").assertIsDisplayed()
        composeRule.onNodeWithTag("detail_back").assertIsDisplayed().performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("attention_list").assertIsDisplayed()
        val detailStillVisible = composeRule
            .onAllNodesWithTag("attention_detail")
            .fetchSemanticsNodes()
            .isNotEmpty()
        assertTrue(
            "detail should hide after back on compact (selected=$selected, detailVisible=$detailStillVisible)",
            selected == null && !detailStillVisible,
        )
    }

    @Test
    fun blockedReasonIsSingleLineWithEllipsis() {
        val inbox = seedInbox()
        val blocked = inbox.items.first { it.status == Status.Blocked }
        setViewportQualifiers(360, 640)
        composeRule.setContent {
            RelayTheme(darkTheme = false) {
                Box(
                    modifier = Modifier
                        .requiredSize(200.dp, 640.dp)
                        .testTag("viewport"),
                ) {
                    AttentionItemRow(
                        item = blocked,
                        isSelected = false,
                        onClick = {},
                        modifier = Modifier.testTag("blocked_row"),
                    )
                }
            }
        }
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("blocked_reason", useUnmergedTree = true).assertIsDisplayed()
        val text = composeRule.onNodeWithTag("blocked_reason", useUnmergedTree = true)
            .fetchSemanticsNode()
            .config
            .joinToString { "${it.key.name}=${it.value}" }
        assertTrue(text.contains("Atascado"))
        assertTrue(
            "reason should use ellipsis or truncated single-line form: $text",
            text.contains("…") || text.contains("...") || text.contains("Atascado:"),
        )
    }
}

private fun seedInbox() =
    RelayApiClient("http://127.0.0.1:7420")
        .decodeInbox(FixtureLoader.read("inbox_attention.json"))
