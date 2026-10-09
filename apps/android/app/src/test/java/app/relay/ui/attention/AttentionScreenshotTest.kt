package app.relay.ui.attention

import androidx.activity.ComponentActivity
import androidx.compose.foundation.lazy.LazyListState
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

    private fun captureTop(dark: Boolean, widthDp: Int, heightDp: Int, fileName: String) {
        composeRule.captureAttention(
            dark = dark,
            widthDp = widthDp,
            heightDp = heightDp,
            state = selectedTopState(),
            fileName = fileName,
        )
    }

    private fun captureEnd(dark: Boolean, widthDp: Int, heightDp: Int, fileName: String) {
        composeRule.captureAttention(
            dark = dark,
            widthDp = widthDp,
            heightDp = heightDp,
            state = selectedTopState(),
            fileName = fileName,
            listState = LazyListState(),
            scrollToEnd = true,
        )
    }
}
