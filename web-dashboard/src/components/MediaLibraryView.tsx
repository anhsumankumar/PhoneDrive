import React, { useState, useEffect, useCallback } from 'react'
import {
  Film,
  Play,
  Info,
  Check,
  Plus,
  Clock,
  Search,
  Sparkles,
  TrendingUp,
  Tv,
  Bookmark,
  RefreshCw,
  FolderOpen,
} from 'lucide-react'
import type { MediaItem, MediaLibraryData, FolderItem } from '../types'
import { api } from '../api/client'
import { MediaCard } from './MediaCard'
import { MovieDetailsModal } from './MovieDetailsModal'
import { CinematicVideoPlayer } from './CinematicVideoPlayer'

interface MediaLibraryViewProps {
  folders: FolderItem[]
  onOpenFolderManager?: () => void
}

let globalCinemaCache: { data: MediaLibraryData; timestamp: number } | null = null

export const MediaLibraryView: React.FC<MediaLibraryViewProps> = ({
  folders,
  onOpenFolderManager,
}) => {
  const [library, setLibrary] = useState<MediaLibraryData | null>(() => {
    if (globalCinemaCache && Date.now() - globalCinemaCache.timestamp < 60000) {
      return globalCinemaCache.data
    }
    return null
  })
  const [loading, setLoading] = useState<boolean>(() => {
    return !(globalCinemaCache && Date.now() - globalCinemaCache.timestamp < 60000)
  })
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedFolderId, setSelectedFolderId] = useState<string>('')

  // Modals & Player
  const [activePlayerMedia, setActivePlayerMedia] = useState<MediaItem | null>(null)
  const [playerResumeMode, setPlayerResumeMode] = useState<boolean>(false)
  const [selectedDetailsMedia, setSelectedDetailsMedia] = useState<MediaItem | null>(null)

  // Fetch Library
  const fetchLibrary = useCallback(async () => {
    if (!library) setLoading(true)
    try {
      const data = await api.getMediaLibrary({
        folderId: selectedFolderId || undefined,
        search: searchQuery || undefined,
      })
      globalCinemaCache = { data, timestamp: Date.now() }
      setLibrary(data)
    } catch (err) {
      console.error('Failed to load media library', err)
    } finally {
      setLoading(false)
    }
  }, [selectedFolderId, searchQuery, library])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLibrary()
    }, searchQuery ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchLibrary, searchQuery])

  const handlePlayMedia = (media: MediaItem, resume: boolean = false) => {
    setActivePlayerMedia(media)
    setPlayerResumeMode(resume)
    window.history.pushState({ watchId: media.id }, '', `/watch?id=${encodeURIComponent(media.id)}`)
  }

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const p = window.location.pathname.toLowerCase()
      const watchId = params.get('id') || params.get('watch')
      if (p !== '/watch' && !watchId) {
        setActivePlayerMedia(null)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Watchlist toggle handler
  const handleToggleWatchlist = async (media: MediaItem) => {
    try {
      const res = await api.toggleWatchlist(media.id)
      setLibrary((prev) => {
        if (!prev) return prev
        const updateItem = (item: MediaItem) =>
          item.id === media.id ? { ...item, isWatchlisted: res.isWatchlisted } : item

        return {
          ...prev,
          featured: prev.featured ? updateItem(prev.featured) : null,
          continueWatching: (prev.continueWatching || []).map(updateItem),
          recentlyAdded: (prev.recentlyAdded || []).map(updateItem),
          movies: (prev.movies || []).map(updateItem),
          series: (prev.series || []).map(updateItem),
          watchlist: res.isWatchlisted
            ? [...(prev.watchlist || []), { ...media, isWatchlisted: true }]
            : (prev.watchlist || []).filter((m) => m.id !== media.id),
          allVideos: (prev.allVideos || []).map(updateItem),
        }
      })
    } catch (err) {
      console.error('Toggle watchlist failed', err)
    }
  }

  const formatDuration = (ms: number) => {
    if (!ms) return ''
    const totalSec = Math.floor(ms / 1000)
    const hours = Math.floor(totalSec / 3600)
    const minutes = Math.floor((totalSec % 3600) / 60)
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  const featured = library?.featured
  const continueWatching = library?.continueWatching || []
  const watchlist = library?.watchlist || []
  const recentlyAdded = library?.recentlyAdded || []
  const allVideos = library?.allVideos || []
  const series = library?.series || []
  const totalVideos = library?.totalVideos !== undefined ? library.totalVideos : allVideos.length

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors duration-200">
      {/* Search & Top Action Bar */}
      <div className="sticky top-0 z-20 px-6 py-4 bg-[var(--bg-app)]/90 backdrop-blur-md border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
            <Film className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Cinema & Shows</h1>
            <p className="text-[11px] text-[var(--text-muted)]">Stream personal movies directly from your phone</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Search Input */}
          <div className="relative w-48 sm:w-64">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search movies & shows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-sky-500 transition-colors"
            />
          </div>

          {/* Folder Filter */}
          {folders.length > 1 && (
            <select
              value={selectedFolderId}
              onChange={(e) => setSelectedFolderId(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-sky-500"
            >
              <option value="" className="bg-[var(--bg-card)] text-[var(--text-primary)]">All Shared Folders</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id} className="bg-[var(--bg-card)] text-[var(--text-primary)]">
                  {f.name}
                </option>
              ))}
            </select>
          )}

          {/* Refresh Button */}
          <button
            onClick={fetchLibrary}
            title="Refresh Library"
            className="p-2 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-6 py-6 space-y-10 max-w-7xl mx-auto">
        {/* CINEMATIC HERO BANNER (Featured Item) */}
        {featured && !searchQuery && (
          <div className="relative rounded-3xl overflow-hidden bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl">
            {/* Backdrop Image */}
            <div className="relative w-full h-80 md:h-[420px] bg-gray-950 overflow-hidden">
              <img
                src={api.getMediaThumbnailUrl(featured.id)}
                alt={featured.title}
                className="w-full h-full object-cover object-center filter brightness-90"
                onError={(e) => {
                  const target = e.target as HTMLElement
                  target.style.display = 'none'
                }}
              />
              {/* Gradients */}
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-[var(--bg-card)]/50 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg-card)] via-[var(--bg-card)]/60 to-transparent" />

              {/* Content overlay */}
              <div className="absolute bottom-8 left-8 right-8 max-w-2xl space-y-4">
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-sky-600 text-white shadow-md">
                    FEATURED
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-black/60 text-sky-300 border border-sky-500/30">
                    {featured.resolution || 'HD'}
                  </span>
                  {featured.durationMs > 0 && (
                    <span className="text-xs text-gray-300 flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      <span>{formatDuration(featured.durationMs)}</span>
                    </span>
                  )}
                  {featured.hasSubtitles && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-white/10 text-gray-300">
                      CC
                    </span>
                  )}
                </div>

                <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight drop-shadow-xl line-clamp-2">
                  {featured.title}
                </h1>

                <p className="text-xs md:text-sm text-gray-300 line-clamp-2 font-mono opacity-80">
                  {featured.name}
                </p>

                {/* Hero Action Buttons */}
                <div className="flex items-center space-x-3 pt-2">
                  <button
                    onClick={() => handlePlayMedia(featured, featured.playbackPositionMs > 5000)}
                    className="px-7 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold flex items-center space-x-2 shadow-xl shadow-sky-600/40 hover:scale-105 active:scale-95 transition-all"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    <span>
                      {featured.playbackPositionMs > 5000 && !featured.completed
                        ? `Resume at ${Math.floor(featured.playbackPositionMs / 60000)}m`
                        : 'Watch Now'}
                    </span>
                  </button>

                  <button
                    onClick={() => setSelectedDetailsMedia(featured)}
                    className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium flex items-center space-x-2 backdrop-blur-md border border-white/10 transition-all"
                  >
                    <Info className="w-4 h-4" />
                    <span>Details</span>
                  </button>

                  <button
                    onClick={() => handleToggleWatchlist(featured)}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center border backdrop-blur-md transition-all ${
                      featured.isWatchlisted
                        ? 'bg-sky-500/30 border-sky-400 text-sky-300'
                        : 'bg-white/10 hover:bg-white/20 border-white/20 text-white'
                    }`}
                    title={featured.isWatchlisted ? 'In Watchlist' : 'Add to Watchlist'}
                  >
                    {featured.isWatchlisted ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CONTINUE WATCHING ROW */}
        {continueWatching.length > 0 && !searchQuery && (
          <section className="space-y-4">
            <div className="flex items-center space-x-2 text-sky-400">
              <TrendingUp className="w-5 h-5" />
              <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Continue Watching</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {continueWatching.map((item) => (
                <MediaCard
                  key={item.id}
                  media={item}
                  onPlay={(m) => handlePlayMedia(m, true)}
                  onOpenDetails={(m) => setSelectedDetailsMedia(m)}
                  onToggleWatchlist={handleToggleWatchlist}
                />
              ))}
            </div>
          </section>
        )}

        {/* WATCHLIST ROW */}
        {watchlist.length > 0 && !searchQuery && (
          <section className="space-y-4">
            <div className="flex items-center space-x-2 text-sky-400">
              <Bookmark className="w-5 h-5" />
              <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Your Watchlist</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {watchlist.map((item) => (
                <MediaCard
                  key={item.id}
                  media={item}
                  onPlay={(m) => handlePlayMedia(m, false)}
                  onOpenDetails={(m) => setSelectedDetailsMedia(m)}
                  onToggleWatchlist={handleToggleWatchlist}
                />
              ))}
            </div>
          </section>
        )}

        {/* RECENTLY ADDED */}
        {recentlyAdded.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center space-x-2 text-cyan-400">
              <Sparkles className="w-5 h-5" />
              <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                {searchQuery ? `Search Results (${allVideos.length})` : 'Recently Added'}
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {(searchQuery ? allVideos : recentlyAdded).map((item) => (
                <MediaCard
                  key={item.id}
                  media={item}
                  onPlay={(m) => handlePlayMedia(m, false)}
                  onOpenDetails={(m) => setSelectedDetailsMedia(m)}
                  onToggleWatchlist={handleToggleWatchlist}
                />
              ))}
            </div>
          </section>
        )}

        {/* TV SHOWS & SERIES */}
        {series.length > 0 && !searchQuery && (
          <section className="space-y-4">
            <div className="flex items-center space-x-2 text-blue-400">
              <Tv className="w-5 h-5" />
              <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">TV Shows & Series</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {series.map((item) => (
                <MediaCard
                  key={item.id}
                  media={item}
                  onPlay={(m) => handlePlayMedia(m, false)}
                  onOpenDetails={(m) => setSelectedDetailsMedia(m)}
                  onToggleWatchlist={handleToggleWatchlist}
                />
              ))}
            </div>
          </section>
        )}

        {/* EMPTY STATE */}
        {!loading && totalVideos === 0 && (
          <div className="py-20 text-center space-y-4 max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-[var(--glass-bg)] border border-[var(--border-subtle)] flex items-center justify-center mx-auto text-[var(--text-muted)]">
              <Film className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-[var(--text-primary)]">No Videos Found</h3>
            <p className="text-sm text-[var(--text-muted)]">
              {searchQuery
                ? `No media matches "${searchQuery}". Try a different search term.`
                : 'No video files were detected in your authorized phone folders. Authorize folders containing videos on your phone.'}
            </p>
            {onOpenFolderManager && (
              <button
                onClick={onOpenFolderManager}
                className="mt-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs flex items-center space-x-2 mx-auto shadow-md shadow-sky-600/30"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Manage Folders on Phone</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Movie Details Modal */}
      <MovieDetailsModal
        media={selectedDetailsMedia}
        isOpen={!!selectedDetailsMedia}
        onClose={() => setSelectedDetailsMedia(null)}
        onPlay={handlePlayMedia}
        onToggleWatchlist={handleToggleWatchlist}
      />

      {/* Cinematic Fullscreen Player */}
      {activePlayerMedia && (
        <CinematicVideoPlayer
          media={activePlayerMedia}
          initialResume={playerResumeMode}
          onClose={() => {
            setActivePlayerMedia(null)
            window.history.pushState({}, '', '/cinema')
            fetchLibrary()
          }}
          onProgressUpdate={(pos, dur, comp) => {
            setLibrary((prev) => {
              if (!prev) return prev
              const updateItem = (item: MediaItem) =>
                item.id === activePlayerMedia.id
                  ? { ...item, playbackPositionMs: pos, durationMs: dur, completed: comp }
                  : item
              return {
                ...prev,
                featured: prev.featured ? updateItem(prev.featured) : null,
                continueWatching: prev.continueWatching.map(updateItem),
                recentlyAdded: prev.recentlyAdded.map(updateItem),
                movies: prev.movies.map(updateItem),
                series: prev.series.map(updateItem),
                watchlist: prev.watchlist.map(updateItem),
                allVideos: prev.allVideos.map(updateItem),
              }
            })
          }}
        />
      )}
    </div>
  )
}
