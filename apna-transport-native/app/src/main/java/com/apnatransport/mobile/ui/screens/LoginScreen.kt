package com.apnatransport.mobile.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.font.FontWeight
import com.apnatransport.mobile.auth.AuthRepository
import com.apnatransport.mobile.auth.Role
import com.apnatransport.mobile.ui.theme.Ink
import com.apnatransport.mobile.ui.theme.MonoTextStyle
import com.apnatransport.mobile.ui.theme.Success
import kotlinx.coroutines.launch

// Proves the native auth path end-to-end against the same Firestore
// driver/customer accounts the hybrid app already uses (same
// pinAuthEmail/pinToPassword scheme, see AuthRepository). Deliberately
// minimal (no KYC/registration flow yet, see AuthRepository's TODO) for
// this scaffolding pass; the point here is proving sign-in works, not a
// finished screen. Shared between both roles since the PIN auth scheme
// and form are identical, only the role tag differs.
@Composable
fun LoginScreen(
    role: Role,
    authRepository: AuthRepository,
    onSignedIn: () -> Unit,
) {
    var mobile by remember { mutableStateOf("") }
    var pin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            Modifier.padding(24.dp).widthIn(max = 360.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                if (role == Role.DRIVER) "Apna Driver" else "Apna Transport",
                color = Ink,
                fontWeight = FontWeight.Black,
                style = MaterialTheme.typography.headlineMedium,
            )
            Spacer(Modifier.height(24.dp))
            OutlinedTextField(
                value = mobile,
                onValueChange = { if (it.length <= 10) mobile = it.filter(Char::isDigit) },
                label = { Text("Mobile number") },
                textStyle = MonoTextStyle,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Phone),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = pin,
                onValueChange = { if (it.length <= 4) pin = it.filter(Char::isDigit) },
                label = { Text("4-digit PIN") },
                textStyle = MonoTextStyle,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                visualTransformation = PasswordVisualTransformation(),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            error?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    error = null
                    loading = true
                    scope.launch {
                        val result = authRepository.signIn(mobile, pin, role)
                        loading = false
                        result.onSuccess { onSignedIn() }
                            .onFailure { error = it.message ?: "Sign-in failed" }
                    }
                },
                enabled = !loading && mobile.length == 10 && pin.length == 4,
                colors = ButtonDefaults.buttonColors(containerColor = Success),
                shape = MaterialTheme.shapes.small,
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                if (loading) {
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Text("Log In", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
