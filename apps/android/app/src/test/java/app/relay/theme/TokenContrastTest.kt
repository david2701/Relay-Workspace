package app.relay.theme

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TokenContrastTest {
    @Test
    fun yellowFillUsesOnHlInk() {
        listOf(RelayColorTokens.Light, RelayColorTokens.Dark).forEach { tokens ->
            assertEquals(0xFFF8ED60L and 0xFFFFFFFFL, colorArgb(tokens.hl))
            assertEquals(0xFF1F1D17L and 0xFFFFFFFFL, colorArgb(tokens.onHl))
            assertTrue(ContrastMath.contrastRatio(tokens.onHl, tokens.hl) >= 4.5)
        }
        assertEquals(8.0f, RelayDimens.selectedRowRadius.value)
        assertEquals(2.0f, RelayDimens.needsYouRuleWidth.value)
        assertEquals(1.0f, RelayDimens.selectedRowBorderWidth.value)
    }

    @Test
    fun selectedRowIsNeutralRaisedNotAccentTint() {
        val light = RelayColorTokens.Light
        val dark = RelayColorTokens.Dark
        assertEquals(light.raised, light.selectedRowFill)
        assertEquals(dark.raised, dark.selectedRowFill)
        assertNotEquals(light.accentTint, light.selectedRowFill)
        assertNotEquals(dark.accentTint, dark.selectedRowFill)
        assertEquals(0xFFFBF0AEL and 0xFFFFFFFFL, colorArgb(light.needsYouRowFill))
        assertEquals(0xFF312C0AL and 0xFFFFFFFFL, colorArgb(dark.needsYouRowFill))
        assertEquals(0xFF8F791BL and 0xFFFFFFFFL, colorArgb(light.attentionRule))
        assertEquals(0xFFF8ED60L and 0xFFFFFFFFL, colorArgb(dark.attentionRule))
    }

    @Test
    fun lightOchresAndDarkYellowMeetSpecFloors() {
        val light = RelayColorTokens.Light
        assertTrue(ContrastMath.contrastRatio(light.accentInk, light.paper) >= 4.5)
        assertTrue(ContrastMath.contrastRatio(light.accentInk, light.raised) >= 4.5)
        assertTrue(ContrastMath.contrastRatio(light.accent, light.paper) >= 3.0)
        assertTrue(ContrastMath.contrastRatio(light.ink, light.paper) >= 4.5)
        assertTrue(ContrastMath.contrastRatio(light.control, light.raised) >= 3.0)
        val dark = RelayColorTokens.Dark
        assertTrue(ContrastMath.contrastRatio(dark.accentInk, dark.paper) >= 4.5)
        assertTrue(ContrastMath.contrastRatio(dark.ink, dark.paper) >= 4.5)
        assertTrue(ContrastMath.contrastRatio(dark.control, dark.raised) >= 3.0)
        assertTrue(ContrastMath.contrastRatio(light.ink, light.accentTint) >= 4.5)
        assertTrue(ContrastMath.contrastRatio(dark.ink, dark.accentTint) >= 4.5)
        assertTrue(ContrastMath.contrastRatio(light.inkMuted, light.accentTint) >= 4.5)
        assertTrue(ContrastMath.contrastRatio(dark.inkMuted, dark.accentTint) >= 4.5)
    }

    private fun colorArgb(color: Color): Long {
        val a = (color.alpha * 255.0f + 0.5f).toInt() and 0xFF
        val r = (color.red * 255.0f + 0.5f).toInt() and 0xFF
        val g = (color.green * 255.0f + 0.5f).toInt() and 0xFF
        val b = (color.blue * 255.0f + 0.5f).toInt() and 0xFF
        return (a.toLong() shl 24) or (r.toLong() shl 16) or (g.toLong() shl 8) or b.toLong()
    }
}
