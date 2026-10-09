package app.relay.ui.attention

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.requiredHeight
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import app.relay.data.AttentionSection
import app.relay.data.AttentionSectionKey
import app.relay.data.FixtureLoader
import app.relay.data.InboxCounters
import app.relay.data.InboxQueryResult
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

/**
 * JVM screenshot captures via Roborazzi (no KVM/emulator required on this Linux VM).
 * Phone + tablet widths; light/dark; needs_you row + selected (non-needs_you) row.
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
    fun attentionPhoneLight_needsYou() {
        capture(dark = false, widthDp = 360, state = ready(seedInbox), fileName = "attention_phone_light_needs_you")
    }

    @Test
    fun attentionPhoneDark_needsYou() {
        capture(dark = true, widthDp = 360, state = ready(seedInbox), fileName = "attention_phone_dark_needs_you")
    }

    @Test
    fun attentionPhoneLight_selectedBlocked() {
        capture(dark = false, widthDp = 360, state = selectedBlockedState(), fileName = "attention_phone_light_selected")
    }

    @Test
    fun attentionPhoneDark_selectedBlocked() {
        capture(dark = true, widthDp = 360, state = selectedBlockedState(), fileName = "attention_phone_dark_selected")
    }

    private fun ready(inbox: InboxQueryResult, selectedId: String? = null): AttentionUiState.Ready =
        AttentionUiState.Ready(inbox = inbox, selectedItemId = selectedId)

    /** Select blocked row (raised + 1dp control border, r8) while keeping seed sections. */
    private fun selectedBlockedState(): AttentionUiState.Ready {
        val blockedId = seedInbox.sections.orEmpty()
            .first { it.key == AttentionSectionKey.Blocked }
            .items.first().id
        return ready(seedInbox, selectedId = blockedId)
    }

    private fun capture(
        dark: Boolean,
        widthDp: Int,
        state: AttentionUiState.Ready,
        fileName: String,
    ) {
        composeRule.setContent {
            RelayTheme(darkTheme = dark) {
                AttentionScreen(
                    state = state,
                    onRetry = {},
                    onSelectItem = {},
                )
            }
        }
        composeRule.onRoot().captureRoboImage("src/test/screenshots/$fileName.png")
    }
}
