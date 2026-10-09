package app.relay.ui.attention

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import app.relay.data.AttentionSectionKey
import app.relay.data.FixtureLoader
import app.relay.data.RelayApiClient
import app.relay.theme.RelayTheme
import com.github.takahirom.roborazzi.RoborazziRule
import com.github.takahirom.roborazzi.captureRoboImage
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
        val blockedId = inbox.sections.orEmpty()
            .first { it.key == AttentionSectionKey.Blocked }
            .items.first().id
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
                            selectedItemId = blockedId,
                        ),
                        onRetry = {},
                        onSelectItem = {},
                    )
                }
            }
        }
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("viewport")
            .captureRoboImage("src/test/screenshots/attention_tablet_light.png")
    }
}
