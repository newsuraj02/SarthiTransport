package com.apnatransport.mobile.ui.theme

import androidx.compose.ui.graphics.Color

// Same palette as src/App.jsx's `const C = {...}` design tokens -- kept in
// sync manually so the native app doesn't visually diverge from the brand
// every driver/customer already knows from the hybrid app. See that
// object's own comment: bright/high-visibility flat palette, legible in
// direct outdoor sunlight, solid fills only, no gradients/pastel tints.
val AppBg = Color(0xFFFFFFFF) // C.bg / C.paper
val Ink = Color(0xFF000000) // C.ink
val InkSoft = Color(0xFF333333) // C.inkSoft
val Line = Color(0xFF000000) // C.line
val Marigold = Color(0xFFFFCC00)
val MarigoldDeep = Color(0xFFFF6600)
val Safety = Color(0xFFFF2A2A)
val Success = Color(0xFF00A854) // also C.metallicGreen -- primary action buttons
val Navy = Color(0xFF0052CC)
