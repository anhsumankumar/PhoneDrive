package com.example.phonedrive.ui.main

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.ui.res.painterResource
import com.example.phonedrive.R
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.example.phonedrive.data.security.SecurityManager
import com.example.phonedrive.theme.IndigoPrimary
import com.example.phonedrive.ui.screens.DashboardScreen
import com.example.phonedrive.ui.screens.FoldersScreen
import com.example.phonedrive.ui.screens.SecurityScreen
import com.example.phonedrive.ui.screens.SettingsScreen

enum class NavTab(val title: String, val icon: ImageVector) {
    DASHBOARD("Dashboard", Icons.Default.Storage),
    FOLDERS("Folders", Icons.Default.Folder),
    SECURITY("Security", Icons.Default.Shield),
    SETTINGS("Settings", Icons.Default.Settings)
}

@Composable
fun MainScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var selectedTab by remember { mutableStateOf(NavTab.DASHBOARD) }
    val securityManager = remember { SecurityManager.getInstance(context) }
    var showOnboarding by remember { mutableStateOf(!securityManager.isPasswordSet()) }

    // Request notification permission for Android 13+
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { /* Permission result handled */ }

    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val hasPermission = ContextCompat.checkSelfPermission(
                context, Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!hasPermission) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                tonalElevation = 8.dp
            ) {
                NavTab.values().forEach { tab ->
                    val isSelected = selectedTab == tab
                    NavigationBarItem(
                        selected = isSelected,
                        onClick = { selectedTab = tab },
                        icon = {
                            Icon(
                                imageVector = tab.icon,
                                contentDescription = tab.title,
                                modifier = Modifier.size(22.dp)
                            )
                        },
                        label = {
                            Text(
                                text = tab.title,
                                fontSize = 11.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                            )
                        },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = IndigoPrimary,
                            selectedTextColor = IndigoPrimary,
                            indicatorColor = IndigoPrimary.copy(alpha = 0.15f),
                            unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                            unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    )
                }
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            when (selectedTab) {
                NavTab.DASHBOARD -> DashboardScreen(
                    onNavigateToFolders = { selectedTab = NavTab.FOLDERS },
                    onNavigateToSecurity = { selectedTab = NavTab.SECURITY }
                )
                NavTab.FOLDERS -> FoldersScreen()
                NavTab.SECURITY -> SecurityScreen()
                NavTab.SETTINGS -> SettingsScreen()
            }
        }
    }

    // Onboarding Dialog for First Launch
    if (showOnboarding) {
        AlertDialog(
            onDismissRequest = { showOnboarding = false },
            icon = {
                Image(
                    painter = painterResource(id = R.drawable.app_icon),
                    contentDescription = "PhoneDrive Logo",
                    modifier = Modifier.size(56.dp)
                )
            },
            title = {
                Text("Welcome to PhoneDrive", fontWeight = FontWeight.Bold)
            },
            text = {
                Text(
                    "PhoneDrive transforms your phone into your personal drive accessible over your local Wi-Fi.\n\n" +
                    "To secure your files, please set a master password and select the folders you want to make accessible.",
                    fontSize = 13.sp,
                    lineHeight = 18.sp
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showOnboarding = false
                        selectedTab = NavTab.SECURITY
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = IndigoPrimary)
                ) {
                    Text("Set Password & Get Started")
                }
            },
            dismissButton = {
                TextButton(onClick = { showOnboarding = false }) {
                    Text("Later")
                }
            }
        )
    }
}
