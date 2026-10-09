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
 * Widths: 360 / 411 / 600 / 840; light/dark; Attention list, detail, and `_end` (24 items).
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

    private val longInbox by lazy {
        AttentionFabOverlapTest.longInbox(itemCount = 24)
    }

    @Test
    fun attention_360_light() {
        captureList(dark = false, widthDp = 360, heightDp = 780, fileName = "attention_360_light")
    }

    @Test
    fun attention_360_dark() {
        captureList(dark = true, widthDp = 360, heightDp = 780, fileName = "attention_360_dark")
    }

    @Test
    fun attention_411_light() {
        captureList(dark = false, widthDp = 411, heightDp = 915, fileName = "attention_411_light")
    }

    @Test
    fun attention_411_dark() {
        captureList(dark = true, widthDp = 411, heightDp = 915, fileName = "attention_411_dark")
    }

    @Test
    fun attention_600_light() {
        captureList(dark = false, widthDp = 600, heightDp = 900, fileName = "attention_600_light")
    }

    @Test
    fun attention_600_dark() {
        captureList(dark = true, widthDp = 600, heightDp = 900, fileName = "attention_600_dark")
    }

    @Test
    fun attention_840_light() {
        captureList(dark = false, widthDp = 840, heightDp = 1200, fileName = "attention_840_light")
    }

    @Test
    fun attention_840_dark() {
        captureList(dark = true, widthDp = 840, heightDp = 1200, fileName = "attention_840_dark")
    }

    @Test
    fun detail_360_light() {
        captureDetail(dark = false, widthDp = 360, heightDp = 780, fileName = "detail_360_light")
    }

    @Test
    fun detail_360_dark() {
        captureDetail(dark = true, widthDp = 360, heightDp = 780, fileName = "detail_360_dark")
    }

    @Test
    fun detail_600_light() {
        captureDetail(dark = false, widthDp = 600, heightDp = 900, fileName = "detail_600_light")
    }

    @Test
    fun detail_600_dark() {
        captureDetail(dark = true, widthDp = 600, heightDp = 900, fileName = "detail_600_dark")
    }

    @Test
    fun detail_840_light() {
        captureDetail(dark = false, widthDp = 840, heightDp = 1200, fileName = "detail_840_light")
    }

    @Test
    fun detail_840_dark() {
        captureDetail(dark = true, widthDp = 840, heightDp = 1200, fileName = "detail_840_dark")
    }

    @Test
    fun attention_360_light_end() {
        captureEnd(dark = false, widthDp = 360, heightDp = 780, fileName = "attention_360_light_end")
    }

    @Test
    fun attention_360_dark_end() {
        captureEnd(dark = true, widthDp = 360, heightDp = 780, fileName = "attention_360_dark_end")
    }

    @Test
    fun attention_600_light_end() {
        captureEnd(dark = false, widthDp = 600, heightDp = 900, fileName = "attention_600_light_end")
    }

    @Test
    fun attention_600_dark_end() {
        captureEnd(dark = true, widthDp = 600, heightDp = 900, fileName = "attention_600_dark_end")
    }

    @Test
    fun attention_840_light_end() {
        captureEnd(dark = false, widthDp = 840, heightDp = 1200, fileName = "attention_840_light_end")
    }

    @Test
    fun attention_840_dark_end() {
        captureEnd(dark = true, widthDp = 840, heightDp = 1200, fileName = "attention_840_dark_end")
    }

    private fun readyState(selectedItemId: String? = null): AttentionUiState.Ready {
        return AttentionUiState.Ready(
            inbox = seedInbox,
            selectedItemId = selectedItemId,
            agentsById = screenshotAgentsById(),
            lastSyncedAtMillis = ScreenshotSyncedAtMillis,
            presentationNowMillis = ScreenshotNowMillis,
        )
    }

    private fun selectedNeedsYouState(): AttentionUiState.Ready {
        val needsYouId = seedInbox.sections.orEmpty()
            .first { it.key == AttentionSectionKey.NeedsYou }
            .items.first().id
        return readyState(selectedItemId = needsYouId)
    }

    private fun longListState(): AttentionUiState.Ready =
        AttentionUiState.Ready(
            inbox = longInbox,
            agentsById = screenshotAgentsById(),
            lastSyncedAtMillis = ScreenshotSyncedAtMillis,
            presentationNowMillis = ScreenshotNowMillis,
        )

    private fun captureList(dark: Boolean, widthDp: Int, heightDp: Int, fileName: String) {
        // Preselect only at expanded width so list+detail render side by side.
        // On compact/medium, a selection would navigate away from the list pane.
        val state = if (widthDp >= 840) {
            selectedNeedsYouState()
        } else {
            readyState()
        }
        composeRule.captureAttention(
            dark = dark,
            widthDp = widthDp,
            heightDp = heightDp,
            state = state,
            fileName = fileName,
        )
    }

    private fun captureDetail(dark: Boolean, widthDp: Int, heightDp: Int, fileName: String) {
        composeRule.captureAttentionDetail(
            dark = dark,
            widthDp = widthDp,
            heightDp = heightDp,
            state = selectedNeedsYouState(),
            fileName = fileName,
        )
    }

    private fun captureEnd(dark: Boolean, widthDp: Int, heightDp: Int, fileName: String) {
        composeRule.captureAttention(
            dark = dark,
            widthDp = widthDp,
            heightDp = heightDp,
            state = longListState(),
            fileName = fileName,
            listState = LazyListState(),
            scrollToEnd = true,
        )
    }
}
