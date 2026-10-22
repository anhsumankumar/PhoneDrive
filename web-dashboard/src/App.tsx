import React, { useState, useEffect, useCallback, useRef } from 'react'
import { LoginPage } from './components/LoginPage'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { Breadcrumbs } from './components/Breadcrumbs'
import { FileGrid } from './components/FileGrid'
import { FileList } from './components/FileList'
import { DetailsPanel } from './components/DetailsPanel'
import { MediaPlayerModal } from './components/MediaPlayerModal'
import { ImagePreviewModal } from './components/ImagePreviewModal'
import { UploadModal } from './components/UploadModal'
import { MediaLibraryView } from './components/MediaLibraryView'
import { CinematicVideoPlayer } from './components/CinematicVideoPlayer'
import { api, getToken, setToken } from './api/client'
import type { FileItem, FolderItem, StorageStatus, MediaItem } from './types'
import { isImage, isVideo, isAudio } from './utils/fileUtils'
import { FolderX, AlertTriangle, Trash2, Edit3, WifiOff } from 'lucide-react'
import { ErrorBoundary } from './components/ErrorBoundary'

// --- ROUTING UTILITIES FOR DYNAMIC SPA NAVIGATION ---
export interface RouteState {
  category: string
  folderId: string | null
  parentId: string | null
  searchQuery: string
  watchId: string | null
  audioId: string | null
  photoId: string | null
}

export function parseRoute(pathname: string, search: string): RouteState {
  const p = pathname.toLowerCase().replace(/\/$/, '') || '/'
  const params = new URLSearchParams(search)

  const watchId =
    params.get('watch') ||
    (p === '/watch' ? params.get('id') : null) ||
    (p.startsWith('/watch/') ? p.replace('/watch/', '') : null)
  const audioId = params.get('audio') || (p === '/audio' ? params.get('id') : null)
  const photoId = params.get('photo') || (p === '/photos' || p === '/photo' ? params.get('id') : null)
  const folderId = params.get('folder') || null
  const parentId = params.get('parent') || null
  const searchQuery = params.get('q') || ''

  let category = 'all'
  if (p === '/video' || p === '/videos' || p === '/watch') {
    category = 'videos'
  } else if (p === '/cinema') {
    category = 'cinema'
  } else if (p === '/audio') {
    category = 'audio'
  } else if (p === '/photos' || p === '/photo' || p === '/images') {
    category = 'photos'
  } else if (p === '/docs' || p === '/documents') {
    category = 'documents'
  } else if (p === '/favorites') {
    category = 'favorites'
  } else if (p === '/recent') {
    category = 'recent'
  } else if (folderId) {
    category = 'all'
  }

  return { category, folderId, parentId, searchQuery, watchId, audioId, photoId }
}

export function buildRouteUrl(options: {
  category?: string
  folderId?: string | null
  parentId?: string | null
  searchQuery?: string
  watchId?: string | null
  audioId?: string | null
  photoId?: string | null
}): string {
  const { category = 'all', folderId, parentId, searchQuery, watchId, audioId, photoId } = options
  const params = new URLSearchParams()
  let basePath = '/files'

  if (watchId) {
    basePath = '/watch'
    params.set('id', watchId)
    const qs = params.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

  if (category === 'videos') basePath = '/video'
  else if (category === 'cinema') basePath = '/cinema'
  else if (category === 'audio') basePath = '/audio'
  else if (category === 'photos') basePath = '/photos'
  else if (category === 'documents') basePath = '/docs'
  else if (category === 'favorites') basePath = '/favorites'
  else if (category === 'recent') basePath = '/recent'
  else basePath = '/files'

  if (folderId) params.set('folder', folderId)
  if (parentId) params.set('parent', parentId)
  if (searchQuery) params.set('q', searchQuery)
  if (audioId) params.set('audio', audioId)
  if (photoId) params.set('photo', photoId)

  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

function PhoneDriveDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const urlToken = urlParams.get('token')
    if (urlToken) {
      setToken(urlToken)
      return true
    }
    return !!getToken()
  })

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('phonedrive_theme')
    if (saved === 'light' || saved === 'dark') return saved
    return 'dark'
  })

  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    if (theme === 'light') {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    } else {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    }
    localStorage.setItem('phonedrive_theme', theme)
  }, [theme])

  // --- Dynamic Routing State Initialization ---
  const initialRoute = useRef<RouteState>(
    parseRoute(window.location.pathname, window.location.search)
  ).current

  const [folders, setFolders] = useState<FolderItem[]>([])
  const [files, setFiles] = useState<FileItem[]>([])
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([])
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null)

  const [currentCategory, setCurrentCategory] = useState<string>(initialRoute.category)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(initialRoute.folderId)
  const [currentParentId, setCurrentParentId] = useState<string | null>(initialRoute.parentId)
  const [searchQuery, setSearchQuery] = useState<string>(initialRoute.searchQuery)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Modals & Players
  const [mediaModalFile, setMediaModalFile] = useState<FileItem | null>(null)
  const [activeCinemaVideo, setActiveCinemaVideo] = useState<MediaItem | null>(null)
  const [imageModalFile, setImageModalFile] = useState<FileItem | null>(null)
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false)

  // Confirmation dialogs
  const [fileToDelete, setFileToDelete] = useState<FileItem | null>(null)
  const [fileToRename, setFileToRename] = useState<FileItem | null>(null)
  const [newFileName, setNewFileName] = useState<string>('')

  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Fast In-Memory Client SWR Cache to eliminate latency on tab switches
  const fileCacheRef = useRef<Map<string, { files: FileItem[]; breadcrumbs: any[]; timestamp: number }>>(
    new Map()
  )

  // Listen for unauthorized events
  useEffect(() => {
    const handleUnauthorized = () => {
      setIsAuthenticated(false)
    }
    window.addEventListener('phonedrive_unauthorized', handleUnauthorized)
    return () => window.removeEventListener('phonedrive_unauthorized', handleUnauthorized)
  }, [])

  // Initial Route normalization (e.g. '/' -> '/files')
  useEffect(() => {
    if (window.location.pathname === '/') {
      window.history.replaceState({}, '', '/files')
    }
  }, [])

  // Load initial watch media if URL has ?watch= or /watch?id=
  useEffect(() => {
    if (initialRoute.watchId && isAuthenticated) {
      api
        .getMediaDetails(initialRoute.watchId)
        .then((media) => setActiveCinemaVideo(media))
        .catch(() => {
          setActiveCinemaVideo({
            id: initialRoute.watchId!,
            name: 'Video',
            title: 'Video Stream',
            size: 0,
            durationMs: 0,
            width: 0,
            height: 0,
            resolution: 'HD',
            mimeType: 'video/mp4',
            folderId: '',
            lastModified: Date.now(),
            playbackPositionMs: 0,
            completed: false,
            lastWatched: 0,
            hasSubtitles: false,
            audioTracksCount: 1,
            isSeries: false,
            isWatchlisted: false,
          })
        })
    }
  }, [initialRoute.watchId, isAuthenticated])

  // Initial data (folders & storage status + cache pre-warming for instant tab switching)
  const loadInitialData = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const [status, foldersList] = await Promise.all([
        api.getStorageStatus().catch(() => null),
        api.getFolders().catch(() => []),
      ])
      if (status) setStorageStatus(status)
      setFolders(foldersList)

      // Background pre-warm popular tabs (videos, photos, audio) so switching tabs is instant (0ms)!
      const preloadTabs = ['videos', 'photos', 'audio']
      preloadTabs.forEach((cat) => {
        api.getFiles({ category: cat }).then((res) => {
          if (res?.files) {
            fileCacheRef.current.set(`___${cat}_`, {
              files: res.files,
              breadcrumbs: res.breadcrumbs || [],
              timestamp: Date.now(),
            })
          }
        }).catch(() => {})
      })
    } catch (err: any) {
      console.error('Failed to load initial data', err)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (isAuthenticated) {
      loadInitialData()
    }
  }, [isAuthenticated, loadInitialData])

  // --- HTML5 History Navigation popstate handler ---
  useEffect(() => {
    const handlePopState = () => {
      const route = parseRoute(window.location.pathname, window.location.search)
      setCurrentCategory(route.category)
      setSelectedFolderId(route.folderId)
      setCurrentParentId(route.parentId)
      setSearchQuery(route.searchQuery)

      // Watch video player sync
      if (route.watchId) {
        if (!activeCinemaVideo || activeCinemaVideo.id !== route.watchId) {
          api
            .getMediaDetails(route.watchId)
            .then(setActiveCinemaVideo)
            .catch(() => {})
        }
      } else {
        setActiveCinemaVideo(null)
      }

      // Audio modal sync
      if (!route.audioId) {
        setMediaModalFile(null)
      }

      // Photo modal sync
      if (!route.photoId) {
        setImageModalFile(null)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [activeCinemaVideo])

  // Push new URL helper
  const navigateTo = useCallback(
    (options: {
      category?: string
      folderId?: string | null
      parentId?: string | null
      searchQuery?: string
      watchId?: string | null
      audioId?: string | null
      photoId?: string | null
      replace?: boolean
    }) => {
      const url = buildRouteUrl(options)
      if (window.location.pathname + window.location.search !== url) {
        if (options.replace) {
          window.history.replaceState({}, '', url)
        } else {
          window.history.pushState({}, '', url)
        }
      }
    },
    []
  )

  // Fetch files based on filters with Instant SWR Cache
  const fetchFiles = useCallback(
    async (bypassCache: boolean = false) => {
      if (!isAuthenticated) return
      if (currentCategory === 'cinema') return // Cinema has its own MediaLibraryView

      const cacheKey = `${selectedFolderId || ''}_${currentParentId || ''}_${currentCategory}_${searchQuery || ''}`
      const cached = fileCacheRef.current.get(cacheKey)
      const isFresh = cached && Date.now() - cached.timestamp < 45000 // 45 seconds fresh

      if (cached) {
        // Zero-lag instant render
        setFiles(cached.files)
        setBreadcrumbs(cached.breadcrumbs)
        if (isFresh && !bypassCache) {
          setLoading(false)
          return
        }
      } else {
        setLoading(true)
      }

      setError(null)
      try {
        const res = await api.getFiles({
          folderId: selectedFolderId || undefined,
          parentId: currentParentId,
          category: currentCategory,
          search: searchQuery || undefined,
        })
        const newFiles = res.files || []
        const newBreadcrumbs = res.breadcrumbs || []

        fileCacheRef.current.set(cacheKey, {
          files: newFiles,
          breadcrumbs: newBreadcrumbs,
          timestamp: Date.now(),
        })

        setFiles(newFiles)
        setBreadcrumbs(newBreadcrumbs)
      } catch (err: any) {
        if (!cached) setError(err.message || 'Failed to fetch files')
      } finally {
        setLoading(false)
      }
    },
    [isAuthenticated, selectedFolderId, currentParentId, currentCategory, searchQuery]
  )

  useEffect(() => {
    const timer = setTimeout(
      () => {
        fetchFiles()
      },
      searchQuery ? 300 : 0
    )
    return () => clearTimeout(timer)
  }, [fetchFiles, searchQuery])

  // --- Handlers ---
  const handleSelectCategory = (cat: string) => {
    setCurrentCategory(cat)
    setSelectedFolderId(null)
    setCurrentParentId(null)
    setSelectedFile(null)

    // Instant SWR check: if already in cache, switch in 0ms!
    const cacheKey = `___${cat}_`
    const cached = fileCacheRef.current.get(cacheKey)
    if (cached) {
      setFiles(cached.files)
      setBreadcrumbs(cached.breadcrumbs)
      setLoading(false)
    } else {
      setFiles([])
      setLoading(true)
    }

    navigateTo({ category: cat, folderId: null, parentId: null })
  }

  const handleSelectFolder = (folderId: string | null) => {
    setSelectedFolderId(folderId)
    setCurrentParentId(null)
    setSelectedFile(null)

    const cacheKey = `${folderId || ''}___`
    const cached = fileCacheRef.current.get(cacheKey)
    if (cached) {
      setFiles(cached.files)
      setBreadcrumbs(cached.breadcrumbs)
      setLoading(false)
    } else {
      setFiles([])
      setLoading(true)
    }

    navigateTo({ category: currentCategory, folderId, parentId: null })
  }

  const handleOpenFile = (file: FileItem) => {
    if (file.isDirectory) {
      if (file.id.startsWith('folder_')) {
        const actualFolderId = file.id.replace('folder_', '')
        setSelectedFolderId(actualFolderId)
        setCurrentParentId(null)
        navigateTo({ category: currentCategory, folderId: actualFolderId, parentId: null })
      } else {
        setCurrentParentId(file.id)
        navigateTo({ category: currentCategory, folderId: selectedFolderId, parentId: file.id })
      }
      setSelectedFile(null)
    } else if (isVideo(file)) {
      api
        .getMediaDetails(file.id)
        .then((media) => {
          setActiveCinemaVideo(media)
          navigateTo({ watchId: media.id })
        })
        .catch(() => {
          const fallback: MediaItem = {
            id: file.id,
            name: file.name,
            title: file.name.substring(0, file.name.lastIndexOf('.')) || file.name,
            size: file.size,
            durationMs: 0,
            width: 0,
            height: 0,
            resolution: 'HD',
            mimeType: file.mimeType,
            folderId: file.folderId || '',
            lastModified: file.lastModified,
            playbackPositionMs: 0,
            completed: false,
            lastWatched: 0,
            hasSubtitles: false,
            audioTracksCount: 1,
            isSeries: false,
            isWatchlisted: false,
          }
          setActiveCinemaVideo(fallback)
          navigateTo({ watchId: fallback.id })
        })
    } else if (isAudio(file)) {
      setMediaModalFile(file)
      navigateTo({
        category: currentCategory,
        folderId: selectedFolderId,
        parentId: currentParentId,
        audioId: file.id,
      })
    } else if (isImage(file)) {
      setImageModalFile(file)
      navigateTo({
        category: currentCategory,
        folderId: selectedFolderId,
        parentId: currentParentId,
        photoId: file.id,
      })
    } else {
      // Direct download
      window.open(api.getContentUrl(file.id, true), '_blank')
    }
  }

  const handleCloseCinemaVideo = () => {
    setActiveCinemaVideo(null)
    navigateTo({
      category: currentCategory,
      folderId: selectedFolderId,
      parentId: currentParentId,
    })
  }

  const handleCloseAudio = () => {
    setMediaModalFile(null)
    navigateTo({
      category: currentCategory,
      folderId: selectedFolderId,
      parentId: currentParentId,
    })
  }

  const handleClosePhoto = () => {
    setImageModalFile(null)
    navigateTo({
      category: currentCategory,
      folderId: selectedFolderId,
      parentId: currentParentId,
    })
  }

  const handleNavigateBreadcrumb = (id: string | null) => {
    if (!id || id === 'root' || id === '') {
      setSelectedFolderId(null)
      setCurrentParentId(null)
      setCurrentCategory('all')
      navigateTo({ category: 'all', folderId: null, parentId: null })
    } else if (id.startsWith('folder_')) {
      const actualFolderId = id.replace('folder_', '')
      setSelectedFolderId(actualFolderId)
      setCurrentParentId(null)
      navigateTo({ category: currentCategory, folderId: actualFolderId, parentId: null })
    } else if (id.startsWith('cat_')) {
      const cat = id.replace('cat_', '')
      setCurrentCategory(cat)
      setSelectedFolderId(null)
      setCurrentParentId(null)
      navigateTo({ category: cat, folderId: null, parentId: null })
    } else {
      setCurrentParentId(id)
      navigateTo({ category: currentCategory, folderId: selectedFolderId, parentId: id })
    }
    setSelectedFile(null)
  }

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedIds.size === files.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(files.map((f) => f.id)))
    }
  }

  const handleDeleteConfirmed = async () => {
    if (!fileToDelete) return
    try {
      await api.deleteFile(fileToDelete.id)
      fileCacheRef.current.clear() // Invalidate cache
      setFiles((prev) => prev.filter((f) => f.id !== fileToDelete.id))
      if (selectedFile?.id === fileToDelete.id) setSelectedFile(null)
      setFileToDelete(null)
    } catch (err: any) {
      alert(err.message || 'Failed to delete file')
    }
  }

  const handleRenameConfirmed = async () => {
    if (!fileToRename || !newFileName.trim()) return
    try {
      const updated = await api.renameFile(fileToRename.id, newFileName.trim())
      fileCacheRef.current.clear() // Invalidate cache
      setFiles((prev) => prev.map((f) => (f.id === fileToRename.id ? updated : f)))
      if (selectedFile?.id === fileToRename.id) setSelectedFile(updated)
      setFileToRename(null)
    } catch (err: any) {
      alert(err.message || 'Failed to rename file')
    }
  }

  const handleLogout = async () => {
    await api.logout()
    setIsAuthenticated(false)
    setFiles([])
    setFolders([])
    fileCacheRef.current.clear()
  }

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={() => setIsAuthenticated(true)} theme={theme} onToggleTheme={toggleTheme} />
  }

  const currentFolder = folders.find((f) => f.id === selectedFolderId)

  return (
    <div className="flex h-screen bg-[var(--bg-app)] text-[var(--text-primary)] overflow-hidden font-sans transition-colors duration-200">
      {/* Offline / Reconnecting Banner */}
      {isOffline && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2 bg-amber-500 text-slate-950 font-semibold text-xs rounded-full shadow-2xl backdrop-blur-md border border-amber-300">
          <WifiOff className="w-4 h-4 text-slate-950 animate-pulse" />
          <span>Network connection lost. Trying to reconnect to PhoneDrive...</span>
        </div>
      )}

      {/* Unified Sidebar with Dynamic Path Support */}
      <Sidebar
        currentCategory={currentCategory}
        onSelectCategory={handleSelectCategory}
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSelectFolder={handleSelectFolder}
        storageStatus={storageStatus}
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
        onCloseMobile={() => setIsSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64 overflow-hidden">
        {currentCategory === 'cinema' ? (
          <MediaLibraryView folders={folders} />
        ) : (
          <>
            {/* Header */}
            <Header
              onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
              searchQuery={searchQuery}
              onSearchChange={(q) => {
                setSearchQuery(q)
                navigateTo({
                  category: currentCategory,
                  folderId: selectedFolderId,
                  parentId: currentParentId,
                  searchQuery: q,
                  replace: true,
                })
              }}
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
              onOpenUpload={() => setIsUploadOpen(true)}
              onRefresh={() => {
                fileCacheRef.current.clear()
                fetchFiles(true)
                loadInitialData()
              }}
              loading={loading}
              theme={theme}
              onToggleTheme={toggleTheme}
            />

            {/* Breadcrumb sub-header */}
            <div className="px-4 lg:px-8 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/40 flex items-center justify-between">
              <Breadcrumbs
                items={breadcrumbs}
                onNavigate={handleNavigateBreadcrumb}
                currentFolderTitle={currentFolder?.name}
              />
              <div className="text-xs text-[var(--text-muted)] font-medium">
                {files.length} {files.length === 1 ? 'item' : 'items'}
              </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 flex overflow-hidden">
              <main className="flex-1 overflow-y-auto no-scrollbar">
                {error && (
                  <div className="m-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center space-x-3">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {loading && files.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center space-y-3">
                    <div className="w-8 h-8 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
                    <span className="text-xs text-[var(--text-muted)] font-medium">Loading from phone...</span>
                  </div>
                ) : files.length === 0 ? (
                  <div className="h-80 flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <div className="w-16 h-16 rounded-2xl bg-[var(--glass-bg)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)]">
                      <FolderX className="w-8 h-8" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-[var(--text-primary)]">No files found</h4>
                      <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm">
                        {searchQuery
                          ? `No results match "${searchQuery}" in this directory.`
                          : 'This directory is currently empty, or no authorized folders have been added on the phone.'}
                      </p>
                    </div>
                  </div>
                ) : viewMode === 'grid' ? (
                  <FileGrid
                    files={files}
                    selectedFile={selectedFile}
                    onSelectFile={setSelectedFile}
                    onOpenFile={handleOpenFile}
                    onDeleteFile={setFileToDelete}
                    onRenameFile={(f) => {
                      setFileToRename(f)
                      setNewFileName(f.name)
                    }}
                    selectedIds={selectedIds}
                    onToggleSelect={handleToggleSelect}
                  />
                ) : (
                  <FileList
                    files={files}
                    selectedFile={selectedFile}
                    onSelectFile={setSelectedFile}
                    onOpenFile={handleOpenFile}
                    onDeleteFile={setFileToDelete}
                    onRenameFile={(f) => {
                      setFileToRename(f)
                      setNewFileName(f.name)
                    }}
                    selectedIds={selectedIds}
                    onToggleSelect={handleToggleSelect}
                    onSelectAll={handleSelectAll}
                  />
                )}
              </main>

              {/* Details Panel */}
              {selectedFile && (
                <DetailsPanel
                  file={selectedFile}
                  onClose={() => setSelectedFile(null)}
                  onOpenFile={handleOpenFile}
                  onDeleteFile={setFileToDelete}
                  onRenameFile={(f) => {
                    setFileToRename(f)
                    setNewFileName(f.name)
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* Unified Cinematic Video Player for ALL Videos (Quality Selector, Subtitles, Audio Tracks, Gestures) */}
      {activeCinemaVideo && (
        <CinematicVideoPlayer
          media={activeCinemaVideo}
          onClose={handleCloseCinemaVideo}
          onProgressUpdate={() => {}}
        />
      )}

      {/* Media Streaming Modal (Specialized High-Fidelity Audio Player) */}
      {mediaModalFile && (
        <MediaPlayerModal
          file={mediaModalFile}
          onClose={handleCloseAudio}
        />
      )}

      {/* Image Preview Modal */}
      {imageModalFile && (
        <ImagePreviewModal
          file={imageModalFile}
          files={files}
          onClose={handleClosePhoto}
          onSelectFile={(f) => {
            setImageModalFile(f)
            navigateTo({
              category: currentCategory,
              folderId: selectedFolderId,
              parentId: currentParentId,
              photoId: f.id,
            })
          }}
        />
      )}

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        folders={folders}
        currentFolderId={selectedFolderId}
        currentParentId={currentParentId}
        onUploadSuccess={() => {
          fileCacheRef.current.clear()
          fetchFiles(true)
          loadInitialData()
        }}
      />

      {/* Delete Confirmation Modal */}
      {fileToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Delete Permanently?</h3>
              <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                Are you sure you want to delete <span className="text-[var(--text-primary)] font-medium">"{fileToDelete.name}"</span> from your phone? This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setFileToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirmed}
                className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-red-600 hover:bg-red-500 transition shadow-sm"
              >
                Delete File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {fileToRename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
              <Edit3 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Rename File</h3>
              <p className="text-xs text-[var(--text-muted)] mt-1">Enter a new name for this file on your phone.</p>
            </div>
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs focus:outline-none focus:border-sky-500"
              autoFocus
            />
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setFileToRename(null)}
                className="px-4 py-2 rounded-xl text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameConfirmed}
                className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 transition shadow-sm"
              >
                Save Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function App() {
  return (
    <ErrorBoundary>
      <PhoneDriveDashboard />
    </ErrorBoundary>
  )
}

export default App

