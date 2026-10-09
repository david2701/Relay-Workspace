package app.relay.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * Relay type scale for Android adaptive UI (Penpot 840 fidelity).
 *
 * Web §3.3 / §9.5 tokens (14/13/11) stay for row/meta/label. Display and
 * title steps are stepped up to match Penpot's Android headlines — web h1
 * 20 px reads undersized on the 840 dp list+detail shell.
 *
 * | Role          | Size / weight / line-height | Use                          |
 * |---------------|-----------------------------|------------------------------|
 * | display       | 32 sp / 700 / 1.15          | List screen title            |
 * | headline      | 30 sp / 700 / 1.2           | Detail title                 |
 * | title (h2)    | 17 sp / 600 / 1.3           | Section emphasis             |
 * | row           | 16 sp / 600 / 1.35          | List row titles              |
 * | body large    | 17 sp / 500 / 1.45          | Decision-card question       |
 * | body          | 14 sp / 400 / 1.55          | Body copy                    |
 * | meta          | 13 sp / 400 / 1.4           | Secondary / sync / chips     |
 * | label         | 11 sp / 600 / 1.2 (+0.06em) | Section caps                 |
 */
private val relayDisplay = TextStyle(
    fontFamily = FontFamily.SansSerif,
    fontWeight = FontWeight.Bold,
    fontSize = 32.sp,
    lineHeight = (32 * 1.15f).sp,
    letterSpacing = (-0.015).em,
)

private val relayHeadline = TextStyle(
    fontFamily = FontFamily.SansSerif,
    fontWeight = FontWeight.Bold,
    fontSize = 30.sp,
    lineHeight = (30 * 1.2f).sp,
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
    fontWeight = FontWeight.SemiBold,
    fontSize = 16.sp,
    lineHeight = (16 * 1.35f).sp,
    letterSpacing = 0.sp,
)

private val relayBodyLarge = TextStyle(
    fontFamily = FontFamily.SansSerif,
    fontWeight = FontWeight.Medium,
    fontSize = 17.sp,
    lineHeight = (17 * 1.45f).sp,
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
    displayLarge = relayDisplay,
    displayMedium = relayDisplay,
    displaySmall = relayDisplay,
    headlineLarge = relayHeadline,
    headlineMedium = relayDisplay,
    headlineSmall = relayHeadline,
    titleLarge = relayH2,
    titleMedium = relayRow,
    titleSmall = relayRow,
    bodyLarge = relayBodyLarge,
    bodyMedium = relayBody,
    bodySmall = relayMeta,
    labelLarge = relayMeta.copy(fontWeight = FontWeight.Medium),
    labelMedium = relayMeta.copy(fontWeight = FontWeight.Medium),
    labelSmall = relayLabel,
)
