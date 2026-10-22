package com.example.phonedrive.ui.screens

import android.content.Intent
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.phonedrive.data.model.FolderItem
import com.example.phonedrive.data.storage.StorageRepository
import com.example.phonedrive.theme.EmeraldSuccess
import com.example.phonedrive.theme.IndigoPrimary
import com.example.phonedrive.theme.RoseError
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun FoldersScreen() {
    val context = LocalContext.current
    val storageRepository = remember { StorageRepository.getInstance(context) }
    var folders by remember { mutableStateOf<List<FolderItem>>(emptyList()) }
    var folderToRevoke by remember { mutableStateOf<FolderItem?>(null) }

    fun refreshFolders() {
        folders = storageRepository.getAuthorizedFolders()
    }

    LaunchedEffect(Unit) {
        refreshFolders()
    }

    // SAF Directory Picker Launcher
    val folderPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocumentTree()
    ) { uri ->
        if (uri != null) {
            try {
                val takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                context.contentResolver.takePersistableUriPermission(uri, takeFlags)
                val item = storageRepository.addAuthorizedFolder(uri)
                if (item != null) {
                    Toast.makeText(context, "Added folder: ${item.name}", Toast.LENGTH_SHORT).show()
                    refreshFolders()
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Failed to grant folder permission: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Header
        Column(modifier = Modifier.padding(top = 8.dp)) {
            Text(
                text = "Authorized Folders",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )
            Text(
                text = "Share existing phone directories without duplicating files",
                fontSize = 13.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        // Add Folder Button
        Button(
            onClick = { folderPickerLauncher.launch(null) },
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(containerColor = IndigoPrimary)
        ) {
            Icon(Icons.Default.CreateNewFolder, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Authorize New Folder", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        }

        // Privacy note banner
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Icon(
                    Icons.Default.Lock,
                    contentDescription = null,
                    tint = IndigoPrimary,
                    modifier = Modifier.size(18.dp)
                )
                Text(
                    text = "Zero Cloud Upload: Files stay on phone storage. Authorized browsers read them via local network streaming.",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    lineHeight = 16.sp
                )
            }
        }

        // Folders List
        if (folders.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        Icons.Default.FolderOpen,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.outline
                    )
                    Text(
                        text = "No folders shared yet",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = "Tap 'Authorize New Folder' to select DCIM, Documents, or Downloads",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(folders, key = { it.id }) { folder ->
                    Card(
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(18.dp))
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                modifier = Modifier.weight(1f),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = IndigoPrimary.copy(alpha = 0.15f),
                                    modifier = Modifier.size(42.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.Folder,
                                            contentDescription = null,
                                            tint = IndigoPrimary,
                                            modifier = Modifier.size(24.dp)
                                        )
                                    }
                                }

                                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(
                                        text = folder.name,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Text(
                                            text = if (folder.isAccessible) "Authorized" else "Reauthorization Needed",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = if (folder.isAccessible) EmeraldSuccess else RoseError
                                        )
                                        Text(
                                            text = "• Added ${SimpleDateFormat("MMM d", Locale.getDefault()).format(Date(folder.createdAt))}",
                                            fontSize = 11.sp,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                            }

                            // Revoke button
                            IconButton(onClick = { folderToRevoke = folder }) {
                                Icon(
                                    Icons.Default.DeleteOutline,
                                    contentDescription = "Revoke access",
                                    tint = RoseError,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // Revoke Confirmation Dialog
    if (folderToRevoke != null) {
        AlertDialog(
            onDismissRequest = { folderToRevoke = null },
            title = { Text("Revoke Folder Access?") },
            text = {
                Text("This will stop sharing \"${folderToRevoke?.name}\" with authorized browsers. The files will remain untouched on your phone.")
            },
            confirmButton = {
                Button(
                    onClick = {
                        val toRevoke = folderToRevoke
                        if (toRevoke != null) {
                            storageRepository.removeAuthorizedFolder(toRevoke.id)
                            refreshFolders()
                            Toast.makeText(context, "Access revoked", Toast.LENGTH_SHORT).show()
                        }
                        folderToRevoke = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = RoseError)
                ) {
                    Text("Revoke Access")
                }
            },
            dismissButton = {
                TextButton(onClick = { folderToRevoke = null }) {
                    Text("Cancel")
                }
            }
        )
    }
}
