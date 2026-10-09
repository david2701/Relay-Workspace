package app.relay.ui.attention

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import app.relay.data.ActorType
import app.relay.data.AssigneeType
import app.relay.data.AttentionSection
import app.relay.data.AttentionSectionKey
import app.relay.data.InboxCounters
import app.relay.data.InboxQueryResult
import app.relay.data.InboxSectionCounts
import app.relay.data.Priority
import app.relay.data.Source
import app.relay.data.Status
import app.relay.data.WorkItem
import app.relay.theme.RelayTheme
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.ParameterizedRobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * B1: scrolled to the end, the last row must not intersect the FAB
 * (list bottom content padding = FAB height + margin atop Scaffold insets).
 */
@RunWith(ParameterizedRobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34])
class AttentionFabOverlapTest(
    private val widthDp: Int,
    private val heightDp: Int,
) {
    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun lastRowDoesNotIntersectFabWhenScrolledToEnd() {
        val inbox = longInbox(itemCount = 24)
        val lastId = inbox.sections!!.last().items.last().id
        val listState = LazyListState()
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
                        listState = listState,
                    )
                }
            }
        }
        composeRule.waitForIdle()
        composeRule.runOnIdle {
            val lastIndex = listState.layoutInfo.totalItemsCount - 1
            assertTrue("list should have items", lastIndex >= 0)
            runBlocking { listState.scrollToItem(lastIndex) }
        }
        composeRule.waitForIdle()
        val fab = composeRule.onNodeWithTag("attention_fab").fetchSemanticsNode().boundsInRoot
        val lastRow = composeRule.onNodeWithTag("row_$lastId").fetchSemanticsNode().boundsInRoot
        assertFalse(
            "last row $lastRow must not intersect FAB $fab at ${widthDp}x${heightDp}dp",
            fab.overlaps(lastRow),
        )
        assertTrue(
            "last row bottom (${lastRow.bottom}) should sit above FAB top (${fab.top})",
            lastRow.bottom <= fab.top + 0.5f,
        )
    }

    private fun Rect.overlaps(other: Rect): Boolean =
        left < other.right && right > other.left && top < other.bottom && bottom > other.top

    companion object {
        @JvmStatic
        @ParameterizedRobolectricTestRunner.Parameters(name = "{0}x{1}dp")
        fun sizes(): List<Array<Int>> = listOf(
            arrayOf(360, 640),
            arrayOf(411, 891),
            arrayOf(840, 1200),
        )

        fun longInbox(itemCount: Int): InboxQueryResult {
            val stamp = "2026-10-09T03:40:42.169Z"
            val items = (0 until itemCount).map { index ->
                WorkItem(
                    id = "itm_fab_%02d".format(index),
                    title = "Ítem de prueba $index",
                    goal = "Meta $index",
                    status = Status.Assigned,
                    assigneeType = AssigneeType.User,
                    assigneeId = "user",
                    priority = Priority.None,
                    source = Source.Ui,
                    createdAt = stamp,
                    updatedAt = stamp,
                    lastActorType = ActorType.User,
                    lastActorId = "user",
                )
            }
            return InboxQueryResult(
                view = "attention",
                items = items,
                counters = InboxCounters(needsYou = 0),
                totalCount = items.size,
                sectionCounts = InboxSectionCounts(
                    needsYou = 0,
                    blocked = 0,
                    today = items.size,
                ),
                sections = listOf(
                    AttentionSection(key = AttentionSectionKey.Today, items = items),
                ),
            )
        }
    }
}
