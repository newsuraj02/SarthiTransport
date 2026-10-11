package com.apnatransport.mobile.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.apnatransport.mobile.R
import com.apnatransport.mobile.auth.Role
import com.apnatransport.mobile.ui.theme.AppBg
import com.apnatransport.mobile.ui.theme.Ink
import com.apnatransport.mobile.ui.theme.InkSoft
import com.apnatransport.mobile.ui.theme.Navy
import com.apnatransport.mobile.ui.theme.Success

// Near-exact port of the hybrid app's RoleSelect (src/App.jsx) minus the
// Admin option -- Admin stays on the hybrid app indefinitely. Same layout
// (two white cards side by side, 2dp colored border per role, the same
// role-driver.png/role-customer.png brand images), same copy, same
// navy-for-driver/success-green-for-customer color convention.
@Composable
fun RoleSelectScreen(onSelect: (Role) -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            "Choose your app",
            color = InkSoft,
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.height(24.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            RoleCard(
                modifier = Modifier.weight(1f),
                imageRes = R.drawable.role_driver,
                title = "Driver App",
                subtitle = "To find fare & loads",
                borderColor = Navy,
                onClick = { onSelect(Role.DRIVER) },
            )
            RoleCard(
                modifier = Modifier.weight(1f),
                imageRes = R.drawable.role_customer,
                title = "Customer App",
                subtitle = "To book a vehicle",
                borderColor = Success,
                onClick = { onSelect(Role.CUSTOMER) },
            )
        }
    }
}

@Composable
private fun RoleCard(
    modifier: Modifier = Modifier,
    imageRes: Int,
    title: String,
    subtitle: String,
    borderColor: Color,
    onClick: () -> Unit,
) {
    OutlinedCard(
        onClick = onClick,
        modifier = modifier,
        colors = CardDefaults.outlinedCardColors(containerColor = AppBg),
        border = BorderStroke(2.dp, borderColor),
        shape = MaterialTheme.shapes.large,
    ) {
        Column(
            Modifier.padding(16.dp).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(
                painter = painterResource(imageRes),
                contentDescription = null,
                modifier = Modifier.height(64.dp).clip(MaterialTheme.shapes.medium),
            )
            Spacer(Modifier.height(12.dp))
            Text(title, color = Ink, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(4.dp))
            Text(subtitle, color = InkSoft, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
        }
    }
}
