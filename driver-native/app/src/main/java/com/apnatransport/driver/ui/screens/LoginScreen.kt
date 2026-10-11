package com.apnatransport.driver.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.apnatransport.driver.auth.AuthRepository
import kotlinx.coroutines.launch

// First real screen -- proves the native auth path end-to-end against the
// same Firestore driver accounts the hybrid app already uses (same
// pinAuthEmail/pinToPassword scheme, see AuthRepository). Deliberately
// minimal (no KYC/registration flow yet -- see AuthRepository's TODO) for
// this scaffolding pass; the point here is proving sign-in works, not a
// finished screen.
@Composable
fun LoginScreen(
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
            Text("Apna Driver", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(24.dp))
            OutlinedTextField(
                value = mobile,
                onValueChange = { if (it.length <= 10) mobile = it.filter(Char::isDigit) },
                label = { Text("Mobile number") },
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Phone),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = pin,
                onValueChange = { if (it.length <= 4) pin = it.filter(Char::isDigit) },
                label = { Text("4-digit PIN") },
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
                        val result = authRepository.signIn(mobile, pin)
                        loading = false
                        result.onSuccess { onSignedIn() }
                            .onFailure { error = it.message ?: "Sign-in failed" }
                    }
                },
                enabled = !loading && mobile.length == 10 && pin.length == 4,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (loading) {
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Text("Log In")
                }
            }
        }
    }
}
