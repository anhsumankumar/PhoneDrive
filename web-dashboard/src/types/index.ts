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

  // Capability inspection details
  container?: string
  containerLongName?: string
  videoCodec?: string
  videoCodecLongName?: string
  videoBitrate?: number
  audioCodec?: string
  audioCodecLongName?: string
  audioBitrate?: number
  fps?: number
  aspectRatio?: string
  bitDepth?: number
  pixFmt?: string
  isHdr?: boolean
  hdrType?: string
  overallBitrate?: number
  isBrowserNative?: boolean
  playbackStrategy?: 'direct' | 'remux' | 'transcode_audio' | 'transcode_full'
  strategyReason?: string
  tracks?: MediaTrack[]
  audioTracks?: any[]
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

// ----------------- MUSIC STREAMING TYPES -----------------
export interface MusicTrack {
  id: string
  title: string
  artist: string
  album: string
  albumArtist?: string
  genre?: string
  year?: string | null
  trackNumber?: number | null
  discNumber?: number | null
  durationMs: number
  bitrate?: number
  sampleRate?: number
  channels?: number
  codec: string
  lossless: boolean
  hasArtwork: boolean
  isFavorite: boolean
  isBrowserPlayable: boolean
  size: number
  fileName: string
  folderId?: string
  playedAt?: number
  playCount?: number
}

export interface MusicAlbum {
  id: string
  name: string
  artist: string
  year?: string | null
  trackCount: number
  coverTrackId: string
  tracks: MusicTrack[]
}

export interface MusicArtist {
  name: string
  trackCount: number
  albumCount: number
  sampleTrackId: string
}

export interface MusicPlaylist {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  trackCount: number
}

export interface MusicLibraryData {
  totalTracks: number
  tracks: MusicTrack[]
  albums: MusicAlbum[]
  artists: MusicArtist[]
  genres: { name: string; count: number }[]
  playlists: MusicPlaylist[]
  recentlyPlayed: MusicTrack[]
  favorites: MusicTrack[]
}

