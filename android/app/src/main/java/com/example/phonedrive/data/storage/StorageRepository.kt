package com.example.phonedrive.data.storage

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import androidx.documentfile.provider.DocumentFile
import com.example.phonedrive.data.db.AppDatabaseHelper
import com.example.phonedrive.data.model.FileEntry
import com.example.phonedrive.data.model.FolderItem
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID

class StorageRepository(private val context: Context) {
    private val dbHelper = AppDatabaseHelper.getInstance(context)

    // Fast in-memory cache for category and folder listings
    private val listingCache = java.util.concurrent.ConcurrentHashMap<String, Pair<Long, List<FileEntry>>>()
    private val CACHE_TTL_MS = 60_000L // 60 seconds

    fun invalidateCache() {
        listingCache.clear()
    }

    companion object {
        @Volatile
        private var INSTANCE: StorageRepository? = null

        private val SKIP_DIRS = setOf(
            "android", "lost.dir", ".thumbnails", ".trash", "cache", "caches",
            "data", "obb", ".cache", ".temp", ".git", "node_modules"
        )

        fun getInstance(context: Context): StorageRepository {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: StorageRepository(context.applicationContext).also { INSTANCE = it }
            }
        }
    }

    /**
     * Revalidates and returns all authorized folders.
     */
    fun getAuthorizedFolders(): List<FolderItem> {
        val folders = dbHelper.getAllFolders()
        val contentResolver = context.contentResolver
        val persistedUris = contentResolver.persistedUriPermissions.map { it.uri.toString() }.toSet()

        return folders.map { folder ->
            val hasPermission = persistedUris.contains(folder.uriString)
            val doc = if (hasPermission) {
                try {
                    DocumentFile.fromTreeUri(context, Uri.parse(folder.uriString))
                } catch (e: Exception) {
                    null
                }
            } else null

            val isAccessible = doc != null && doc.canRead()
            folder.copy(isAccessible = isAccessible)
        }
    }

    /**
     * Adds an authorized folder from a SAF Tree URI.
     */
    fun addAuthorizedFolder(treeUri: Uri): FolderItem? {
        val doc = DocumentFile.fromTreeUri(context, treeUri) ?: return null
        val folderName = doc.name ?: "Shared Folder"
        val id = UUID.randomUUID().toString()

        val item = FolderItem(
            id = id,
            name = folderName,
            uriString = treeUri.toString(),
            createdAt = System.currentTimeMillis()
        )
        dbHelper.insertFolder(item)
        invalidateCache()
        return item
    }

    /**
     * Revokes and removes an authorized folder.
     */
    fun removeAuthorizedFolder(folderId: String): Boolean {
        invalidateCache()
        val folder = dbHelper.getFolderById(folderId)
        if (folder != null) {
            try {
                val uri = Uri.parse(folder.uriString)
                context.contentResolver.releasePersistableUriPermission(
                    uri,
                    android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                            android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                )
            } catch (e: Exception) {
                // Ignore release errors if already revoked
            }
        }
        return dbHelper.deleteFolder(folderId)
    }

    /**
     * Lists files within an authorized folder or a subfolder.
     */
    fun listFiles(
        folderId: String?,
        parentId: String?,
        category: String?,
        searchQuery: String?
    ): List<FileEntry> {
        val authorizedFolders = getAuthorizedFolders().filter { it.isAccessible }
        if (authorizedFolders.isEmpty()) {
            return emptyList()
        }

        val isCategoryView = !category.isNullOrEmpty() && category != "all"
        val isGlobalSearch = !searchQuery.isNullOrEmpty() && parentId.isNullOrEmpty()
        val isRootHome = folderId.isNullOrEmpty() && parentId.isNullOrEmpty() && !isCategoryView && searchQuery.isNullOrEmpty()

        // CASE 1: Root Home Screen -> Return Authorized Shared Folders as Top-Level Directories!
        if (isRootHome) {
            return authorizedFolders.map { folder ->
                FileEntry(
                    id = "folder_${folder.id}",
                    name = folder.name,
                    uriString = folder.uriString,
                    isDirectory = true,
                    mimeType = "inode/directory",
                    size = 0L,
                    lastModified = folder.createdAt,
                    parentId = null,
                    folderId = folder.id
                )
            }.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.name })
        }

        // Target folders: if folderId is specified, query only that folder, else all authorized folders
        val effectiveFolderId = if (!folderId.isNullOrEmpty()) {
            folderId
        } else if (!parentId.isNullOrEmpty() && parentId.startsWith("folder_")) {
            parentId.removePrefix("folder_")
        } else {
            null
        }

        // Check in-memory fast cache
        val cacheKey = "${effectiveFolderId ?: ""}:${parentId ?: ""}:${category ?: ""}:${searchQuery ?: ""}"
        val cached = listingCache[cacheKey]
        if (cached != null && (System.currentTimeMillis() - cached.first < CACHE_TTL_MS)) {
            return cached.second
        }

        val targetFolders = if (!effectiveFolderId.isNullOrEmpty()) {
            authorizedFolders.filter { it.id == effectiveFolderId }
        } else {
            authorizedFolders
        }

        val results = mutableListOf<FileEntry>()

        // CASE 2: Category Views (Photos, Videos, Audio, Documents, Favorites, Recent) or Global Search:
        // Recursively search folders for matching non-directory media files using high-speed SAF query!
        if (isCategoryView || isGlobalSearch) {
            val watchlistSet = if (category?.equals("favorites", ignoreCase = true) == true) {
                dbHelper.getAllWatchlistIds()
            } else {
                emptySet()
            }

            for (folder in targetFolders) {
                val treeUri = try {
                    Uri.parse(folder.uriString)
                } catch (e: Exception) {
                    null
                } ?: continue

                val rootDocId = try {
                    if (!parentId.isNullOrEmpty() && !parentId.startsWith("folder_")) {
                        val pUri = decodeUri(parentId)
                        if (pUri != null) DocumentsContract.getDocumentId(pUri) else DocumentsContract.getTreeDocumentId(treeUri)
                    } else {
                        DocumentsContract.getTreeDocumentId(treeUri)
                    }
                } catch (e: Exception) {
                    DocumentsContract.getTreeDocumentId(treeUri)
                }

                scanFilesFast(treeUri, rootDocId, folder.id, category, searchQuery, depth = 0, maxDepth = 2, results, watchlistSet)
            }

            // In category view, sort newest files first and cache
            val sortedResults = results.sortedByDescending { it.lastModified }
            listingCache[cacheKey] = Pair(System.currentTimeMillis(), sortedResults)
            return sortedResults
        }

        // CASE 3: Normal directory browsing:
        // List immediate children of the parent directory
        for (folder in targetFolders) {
            val rootDoc = try {
                DocumentFile.fromTreeUri(context, Uri.parse(folder.uriString))
            } catch (e: Exception) {
                null
            } ?: continue

            val parentDoc = if (!parentId.isNullOrEmpty() && !parentId.startsWith("folder_")) {
                findDocumentByEncodedUri(parentId, rootDoc)
            } else {
                rootDoc
            } ?: continue

            val files = try {
                parentDoc.listFiles()
            } catch (e: Exception) {
                emptyArray()
            }

            for (file in files) {
                val isDir = file.isDirectory
                val name = file.name ?: "Untitled"
                val mime = file.type ?: (if (isDir) "inode/directory" else "application/octet-stream")
                val size = if (isDir) 0L else file.length()
                val lastModified = file.lastModified()
                val encodedId = encodeUri(file.uri)

                if (!searchQuery.isNullOrEmpty()) {
                    if (!name.contains(searchQuery, ignoreCase = true)) {
                        continue
                    }
                }

                results.add(
                    FileEntry(
                        id = encodedId,
                        name = name,
                        uriString = file.uri.toString(),
                        isDirectory = isDir,
                        mimeType = mime,
                        size = size,
                        lastModified = lastModified,
                        parentId = parentId,
                        folderId = folder.id
                    )
                )
            }
        }

        // Sort: directories first, then alphabetically and cache
        val sortedResults = results.sortedWith(
            compareBy<FileEntry> { !it.isDirectory }.thenBy(String.CASE_INSENSITIVE_ORDER) { it.name }
        )
        listingCache[cacheKey] = Pair(System.currentTimeMillis(), sortedResults)
        return sortedResults
    }

    private fun scanFilesFast(
        treeUri: Uri,
        parentDocId: String,
        folderId: String,
        category: String?,
        searchQuery: String?,
        depth: Int,
        maxDepth: Int,
        results: MutableList<FileEntry>,
        watchlistSet: Set<String> = emptySet()
    ) {
        if (depth > maxDepth || results.size >= 500) return

        val childrenUri = try {
            DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId)
        } catch (e: Exception) {
            return
        }

        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED
        )

        try {
            context.contentResolver.query(childrenUri, projection, null, null, null)?.use { cursor ->
                val idIdx = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                val nameIdx = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                val mimeIdx = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
                val sizeIdx = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE)
                val modIdx = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)

                val subDirsToScan = mutableListOf<String>()

                while (cursor.moveToNext() && results.size < 500) {
                    val docId = if (idIdx >= 0) cursor.getString(idIdx) else continue
                    val name = if (nameIdx >= 0) cursor.getString(nameIdx) ?: "Untitled" else "Untitled"
                    val mime = if (mimeIdx >= 0) cursor.getString(mimeIdx) ?: "application/octet-stream" else "application/octet-stream"
                    val size = if (sizeIdx >= 0) cursor.getLong(sizeIdx) else 0L
                    val lastModified = if (modIdx >= 0) cursor.getLong(modIdx) else 0L

                    if (name.startsWith(".")) continue

                    val isDir = mime == DocumentsContract.Document.MIME_TYPE_DIR

                    if (isDir) {
                        if (SKIP_DIRS.contains(name.lowercase())) continue
                        if (depth < maxDepth) {
                            subDirsToScan.add(docId)
                        }
                    } else {
                        val fileDocUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId)
                        val encodedId = encodeUri(fileDocUri)

                        if (!category.isNullOrEmpty() && category != "all") {
                            if (category.equals("favorites", ignoreCase = true)) {
                                if (!watchlistSet.contains(encodedId)) {
                                    continue
                                }
                            } else if (!matchesCategory(name, mime, category)) {
                                continue
                            }
                        }

                        if (!searchQuery.isNullOrEmpty()) {
                            if (!name.contains(searchQuery, ignoreCase = true)) {
                                continue
                            }
                        }

                        results.add(
                            FileEntry(
                                id = encodedId,
                                name = name,
                                uriString = fileDocUri.toString(),
                                isDirectory = false,
                                mimeType = mime,
                                size = size,
                                lastModified = lastModified,
                                parentId = null,
                                folderId = folderId
                            )
                        )
                    }
                }

                // Recurse into subdirectories
                for (subDocId in subDirsToScan) {
                    if (results.size >= 500) break
                    scanFilesFast(treeUri, subDocId, folderId, category, searchQuery, depth + 1, maxDepth, results, watchlistSet)
                }
            }
        } catch (e: Exception) {
            // Ignore unreadable dirs
        }
    }

    /**
     * Resolves a FileEntry by opaque ID, validating that it falls within an authorized folder.
     */
    fun resolveFile(fileId: String): FileEntry? {
        if (fileId.startsWith("folder_")) {
            val folderId = fileId.removePrefix("folder_")
            val folder = dbHelper.getFolderById(folderId) ?: return null
            return FileEntry(
                id = fileId,
                name = folder.name,
                uriString = folder.uriString,
                isDirectory = true,
                mimeType = "inode/directory",
                size = 0L,
                lastModified = folder.createdAt,
                parentId = null,
                folderId = folder.id
            )
        }
        val uri = decodeUri(fileId) ?: return null
        val authorizedFolders = getAuthorizedFolders().filter { it.isAccessible }

        for (folder in authorizedFolders) {
            val rootDoc = try {
                DocumentFile.fromTreeUri(context, Uri.parse(folder.uriString))
            } catch (e: Exception) {
                null
            } ?: continue

            val doc = try {
                DocumentFile.fromSingleUri(context, uri) ?: DocumentFile.fromTreeUri(context, uri)
            } catch (e: Exception) {
                DocumentFile.fromSingleUri(context, uri)
            } ?: continue
            if (doc.exists()) {
                val isDir = doc.isDirectory
                return FileEntry(
                    id = fileId,
                    name = doc.name ?: "Untitled",
                    uriString = doc.uri.toString(),
                    isDirectory = isDir,
                    mimeType = doc.type ?: (if (isDir) "inode/directory" else "application/octet-stream"),
                    size = if (isDir) 0L else doc.length(),
                    lastModified = doc.lastModified(),
                    folderId = folder.id
                )
            }
        }
        return null
    }

    /**
     * Opens an InputStream for direct streaming/reading of a file.
     */
    fun openInputStream(fileEntry: FileEntry): InputStream? {
        val uri = Uri.parse(fileEntry.uriString)
        return try {
            context.contentResolver.openInputStream(uri)
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Creates a new file in the specified destination folder and returns an OutputStream for upload.
     */
    fun createUploadTarget(
        folderId: String,
        parentId: String?,
        fileName: String,
        mimeType: String
    ): Pair<FileEntry, OutputStream>? {
        val folder = dbHelper.getFolderById(folderId) ?: return null
        val rootDoc = DocumentFile.fromTreeUri(context, Uri.parse(folder.uriString)) ?: return null

        val targetDir = if (!parentId.isNullOrEmpty()) {
            findDocumentByEncodedUri(parentId, rootDoc) ?: rootDoc
        } else {
            rootDoc
        }

        val createdDoc = targetDir.createFile(mimeType, fileName) ?: return null
        val outStream = context.contentResolver.openOutputStream(createdDoc.uri) ?: return null

        val entry = FileEntry(
            id = encodeUri(createdDoc.uri),
            name = createdDoc.name ?: fileName,
            uriString = createdDoc.uri.toString(),
            isDirectory = false,
            mimeType = mimeType,
            size = 0L,
            lastModified = System.currentTimeMillis(),
            parentId = parentId,
            folderId = folderId
        )
        invalidateCache()
        return Pair(entry, outStream)
    }

    /**
     * Deletes a file.
     */
    fun deleteFile(fileId: String): Boolean {
        invalidateCache()
        val uri = decodeUri(fileId) ?: return false
        val doc = DocumentFile.fromSingleUri(context, uri) ?: return false
        return doc.delete()
    }

    /**
     * Renames a file.
     */
    fun renameFile(fileId: String, newName: String): FileEntry? {
        invalidateCache()
        val uri = decodeUri(fileId) ?: return null
        val doc = DocumentFile.fromSingleUri(context, uri) ?: return null
        if (doc.renameTo(newName)) {
            return resolveFile(fileId)
        }
        return null
    }

    private fun findDocumentByEncodedUri(encodedUri: String, rootDoc: DocumentFile): DocumentFile? {
        if (encodedUri.startsWith("folder_")) return rootDoc
        val targetUri = decodeUri(encodedUri) ?: return null
        return DocumentFile.fromTreeUri(context, targetUri) ?: DocumentFile.fromSingleUri(context, targetUri)
    }

    private fun encodeUri(uri: Uri): String {
        return android.util.Base64.encodeToString(
            uri.toString().toByteArray(Charsets.UTF_8),
            android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING
        )
    }

    private fun decodeUri(encoded: String): Uri? {
        return try {
            val bytes = android.util.Base64.decode(encoded, android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP)
            Uri.parse(String(bytes, Charsets.UTF_8))
        } catch (e: Exception) {
            null
        }
    }

    private fun matchesCategory(name: String, mime: String, category: String): Boolean {
        return when (category.lowercase()) {
            "photos", "photo", "image", "images" -> mime.startsWith("image/") || hasExt(name, "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic")
            "videos", "video", "movies", "movie" -> mime.startsWith("video/") || hasExt(name, "mp4", "mkv", "webm", "mov", "avi", "3gp", "m4v")
            "audio", "audios", "music", "sound" -> mime.startsWith("audio/") || hasExt(name, "mp3", "wav", "ogg", "m4a", "flac", "aac")
            "documents", "document", "docs", "doc" -> mime.contains("pdf") || mime.contains("document") || mime.contains("text") ||
                    hasExt(name, "pdf", "txt", "docx", "doc", "xlsx", "xls", "pptx", "md", "json", "csv")
            "recent" -> true
            else -> false
        }
    }

    private fun hasExt(name: String, vararg exts: String): Boolean {
        val lower = name.lowercase()
        return exts.any { lower.endsWith(".$it") }
    }
}
