package app.relay.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Design tokens from ui-spec-v0.3 §9.5 (yellow accent, r8 selected-row revision).
 * `--hl` (#F8ED60) is fill-only with `--on-hl` (#1F1D17) on top.
 * Selected row: elevated `--raised` + 1 dp `--control` border + 8 dp radius (not accent tint).
 * needs_you row: `--accent-tint` + 2 dp `--attention-rule`.
 * Light `--shadow-float`: two layers (web `tokens.css`); dark: none.
 */
data class RelayColorTokens(
    val paper: Color,
    val raised: Color,
    val sunken: Color,
    val line: Color,
    val lineStrong: Color,
    val control: Color,
    val ink: Color,
    val ink2: Color,
    val inkMuted: Color,
    val hl: Color,
    val onHl: Color,
    val accent: Color,
    val accentInk: Color,
    val accentTint: Color,
    val onAccent: Color,
    val attentionRule: Color,
    val focus: Color,
    val ok: Color,
    val warn: Color,
    val crit: Color,
) {
    val selectedRowFill: Color get() = raised
    val needsYouRowFill: Color get() = accentTint

    companion object {
        val Light = RelayColorTokens(
            paper = Color(0xFFFBFAF7),
            raised = Color(0xFFFFFEFD),
            sunken = Color(0xFFF4F2EE),
            line = Color(0xFFE2DFDA),
            lineStrong = Color(0xFFC1BDB7),
            control = Color(0xFF83807A),
            ink = Color(0xFF1F1D17),
            ink2 = Color(0xFF504D46),
            inkMuted = Color(0xFF6B6963),
            hl = Color(0xFFF8ED60),
            onHl = Color(0xFF1F1D17),
            accent = Color(0xFF8F791B),
            accentInk = Color(0xFF725F02),
            accentTint = Color(0xFFFBF0AE),
            onAccent = Color(0xFF1F1D17),
            attentionRule = Color(0xFF8F791B),
            focus = Color(0xFF725F02),
            ok = Color(0xFF317A45),
            warn = Color(0xFF925A1A),
            crit = Color(0xFFB6322D),
        )

        val Dark = RelayColorTokens(
            paper = Color(0xFF141310),
            raised = Color(0xFF1B1916),
            sunken = Color(0xFF0E0D0A),
            line = Color(0xFF302E29),
            lineStrong = Color(0xFF4A4742),
            control = Color(0xFF6B6963),
            ink = Color(0xFFEAE8E3),
            ink2 = Color(0xFFC0BDB8),
            inkMuted = Color(0xFFA19E99),
            hl = Color(0xFFF8ED60),
            onHl = Color(0xFF1F1D17),
            accent = Color(0xFFF8ED60),
            accentInk = Color(0xFFF8ED60),
            accentTint = Color(0xFF312C0A),
            onAccent = Color(0xFF1F1D17),
            attentionRule = Color(0xFFF8ED60),
            focus = Color(0xFFF8ED60),
            ok = Color(0xFF73C385),
            warn = Color(0xFFEBB25F),
            crit = Color(0xFFF87F73),
        )
    }
}

/** One layer of web `--shadow-float` (light only). */
data class ShadowLayer(
    val elevation: Dp,
    val color: Color,
)

object RelayDimens {
    val selectedRowRadius: Dp = 8.dp
    val needsYouRuleWidth: Dp = 2.dp
    val selectedRowBorderWidth: Dp = 1.dp
    val cardRadius: Dp = 12.dp

    /**
     * Extended FAB (~56 dp) + Scaffold FAB edge margin (16 dp).
     * Applied as LazyColumn contentPadding.bottom on top of Scaffold innerPadding
     * (nav bar / gesture insets) — not double-counted with system bars.
     */
    val fabHeight: Dp = 56.dp
    val fabEdgeMargin: Dp = 16.dp
    val fabClearance: Dp = fabHeight + fabEdgeMargin

    /** Dual-pane (840) density — Penpot list/detail breathing room. */
    val dualPaneListSpacing: Dp = 12.dp
    val dualPaneRowVerticalPadding: Dp = 12.dp
    val compactListSpacing: Dp = 12.dp
    val compactRowVerticalPadding: Dp = 12.dp
    val detailHorizontalPadding: Dp = 24.dp
    val detailVerticalPadding: Dp = 16.dp
    val detailSectionSpacing: Dp = 20.dp
    val decisionCardPadding: Dp = 20.dp
}

/**
 * Light selected-row shadow mirrors web:
 * `0 1px 2px rgb(31 29 23 / .06), 0 4px 12px rgb(31 29 23 / .08)`.
 * Dark returns empty (r8: `--shadow-float: none`).
 */
fun selectedRowShadowLayers(darkTheme: Boolean): List<ShadowLayer> {
    if (darkTheme) return emptyList()
    val ink = Color(0xFF1F1D17)
    return listOf(
        ShadowLayer(elevation = 2.dp, color = ink.copy(alpha = 0.06f)),
        ShadowLayer(elevation = 6.dp, color = ink.copy(alpha = 0.08f)),
    )
}

/** WCAG 2.x contrast helpers for token tests. */
object ContrastMath {
    fun relativeLuminance(color: Color): Double {
        fun channel(c: Float): Double {
            val v = c.toDouble()
            return if (v <= 0.03928) v / 12.92 else Math.pow((v + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(color.red) +
            0.7152 * channel(color.green) +
            0.0722 * channel(color.blue)
    }

    fun contrastRatio(foreground: Color, background: Color): Double {
        val l1 = relativeLuminance(foreground)
        val l2 = relativeLuminance(background)
        val lighter = maxOf(l1, l2)
        val darker = minOf(l1, l2)
        return (lighter + 0.05) / (darker + 0.05)
    }
}
