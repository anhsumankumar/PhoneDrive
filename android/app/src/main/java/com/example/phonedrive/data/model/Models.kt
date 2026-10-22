package com.example.phonedrive.data.model

data class FolderItem(
    val id: String,
    val name: String,
    val uriString: String,
    val fileCount: Int = 0,
    val totalBytes: Long = 0L,
    val createdAt: Long = System.currentTimeMillis(),
    val isAccessible: Boolean = true
)

data class FileEntry(
    val id: String,
    val name: String,
    val uriString: String,
    val isDirectory: Boolean,
    val mimeType: String,
    val size: Long,
    val lastModified: Long,
    val parentId: String? = null,
    val folderId: String = ""
)

data class SessionInfo(
    val token: String,
    val deviceId: String,
    val deviceName: String,
    val createdAt: Long = System.currentTimeMillis(),
    val lastActive: Long = System.currentTimeMillis(),
    val isRevoked: Boolean = false
)

data class PairingToken(
    val token: String,
    val createdAt: Long = System.currentTimeMillis(),
    val expiresAt: Long = System.currentTimeMillis() + 120_000L, // 2 minutes TTL
    val isUsed: Boolean = false
)

data class StorageStatus(
    val serverName: String,
    val deviceModel: String,
    val androidVersion: String,
    val totalFolders: Int,
    val totalFiles: Int,
    val totalBytes: Long,
    val freeSpaceBytes: Long,
    val totalSpaceBytes: Long,
    val version: String,
    val uptimeSeconds: Long
)
