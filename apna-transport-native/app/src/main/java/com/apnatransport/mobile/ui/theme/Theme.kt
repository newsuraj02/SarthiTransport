package com.apnatransport.mobile.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Always the one bright/high-visibility scheme, regardless of the device's
// system dark-mode setting -- matching the hybrid app exactly, which has
// no dark variant of its own design tokens (src/App.jsx's `const C`
// comment: built for outdoor sunlight legibility, solid fills only).
// Following the phone's dark mode here would make this app look
// inconsistent with the hybrid app a driver/customer already knows,
// rather than more correct.
private val AppColors = lightColorScheme(
    primary = Navy,
    onPrimary = AppBg,
    secondary = MarigoldDeep,
    onSecondary = AppBg,
    tertiary = Success,
    onTertiary = AppBg,
    error = Safety,
    onError = AppBg,
    background = AppBg,
    onBackground = Ink,
    surface = AppBg,
    onSurface = Ink,
    surfaceVariant = AppBg,
    onSurfaceVariant = InkSoft,
    outline = Line,
)

// rounded-lg (8dp) / rounded-xl (12dp) / rounded-2xl (16dp) in the hybrid
// app's Tailwind classes -- same corner-radius scale, reused consistently
// for small/medium/large components respectively.
private val AppShapes = Shapes(
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
)

// font-semibold/font-bold/font-black in the hybrid app's Tailwind classes
// map to SemiBold/Bold/Black here; body copy otherwise uses the platform
// default (visually close to the hybrid app's "Noto Sans"/system-ui stack
// without bundling a custom font family for this scaffolding pass).
private val AppTypography = Typography().let { base ->
    base.copy(
        headlineMedium = base.headlineMedium.copy(fontWeight = FontWeight.Black),
        titleMedium = base.titleMedium.copy(fontWeight = FontWeight.Bold),
        titleSmall = base.titleSmall.copy(fontWeight = FontWeight.Black),
        bodyMedium = base.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
        bodySmall = base.bodySmall.copy(fontWeight = FontWeight.SemiBold),
        labelLarge = base.labelLarge.copy(fontWeight = FontWeight.Bold),
    )
}

// For mobile numbers/PINs/codes -- the hybrid app's `monoFont` ("JetBrains
// Mono"/Courier New) convention for anything number-like. Android's
// built-in monospace font stands in for JetBrains Mono rather than
// bundling a custom font family for this scaffolding pass.
val MonoTextStyle = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 16.sp)

@Composable
fun ApnaTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = AppColors, shapes = AppShapes, typography = AppTypography, content = content)
}
