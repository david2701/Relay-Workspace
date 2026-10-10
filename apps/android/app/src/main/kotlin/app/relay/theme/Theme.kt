package app.relay.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

val LocalRelayColors = staticCompositionLocalOf { RelayColorTokens.Light }

val LocalRelayDarkTheme = staticCompositionLocalOf { false }

@Composable
fun RelayTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val tokens = if (darkTheme) RelayColorTokens.Dark else RelayColorTokens.Light
    val colorScheme = if (darkTheme) {
        darkColorScheme(
            primary = tokens.hl,
            onPrimary = tokens.onHl,
            secondary = tokens.accent,
            onSecondary = tokens.onAccent,
            tertiary = tokens.accentInk,
            onTertiary = tokens.paper,
            background = tokens.paper,
            onBackground = tokens.ink,
            surface = tokens.raised,
            onSurface = tokens.ink,
            surfaceVariant = tokens.sunken,
            onSurfaceVariant = tokens.ink2,
            outline = tokens.control,
            outlineVariant = tokens.line,
            error = tokens.crit,
            onError = tokens.paper,
            primaryContainer = tokens.accentTint,
            onPrimaryContainer = tokens.ink,
        )
    } else {
        lightColorScheme(
            primary = tokens.hl,
            onPrimary = tokens.onHl,
            secondary = tokens.accent,
            onSecondary = Color(0xFFFFFEFD),
            tertiary = tokens.accentInk,
            onTertiary = tokens.paper,
            background = tokens.paper,
            onBackground = tokens.ink,
            surface = tokens.raised,
            onSurface = tokens.ink,
            surfaceVariant = tokens.sunken,
            onSurfaceVariant = tokens.ink2,
            outline = tokens.control,
            outlineVariant = tokens.line,
            error = tokens.crit,
            onError = Color(0xFFFFFEFD),
            primaryContainer = tokens.accentTint,
            onPrimaryContainer = tokens.ink,
        )
    }
    CompositionLocalProvider(
        LocalRelayColors provides tokens,
        LocalRelayDarkTheme provides darkTheme,
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = RelayTypography,
            content = content,
        )
    }
}

object RelayThemeTokens {
    val colors: RelayColorTokens
        @Composable
        @ReadOnlyComposable
        get() = LocalRelayColors.current

    val isDark: Boolean
        @Composable
        @ReadOnlyComposable
        get() = LocalRelayDarkTheme.current
}
