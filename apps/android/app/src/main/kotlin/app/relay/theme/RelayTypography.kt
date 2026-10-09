package app.relay.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * Relay type scale from ui-spec §9.5 / §3.3 (r8 tokens).
 *
 * | Role  | Token         | Size / weight / line-height |
 * |-------|---------------|-----------------------------|
 * | h1    | `--step-h1`   | 20 sp / 600 / 1.25          |
 * | h2    | `--step-h2`   | 17 sp / 600 / 1.3           |
 * | row   | `--step-row`  | 14 sp / 500 / 1.35          |
 * | body  | `--step-body` | 14 sp / 400 / 1.55          |
 * | meta  | `--step-meta` | 13 sp / 400 / 1.4           |
 * | label | `--step-label`| 11 sp / 600 / 1.2 (+0.06em) |
 * | data  | `--step-data` | 12 sp / 400 / 1.3           |
 *
 * Mapped onto M3 slots so existing `MaterialTheme.typography.*` call sites
 * pick up Relay sizes (decision card meta, section labels, bottom bar body).
 */
private val relayH1 = TextStyle(
    fontFamily = FontFamily.SansSerif,
    fontWeight = FontWeight.SemiBold,
    fontSize = 20.sp,
    lineHeight = 25.sp,
    letterSpacing = (-0.01).em,
)

private val relayH2 = TextStyle(
    fontFamily = FontFamily.SansSerif,
    fontWeight = FontWeight.SemiBold,
    fontSize = 17.sp,
    lineHeight = (17 * 1.3f).sp,
    letterSpacing = (-0.005).em,
)

private val relayRow = TextStyle(
    fontFamily = FontFamily.SansSerif,
    fontWeight = FontWeight.Medium,
    fontSize = 14.sp,
    lineHeight = (14 * 1.35f).sp,
    letterSpacing = 0.sp,
)

private val relayBody = TextStyle(
    fontFamily = FontFamily.SansSerif,
    fontWeight = FontWeight.Normal,
    fontSize = 14.sp,
    lineHeight = (14 * 1.55f).sp,
    letterSpacing = 0.sp,
)

private val relayMeta = TextStyle(
    fontFamily = FontFamily.SansSerif,
    fontWeight = FontWeight.Normal,
    fontSize = 13.sp,
    lineHeight = (13 * 1.4f).sp,
    letterSpacing = 0.sp,
)

private val relayLabel = TextStyle(
    fontFamily = FontFamily.SansSerif,
    fontWeight = FontWeight.SemiBold,
    fontSize = 11.sp,
    lineHeight = (11 * 1.2f).sp,
    letterSpacing = 0.06.em,
)

val RelayTypography = Typography(
    displayLarge = relayH1,
    displayMedium = relayH1,
    displaySmall = relayH1,
    headlineLarge = relayH1,
    headlineMedium = relayH1,
    headlineSmall = relayH1,
    titleLarge = relayH2,
    titleMedium = relayRow,
    titleSmall = relayRow,
    bodyLarge = relayBody,
    bodyMedium = relayBody,
    bodySmall = relayMeta,
    labelLarge = relayMeta.copy(fontWeight = FontWeight.Medium),
    labelMedium = relayMeta.copy(fontWeight = FontWeight.Medium),
    labelSmall = relayLabel,
)
