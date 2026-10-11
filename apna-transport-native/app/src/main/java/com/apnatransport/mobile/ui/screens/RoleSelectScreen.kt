package com.apnatransport.mobile.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.apnatransport.mobile.auth.Role

// Mirrors the hybrid app's RoleSelect screen (src/App.jsx) minus the
// Admin option -- Admin stays on the hybrid app indefinitely per the
// decision to keep this native rewrite to Customer + Driver only.
@Composable
fun RoleSelectScreen(onSelect: (Role) -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            Modifier.padding(24.dp).widthIn(max = 360.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Apna Transport", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(32.dp))
            Button(
                onClick = { onSelect(Role.DRIVER) },
                modifier = Modifier.fillMaxWidth().height(56.dp),
            ) {
                Text("I'm a Driver")
            }
            Spacer(Modifier.height(16.dp))
            OutlinedButton(
                onClick = { onSelect(Role.CUSTOMER) },
                modifier = Modifier.fillMaxWidth().height(56.dp),
            ) {
                Text("I'm a Customer")
            }
        }
    }
}
