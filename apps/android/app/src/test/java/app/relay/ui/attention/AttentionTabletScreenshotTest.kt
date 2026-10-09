package app.relay.ui.attention

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
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
@Config(sdk = [34], qualifiers = "w800dp-h1280dp-mdpi")
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
        composeRule.setContent {
            RelayTheme(darkTheme = false) {
                AttentionScreen(
                    state = AttentionUiState.Ready(inbox = inbox),
                    onRetry = {},
                    onSelectItem = {},
                )
            }
        }
        composeRule.onRoot().captureRoboImage("src/test/screenshots/attention_tablet_light.png")
    }
}
