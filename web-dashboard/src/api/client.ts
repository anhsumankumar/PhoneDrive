import type {
  FileItem,
  FolderItem,
  StorageStatus,
  MediaItem,
  MediaTrack,
  MediaLibraryData,
  PlaybackProgress,
  MusicLibraryData,
  MusicTrack,
  MusicPlaylist,
} from '../types'

const TOKEN_KEY = 'phonedrive_token'

export const getToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY)
}

export const setToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token)
}

export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY)
}

export const getAuthHeaders = (): Record<string, string> => {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (response.status === 401) {
    clearToken()
    window.dispatchEvent(new CustomEvent('phonedrive_unauthorized'))
    throw new Error('Session expired or unauthorized')
  }

  const json = await response.json()
  if (!response.ok || (json && json.success === false)) {
    throw new Error(json.error || json.message || `Request failed with status ${response.status}`)
  }
  return json.data !== undefined ? json.data : json
}

export const api = {
  // Auth & Pairing
  async login(password: string): Promise<{ token: string; deviceId: string }> {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = await handleResponse<{ token: string; deviceId: string }>(res)
    setToken(data.token)
    return data
  },

  async pair(pairToken: string, deviceName: string = navigator.userAgent): Promise<{ token: string; deviceId: string }> {
    const res = await fetch('/api/v1/pairing/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairToken, deviceName }),
    })
    const data = await handleResponse<{ token: string; deviceId: string }>(res)
    setToken(data.token)
    return data
  },

  async logout(): Promise<void> {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { ...getAuthHeaders() },
      })
    } finally {
      clearToken()
    }
  },

  async getSession(): Promise<{ authenticated: boolean; deviceId?: string }> {
    const res = await fetch('/api/v1/session', {
      headers: { ...getAuthHeaders() },
    })
    return handleResponse<{ authenticated: boolean; deviceId?: string }>(res)
  },

  // Storage & Status
  async getStorageStatus(): Promise<StorageStatus> {
    const res = await fetch('/api/v1/storage/status', {
      headers: { ...getAuthHeaders() },
    })
    return handleResponse<StorageStatus>(res)
  },

  // Folders
  async getFolders(): Promise<FolderItem[]> {
    const res = await fetch('/api/v1/folders', {
      headers: { ...getAuthHeaders() },
    })
    return handleResponse<FolderItem[]>(res)
  },

  // Files Listing
  async getFiles(params?: {
    folderId?: string
    parentId?: string | null
    category?: string
    search?: string
    sort?: string
  }): Promise<{ files: FileItem[]; breadcrumbs?: { id: string; name: string }[] }> {
    const url = new URL('/api/v1/files', window.location.origin)
    if (params?.folderId) url.searchParams.set('folderId', params.folderId)
    if (params?.parentId) url.searchParams.set('parentId', params.parentId)
    if (params?.category && params.category !== 'all') url.searchParams.set('category', params.category)
    if (params?.search) url.searchParams.set('search', params.search)
    if (params?.sort) url.searchParams.set('sort', params.sort)

    const res = await fetch(url.toString(), {
      headers: { ...getAuthHeaders() },
    })
    return handleResponse<{ files: FileItem[]; breadcrumbs?: { id: string; name: string }[] }>(res)
  },

  // Streaming / Content URL
  getContentUrl(fileId: string, download: boolean = false): string {
    const token = getToken()
    const url = new URL(`/api/v1/files/${encodeURIComponent(fileId)}/content`, window.location.origin)
    if (download) url.searchParams.set('download', 'true')
    if (token) url.searchParams.set('token', token)
    return url.toString()
  },

  getThumbnailUrl(fileId: string): string {
    const token = getToken()
    const url = new URL(`/api/v1/files/${encodeURIComponent(fileId)}/thumbnail`, window.location.origin)
    if (token) url.searchParams.set('token', token)
    return url.toString()
  },

  // File Upload
  async uploadFile(
    folderId: string,
    parentId: string | null,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<FileItem> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const token = getToken()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100)
          onProgress(percent)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText)
            resolve(data.data || data)
          } catch (err) {
            reject(new Error('Invalid response from server'))
          }
        } else {
          try {
            const data = JSON.parse(xhr.responseText)
            reject(new Error(data.error || 'Upload failed'))
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`))
          }
        }
      })

      xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
      xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))

      const url = new URL('/api/v1/files/upload', window.location.origin)
      xhr.open('POST', url.toString())
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      }

      const formData = new FormData()
      formData.append('folderId', folderId)
      if (parentId) formData.append('parentId', parentId)
      formData.append('file', file)

      xhr.send(formData)
    })
  },

  // Delete & Rename
  async deleteFile(fileId: string): Promise<void> {
    const res = await fetch(`/api/v1/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
    })
    await handleResponse(res)
  },

  async renameFile(fileId: string, newName: string): Promise<FileItem> {
    const res = await fetch(`/api/v1/files/${encodeURIComponent(fileId)}/rename`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ newName }),
    })
    return handleResponse<FileItem>(res)
  },

  // Media & Cinema Library
  async getMediaLibrary(params?: { folderId?: string; search?: string }): Promise<MediaLibraryData> {
    const url = new URL('/api/v1/media', window.location.origin)
    if (params?.folderId) url.searchParams.set('folderId', params.folderId)
    if (params?.search) url.searchParams.set('search', params.search)

    const res = await fetch(url.toString(), {
      headers: { ...getAuthHeaders() },
    })
    return handleResponse<MediaLibraryData>(res)
  },

  async getMediaDetails(mediaId: string): Promise<MediaItem & { tracks: MediaTrack[] }> {
    const res = await fetch(`/api/v1/media/${encodeURIComponent(mediaId)}`, {
      headers: { ...getAuthHeaders() },
    })
    return handleResponse<MediaItem & { tracks: MediaTrack[] }>(res)
  },

  async getMediaTracks(mediaId: string): Promise<MediaTrack[]> {
    const res = await fetch(`/api/v1/media/${encodeURIComponent(mediaId)}/tracks`, {
      headers: { ...getAuthHeaders() },
    })
    return handleResponse<MediaTrack[]>(res)
  },

  getMediaStreamUrl(
    mediaId: string,
    options?: {
      transcode?: boolean
      start?: number
      audioTrack?: number
      direct?: boolean
      quality?: string
      mode?: 'direct' | 'remux' | 'transcode_audio' | 'transcode_full'
    }
  ): string {
    const token = getToken()
    const url = new URL(`/api/v1/media/${encodeURIComponent(mediaId)}/stream`, window.location.origin)
    if (token) url.searchParams.set('token', token)
    if (options?.mode) url.searchParams.set('mode', options.mode)
    if (options?.transcode) url.searchParams.set('transcode', '1')
    if (options?.direct) url.searchParams.set('direct', '1')
    if (options?.start !== undefined && options.start > 0) url.searchParams.set('start', options.start.toString())
    if (options?.audioTrack !== undefined) url.searchParams.set('audioTrack', options.audioTrack.toString())
    if (options?.quality && options.quality !== 'auto') url.searchParams.set('quality', options.quality)
    return url.toString()
  },

  getMediaThumbnailUrl(mediaId: string): string {
    const token = getToken()
    const url = new URL(`/api/v1/media/${encodeURIComponent(mediaId)}/thumbnail`, window.location.origin)
    if (token) url.searchParams.set('token', token)
    return url.toString()
  },

  getMediaSubtitleUrl(mediaId: string, trackId: string): string {
    const token = getToken()
    const url = new URL(`/api/v1/media/${encodeURIComponent(mediaId)}/subtitles/${encodeURIComponent(trackId)}`, window.location.origin)
    if (token) url.searchParams.set('token', token)
    return url.toString()
  },

  async getPlaybackProgress(mediaId: string): Promise<PlaybackProgress> {
    const res = await fetch(`/api/v1/media/${encodeURIComponent(mediaId)}/playback-progress`, {
      headers: { ...getAuthHeaders() },
    })
    return handleResponse<PlaybackProgress>(res)
  },

  async savePlaybackProgress(
    mediaId: string,
    progress: {
      positionMs: number
      durationMs: number
      completed?: boolean
      subtitleTrack?: string | null
      audioTrack?: string | null
      playbackSpeed?: number
    }
  ): Promise<void> {
    await fetch(`/api/v1/media/${encodeURIComponent(mediaId)}/playback-progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(progress),
    })
  },

  async deletePlaybackProgress(mediaId: string): Promise<void> {
    await fetch(`/api/v1/media/${encodeURIComponent(mediaId)}/playback-progress`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
    })
  },

  async toggleWatchlist(mediaId: string): Promise<{ isWatchlisted: boolean }> {
    const res = await fetch(`/api/v1/media/${encodeURIComponent(mediaId)}/watchlist`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    })
    return handleResponse<{ isWatchlisted: boolean }>(res)
  },

  // ----------------- MUSIC STREAMING CLIENT APIS -----------------
  async getMusicLibrary(search?: string): Promise<MusicLibraryData> {
    const url = new URL('/api/v1/music/library', window.location.origin)
    if (search) url.searchParams.set('search', search)
    const res = await fetch(url.toString(), {
      headers: { ...getAuthHeaders() },
    })
    return handleResponse<MusicLibraryData>(res)
  },

  getTrackArtworkUrl(trackId: string): string {
    const token = getToken()
    const url = new URL(`/api/v1/music/tracks/${encodeURIComponent(trackId)}/artwork`, window.location.origin)
    if (token) url.searchParams.set('token', token)
    return url.toString()
  },

  getTrackStreamUrl(trackId: string): string {
    const token = getToken()
    const url = new URL(`/api/v1/music/tracks/${encodeURIComponent(trackId)}/stream`, window.location.origin)
    if (token) url.searchParams.set('token', token)
    return url.toString()
  },

  async getMusicPlaylists(): Promise<MusicPlaylist[]> {
    const res = await fetch('/api/v1/music/playlists', {
      headers: { ...getAuthHeaders() },
    })
    return handleResponse<MusicPlaylist[]>(res)
  },

  async createMusicPlaylist(name: string): Promise<MusicPlaylist> {
    const res = await fetch('/api/v1/music/playlists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ name }),
    })
    return handleResponse<MusicPlaylist>(res)
  },

  async renameMusicPlaylist(playlistId: string, name: string): Promise<void> {
    await fetch(`/api/v1/music/playlists/${encodeURIComponent(playlistId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ name }),
    })
  },

  async deleteMusicPlaylist(playlistId: string): Promise<void> {
    await fetch(`/api/v1/music/playlists/${encodeURIComponent(playlistId)}`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
    })
  },

  async getPlaylistTracks(playlistId: string): Promise<MusicTrack[]> {
    const res = await fetch(`/api/v1/music/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      headers: { ...getAuthHeaders() },
    })
    return handleResponse<MusicTrack[]>(res)
  },

  async addTrackToPlaylist(playlistId: string, trackId: string): Promise<void> {
    await fetch(`/api/v1/music/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ trackId }),
    })
  },

  async removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
    await fetch(`/api/v1/music/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(trackId)}`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
    })
  },

  async toggleMusicFavorite(trackId: string): Promise<{ isFavorite: boolean }> {
    const res = await fetch(`/api/v1/music/favorites/${encodeURIComponent(trackId)}`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    })
    return handleResponse<{ isFavorite: boolean }>(res)
  },

  async recordMusicHistory(trackId: string): Promise<void> {
    await fetch(`/api/v1/music/history/${encodeURIComponent(trackId)}`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    })
  },
}

