package app.relay.ui.attention

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import app.relay.data.AttentionSectionKey
import app.relay.data.FixtureLoader
import app.relay.data.RelayApiClient
import com.github.takahirom.roborazzi.RoborazziRule
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34])
class AttentionTabletScreenshotTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @get:Rule
    val roborazziRule = RoborazziRule(
        options = RoborazziRule.Options(
            outputDirectoryPath = "src/test/screenshots",
        ),
    )

    @Test
    fun attentionTabletLight() {
        val inbox = RelayApiClient("http://127.0.0.1:7420")
            .decodeInbox(FixtureLoader.read("inbox_attention.json"))
        val needsYouId = inbox.sections.orEmpty()
            .first { it.key == AttentionSectionKey.NeedsYou }
            .items.first().id
        composeRule.captureAttention(
            dark = false,
            widthDp = 840,
            heightDp = 1200,
            state = AttentionUiState.Ready(
                inbox = inbox,
                selectedItemId = needsYouId,
                agentsById = screenshotAgentsById(),
                lastSyncedAtMillis = ScreenshotSyncedAtMillis,
                presentationNowMillis = ScreenshotNowMillis,
            ),
            fileName = "attention_tablet_light",
        )
    }
}
