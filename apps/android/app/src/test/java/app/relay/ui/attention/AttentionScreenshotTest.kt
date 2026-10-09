package app.relay.ui.attention

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.lazy.LazyListState
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
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * JVM screenshot captures via Roborazzi (no KVM/emulator required).
 * Widths: 360 / 411 phone + 840 tablet/foldable; light/dark;
 * top (needs_you + selected) and scrolled-to-end (last row above FAB).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34])
class AttentionScreenshotTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @get:Rule
    val roborazziRule = RoborazziRule(
        options = RoborazziRule.Options(
            outputDirectoryPath = "src/test/screenshots",
        ),
    )

    private val seedInbox by lazy {
        RelayApiClient("http://127.0.0.1:7420")
            .decodeInbox(FixtureLoader.read("inbox_attention.json"))
    }

    @Test
    fun attention_360_light_top() {
        captureTop(dark = false, widthDp = 360, heightDp = 640, fileName = "attention_360_light_top")
    }

    @Test
    fun attention_360_dark_top() {
        captureTop(dark = true, widthDp = 360, heightDp = 640, fileName = "attention_360_dark_top")
    }

    @Test
    fun attention_411_light_top() {
        captureTop(dark = false, widthDp = 411, heightDp = 891, fileName = "attention_411_light_top")
    }

    @Test
    fun attention_411_dark_top() {
        captureTop(dark = true, widthDp = 411, heightDp = 891, fileName = "attention_411_dark_top")
    }

    @Test
    fun attention_840_light_top() {
        captureTop(dark = false, widthDp = 840, heightDp = 1200, fileName = "attention_840_light_top")
    }

    @Test
    fun attention_840_dark_top() {
        captureTop(dark = true, widthDp = 840, heightDp = 1200, fileName = "attention_840_dark_top")
    }

    @Test
    fun attention_360_light_end() {
        captureEnd(dark = false, widthDp = 360, heightDp = 640, fileName = "attention_360_light_end")
    }

    @Test
    fun attention_360_dark_end() {
        captureEnd(dark = true, widthDp = 360, heightDp = 640, fileName = "attention_360_dark_end")
    }

    @Test
    fun attention_411_light_end() {
        captureEnd(dark = false, widthDp = 411, heightDp = 891, fileName = "attention_411_light_end")
    }

    @Test
    fun attention_411_dark_end() {
        captureEnd(dark = true, widthDp = 411, heightDp = 891, fileName = "attention_411_dark_end")
    }

    @Test
    fun attention_840_light_end() {
        captureEnd(dark = false, widthDp = 840, heightDp = 1200, fileName = "attention_840_light_end")
    }

    @Test
    fun attention_840_dark_end() {
        captureEnd(dark = true, widthDp = 840, heightDp = 1200, fileName = "attention_840_dark_end")
    }

    /** Legacy aliases kept for continuity with earlier PR screenshots. */
    @Test
    fun attentionPhoneLight_needsYou() {
        captureTop(dark = false, widthDp = 360, heightDp = 640, fileName = "attention_phone_light_needs_you")
    }

    @Test
    fun attentionPhoneDark_needsYou() {
        captureTop(dark = true, widthDp = 360, heightDp = 640, fileName = "attention_phone_dark_needs_you")
    }

    @Test
    fun attentionPhoneLight_selectedBlocked() {
        captureTop(dark = false, widthDp = 360, heightDp = 640, fileName = "attention_phone_light_selected")
    }

    @Test
    fun attentionPhoneDark_selectedBlocked() {
        captureTop(dark = true, widthDp = 360, heightDp = 640, fileName = "attention_phone_dark_selected")
    }

    private fun selectedTopState(): AttentionUiState.Ready {
        val blockedId = seedInbox.sections.orEmpty()
            .first { it.key == AttentionSectionKey.Blocked }
            .items.first().id
        return AttentionUiState.Ready(inbox = seedInbox, selectedItemId = blockedId)
    }

    private fun captureTop(
        dark: Boolean,
        widthDp: Int,
        heightDp: Int,
        fileName: String,
    ) {
        composeRule.setContent {
            RelayTheme(darkTheme = dark) {
                Box(
                    modifier = Modifier
                        .requiredSize(widthDp.dp, heightDp.dp)
                        .testTag("viewport"),
                ) {
                    AttentionScreen(
                        state = selectedTopState(),
                        onRetry = {},
                        onSelectItem = {},
                    )
                }
            }
        }
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("viewport")
            .captureRoboImage("src/test/screenshots/$fileName.png")
    }

    private fun captureEnd(
        dark: Boolean,
        widthDp: Int,
        heightDp: Int,
        fileName: String,
    ) {
        val listState = LazyListState()
        composeRule.setContent {
            RelayTheme(darkTheme = dark) {
                Box(
                    modifier = Modifier
                        .requiredSize(widthDp.dp, heightDp.dp)
                        .testTag("viewport"),
                ) {
                    AttentionScreen(
                        state = selectedTopState(),
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
            if (lastIndex >= 0) {
                runBlocking { listState.scrollToItem(lastIndex) }
            }
        }
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("viewport")
            .captureRoboImage("src/test/screenshots/$fileName.png")
    }
}
