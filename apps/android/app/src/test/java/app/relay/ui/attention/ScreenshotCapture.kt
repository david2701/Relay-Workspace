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
import app.relay.data.Agent
import app.relay.data.AgentsEnvelope
import app.relay.data.FixtureLoader
import app.relay.theme.RelayTheme
import com.github.takahirom.roborazzi.captureRoboImage
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import org.robolectric.RuntimeEnvironment
import java.time.Instant
import java.util.TimeZone

/** Fixed clock for Penpot-aligned due/reminder/sync labels in screenshots. */
internal val ScreenshotNowMillis: Long =
    Instant.parse("2026-10-08T12:00:00Z").toEpochMilli()

internal val ScreenshotSyncedAtMillis: Long = ScreenshotNowMillis - 1_000L

internal fun screenshotAgentsById(): Map<String, Agent> {
    val raw = FixtureLoader.read("agents.json")
    val envelope = Json { ignoreUnknownKeys = true }
        .decodeFromString(AgentsEnvelope.serializer(), raw)
    return envelope.agents.associateBy { it.id }
}

internal fun setViewportQualifiers(widthDp: Int, heightDp: Int) {
    TimeZone.setDefault(TimeZone.getTimeZone("Europe/Madrid"))
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
