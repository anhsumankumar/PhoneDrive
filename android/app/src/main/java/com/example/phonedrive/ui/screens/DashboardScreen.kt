package com.example.phonedrive.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.phonedrive.R
import com.example.phonedrive.data.db.AppDatabaseHelper
import com.example.phonedrive.data.security.SecurityManager
import com.example.phonedrive.data.storage.StorageRepository
import com.example.phonedrive.service.NetworkMonitor
import com.example.phonedrive.service.PhoneDriveServerService
import com.example.phonedrive.theme.EmeraldSuccess
import com.example.phonedrive.theme.IndigoPrimary
import com.example.phonedrive.theme.RoseError
import com.example.phonedrive.theme.SkyBluePrimary
import com.example.phonedrive.theme.ThemeManager
import com.example.phonedrive.ui.components.QRCodeGenerator

@Composable
fun DashboardScreen(
    onNavigateToFolders: () -> Unit,
    onNavigateToSecurity: () -> Unit
) {
    val context = LocalContext.current
    val serverState by PhoneDriveServerService.serverState.collectAsState()
    val scrollState = rememberScrollState()

    val dbHelper = remember { AppDatabaseHelper.getInstance(context) }
    val securityManager = remember { SecurityManager.getInstance(context) }
    val storageRepository = remember { StorageRepository.getInstance(context) }

    var sharedFolderCount by remember { mutableStateOf(0) }
    var activeSessionsCount by remember { mutableStateOf(0) }
    var currentPairingToken by remember { mutableStateOf<String?>(null) }
    val isWifi = remember { NetworkMonitor.isWifiConnected(context) }

    LaunchedEffect(Unit) {
        sharedFolderCount = storageRepository.getAuthorizedFolders().size
        activeSessionsCount = dbHelper.getAllActiveSessions().size
    }

    // Refresh pairing token when server starts
    LaunchedEffect(serverState.isRunning) {
        if (serverState.isRunning) {
            val token = dbHelper.createPairingToken()
            currentPairingToken = token.token
        } else {
            currentPairingToken = null
        }
    }

    val accessUrl = serverState.url ?: "http://${NetworkMonitor.getLocalIpAddress(context) ?: "127.0.0.1"}:8080"
    val qrUrl = if (currentPairingToken != null && serverState.isRunning) {
        "$accessUrl/?pair=$currentPairingToken"
    } else {
        accessUrl
    }

    val qrBitmap = remember(qrUrl, serverState.isRunning) {
        if (serverState.isRunning) {
            QRCodeGenerator.generateQrBitmap(context, qrUrl, 512)
        } else null
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // App Title & Tagline with Official Brand Icon & Day/Night Toggle
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.weight(1f)
            ) {
                Image(
                    painter = painterResource(id = R.drawable.app_icon),
                    contentDescription = "PhoneDrive Logo",
                    modifier = Modifier
                        .size(52.dp)
                        .clip(RoundedCornerShape(12.dp))
                )
                Column {
                    Text(
                        text = "PhoneDrive",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Text(
                        text = "Your Personal Cloud Drive",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            // Theme Toggle (Day / Night)
            IconButton(
                onClick = { com.example.phonedrive.theme.ThemeManager.toggleTheme(context) },
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp))
            ) {
                Icon(
                    imageVector = if (com.example.phonedrive.theme.ThemeManager.isDarkMode) Icons.Default.LightMode else Icons.Default.DarkMode,
                    contentDescription = "Theme Toggle",
                    tint = if (com.example.phonedrive.theme.ThemeManager.isDarkMode) Color(0xFFFBBF24) else SkyBluePrimary,
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        // Server Status Card
        Card(
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(24.dp))
        ) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(12.dp)
                                .clip(CircleShape)
                                .background(if (serverState.isRunning) EmeraldSuccess else Color.Gray)
                        )
                        Text(
                            text = if (serverState.isRunning) "SERVER ACTIVE" else "SERVER STOPPED",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.sp,
                            color = if (serverState.isRunning) EmeraldSuccess else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    // Network badge
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.padding(start = 8.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                imageVector = if (isWifi) Icons.Default.Wifi else Icons.Default.WifiOff,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                                tint = if (isWifi) EmeraldSuccess else RoseError
                            )
                            Text(
                                text = if (isWifi) "Local Wi-Fi" else "No Wi-Fi",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                // Start / Stop Server Button
                Button(
                    onClick = {
                        if (serverState.isRunning) {
                            PhoneDriveServerService.stop(context)
                        } else {
                            if (!securityManager.isPasswordSet()) {
                                onNavigateToSecurity()
                                Toast.makeText(context, "Please set a master password first", Toast.LENGTH_LONG).show()
                            } else {
                                PhoneDriveServerService.start(context, 8080)
                            }
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (serverState.isRunning) RoseError else IndigoPrimary
                    )
                ) {
                    Icon(
                        imageVector = if (serverState.isRunning) Icons.Default.Stop else Icons.Default.PlayArrow,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (serverState.isRunning) "Stop Server" else "Start Personal Server",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                if (serverState.error != null) {
                    Text(
                        text = serverState.error ?: "",
                        color = RoseError,
                        fontSize = 12.sp
                    )
                }
            }
        }

        // Live Connection Address & QR Code
        if (serverState.isRunning) {
            Card(
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(24.dp))
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Connect from Browser",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        IconButton(
                            onClick = {
                                val newToken = dbHelper.createPairingToken()
                                currentPairingToken = newToken.token
                                Toast.makeText(context, "Fresh pairing token generated", Toast.LENGTH_SHORT).show()
                            }
                        ) {
                            Icon(
                                imageVector = Icons.Default.Refresh,
                                contentDescription = "Refresh QR Token",
                                modifier = Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                    }

                    // QR Code Display
                    if (qrBitmap != null) {
                        Box(
                            modifier = Modifier
                                .size(230.dp)
                                .shadow(12.dp, RoundedCornerShape(20.dp), spotColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.25f))
                                .clip(RoundedCornerShape(20.dp))
                                .background(Color.White)
                                .border(1.5.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.25f), RoundedCornerShape(20.dp))
                                .padding(12.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Image(
                                bitmap = qrBitmap,
                                contentDescription = "Pairing QR Code",
                                modifier = Modifier.fillMaxSize()
                            )
                        }
                    }

                    Text(
                        text = "Scan with your laptop camera or open address:",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    // Clickable & Copyable Address Pill
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = accessUrl,
                                fontSize = 14.sp,
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Row {
                                IconButton(
                                    onClick = {
                                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                        clipboard.setPrimaryClip(ClipData.newPlainText("PhoneDrive URL", accessUrl))
                                        Toast.makeText(context, "URL copied to clipboard", Toast.LENGTH_SHORT).show()
                                    },
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.ContentCopy,
                                        contentDescription = "Copy URL",
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                                IconButton(
                                    onClick = {
                                        val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(accessUrl))
                                        context.startActivity(browserIntent)
                                    },
                                    modifier = Modifier.size(32.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.OpenInBrowser,
                                        contentDescription = "Open in Browser",
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // Quick Stats Tiles
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Shared Folders Tile
            Card(
                onClick = onNavigateToFolders,
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier
                    .weight(1f)
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(20.dp))
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(
                        imageVector = Icons.Default.Folder,
                        contentDescription = null,
                        tint = IndigoPrimary,
                        modifier = Modifier.size(24.dp)
                    )
                    Text(
                        text = "$sharedFolderCount Folders",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "Authorized storage",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Security Tile
            Card(
                onClick = onNavigateToSecurity,
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier
                    .weight(1f)
                    .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(20.dp))
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(
                        imageVector = Icons.Default.Shield,
                        contentDescription = null,
                        tint = EmeraldSuccess,
                        modifier = Modifier.size(24.dp)
                    )
                    Text(
                        text = "$activeSessionsCount Sessions",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "Active device pairing",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}
