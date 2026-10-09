package app.relay.ui.attention

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.rules.ActivityScenarioRule
import app.relay.theme.RelayTheme
import com.github.takahirom.roborazzi.captureRoboImage
import kotlinx.coroutines.runBlocking
import org.robolectric.RuntimeEnvironment

internal fun setViewportQualifiers(widthDp: Int, heightDp: Int) {
    RuntimeEnvironment.setQualifiers("w${widthDp}dp-h${heightDp}dp-mdpi")
}

internal fun <A : androidx.activity.ComponentActivity> AndroidComposeTestRule<ActivityScenarioRule<A>, A>.captureAttention(
    dark: Boolean,
    widthDp: Int,
    heightDp: Int,
    state: AttentionUiState.Ready,
    fileName: String,
    listState: LazyListState = LazyListState(),
    scrollToEnd: Boolean = false,
) {
    setViewportQualifiers(widthDp, heightDp)
    setContent {
        RelayTheme(darkTheme = dark) {
            AttentionViewport(widthDp = widthDp, heightDp = heightDp) {
                AttentionScreen(
                    state = state,
                    onRetry = {},
                    onSelectItem = {},
                    listState = listState,
                )
            }
        }
    }
    waitForIdle()
    if (scrollToEnd) {
        runOnIdle {
            val lastIndex = listState.layoutInfo.totalItemsCount - 1
            if (lastIndex >= 0) {
                runBlocking { listState.scrollToItem(lastIndex) }
            }
        }
        waitForIdle()
    }
    onNodeWithTag("viewport").captureRoboImage("src/test/screenshots/$fileName.png")
}

internal fun <A : androidx.activity.ComponentActivity> AndroidComposeTestRule<ActivityScenarioRule<A>, A>.captureAttentionDetail(
    dark: Boolean,
    widthDp: Int,
    heightDp: Int,
    state: AttentionUiState.Ready,
    fileName: String,
) {
    setViewportQualifiers(widthDp, heightDp)
    setContent {
        RelayTheme(darkTheme = dark) {
            AttentionViewport(widthDp = widthDp, heightDp = heightDp) {
                AttentionScreen(
                    state = state,
                    onRetry = {},
                    onSelectItem = {},
                )
            }
        }
    }
    waitForIdle()
    onNodeWithTag("viewport").captureRoboImage("src/test/screenshots/$fileName.png")
}

@Composable
private fun AttentionViewport(
    widthDp: Int,
    heightDp: Int,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = Modifier
            .requiredSize(widthDp.dp, heightDp.dp)
            .testTag("viewport"),
    ) {
        content()
    }
}
