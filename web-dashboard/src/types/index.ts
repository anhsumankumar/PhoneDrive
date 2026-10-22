export interface FileItem {
  id: string
  name: string
  isDirectory: boolean
  mimeType: string
  size: number
  lastModified: number
  parentId?: string | null
  folderId?: string
  isFavorite?: boolean
}

export interface FolderItem {
  id: string
  name: string
  uri: string
  fileCount?: number
  totalBytes?: number
  createdAt: number
  isAccessible: boolean
}

export interface StorageStatus {
  serverName: string
  deviceModel: string
  androidVersion: string
  totalFolders: number
  totalFiles: number
  totalBytes: number
  freeSpaceBytes: number
  totalSpaceBytes: number
  version: string
  uptimeSeconds: number
}

export interface SessionInfo {
  token: string
  deviceId: string
  deviceName: string
  createdAt: number
  lastActive: number
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface MediaItem {
  id: string
  name: string
  title: string
  size: number
  durationMs: number
  width: number
  height: number
  resolution: string // "4K UHD", "1080p FHD", "720p HD", "480p", "SD"
  mimeType: string
  folderId: string
  lastModified: number
  playbackPositionMs: number
  completed: boolean
  lastWatched: number
  hasSubtitles: boolean
  audioTracksCount: number
  isSeries: boolean
  season?: number | null
  episode?: number | null
  isWatchlisted: boolean
}

export interface MediaTrack {
  id: string
  type: 'subtitle' | 'audio'
  label: string
  language?: string | null
  isDefault: boolean
  format?: string | null
  source: 'embedded' | 'sidecar'
}

export interface PlaybackProgress {
  mediaId: string
  positionMs: number
  durationMs: number
  completed: boolean
  subtitleTrack?: string | null
  audioTrack?: string | null
  playbackSpeed: number
  lastWatched: number
}

export interface MediaLibraryData {
  totalVideos: number
  featured: MediaItem | null
  continueWatching: MediaItem[]
  recentlyAdded: MediaItem[]
  movies: MediaItem[]
  series: MediaItem[]
  watchlist: MediaItem[]
  allVideos: MediaItem[]
}

