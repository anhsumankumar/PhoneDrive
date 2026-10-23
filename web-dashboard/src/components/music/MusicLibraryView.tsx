import React, { useState, useEffect, useMemo } from 'react'
import {
  Music,
  Play,
  Shuffle,
  Search,
  Heart,
  Plus,
  Disc,
  Mic2,
  Clock,
  ListMusic,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type { MusicTrack, MusicAlbum, MusicPlaylist, MusicLibraryData } from '../../types'
import { api } from '../../api/client'
import { useMusicPlayer } from './MusicPlayerContext'

export const MusicLibraryView: React.FC = () => {
  const { currentTrack, isPlaying, playTrack, toggleFavorite } = useMusicPlayer()

  const [library, setLibrary] = useState<MusicLibraryData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'overview' | 'songs' | 'albums' | 'artists' | 'playlists' | 'favorites'>('overview')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Selected Album Drill-down
  const [selectedAlbum, setSelectedAlbum] = useState<MusicAlbum | null>(null)

  // Playlist Create / Edit Modal
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState<boolean>(false)
  const [newPlaylistName, setNewPlaylistName] = useState<string>('')
  const [selectedPlaylist, setSelectedPlaylist] = useState<MusicPlaylist | null>(null)
  const [playlistTracks, setPlaylistTracks] = useState<MusicTrack[]>([])

  // Load Library Data
  const loadLibrary = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getMusicLibrary(searchQuery || undefined)
      setLibrary(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load music library')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLibrary()
  }, [])

  // Search filter
  const filteredTracks = useMemo(() => {
    if (!library?.tracks) return []
    if (!searchQuery.trim()) return library.tracks
    const q = searchQuery.toLowerCase()
    return library.tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q) ||
        (t.genre && t.genre.toLowerCase().includes(q))
    )
  }, [library, searchQuery])

  const formatDuration = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000)
    const m = Math.floor(totalSecs / 60)
    const s = totalSecs % 60
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  const handlePlayAll = () => {
    if (filteredTracks.length > 0) {
      playTrack(filteredTracks[0], filteredTracks)
    }
  }

  const handleShuffleAll = () => {
    if (filteredTracks.length > 0) {
      const shuffled = [...filteredTracks].sort(() => Math.random() - 0.5)
      playTrack(shuffled[0], shuffled)
    }
  }

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return
    try {
      const pl = await api.createMusicPlaylist(newPlaylistName.trim())
      setLibrary((prev) => (prev ? { ...prev, playlists: [pl, ...prev.playlists] } : null))
      setNewPlaylistName('')
      setIsCreatePlaylistOpen(false)
    } catch (err) {
      console.error('Failed to create playlist', err)
    }
  }

  const handleDeletePlaylist = async (playlistId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('Delete this playlist?')) return
    try {
      await api.deleteMusicPlaylist(playlistId)
      setLibrary((prev) =>
        prev ? { ...prev, playlists: prev.playlists.filter((p) => p.id !== playlistId) } : null
      )
      if (selectedPlaylist?.id === playlistId) {
        setSelectedPlaylist(null)
      }
    } catch (err) {
      console.error('Failed to delete playlist', err)
    }
  }

  const handleOpenPlaylist = async (pl: MusicPlaylist) => {
    setSelectedPlaylist(pl)
    try {
      const tracks = await api.getPlaylistTracks(pl.id)
      setPlaylistTracks(tracks)
    } catch (err) {
      console.error('Failed to load playlist tracks', err)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg-main)] text-[var(--text-primary)]">
      {/* Top Banner & Header */}
      <div className="px-6 py-6 border-b border-[var(--border-subtle)] bg-[var(--bg-card)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-cyan-400 flex items-center justify-center text-slate-950 shadow-md shadow-sky-500/20">
              <Music className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">PhoneDrive Music</h1>
              <p className="text-xs text-[var(--text-muted)]">
                Local lossless & high-fidelity streaming directly from your device
              </p>
            </div>
          </div>
        </div>

        {/* Global Search & Action Buttons */}
        <div className="flex items-center space-x-3">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search songs, artists, albums..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-[var(--input-bg)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-sky-500"
            />
          </div>

          <button
            onClick={handlePlayAll}
            disabled={filteredTracks.length === 0}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-sky-500/20 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Play All</span>
          </button>

          <button
            onClick={handleShuffleAll}
            disabled={filteredTracks.length === 0}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-hover)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition-all disabled:opacity-50"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Shuffle</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="px-6 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-card)] flex items-center space-x-1 overflow-x-auto no-scrollbar">
        {[
          { id: 'overview', label: 'Overview', icon: Sparkles },
          { id: 'songs', label: `Songs (${library?.totalTracks || 0})`, icon: Music },
          { id: 'albums', label: `Albums (${library?.albums.length || 0})`, icon: Disc },
          { id: 'artists', label: `Artists (${library?.artists.length || 0})`, icon: Mic2 },
          { id: 'playlists', label: `Playlists (${library?.playlists.length || 0})`, icon: ListMusic },
          { id: 'favorites', label: `Favorites (${library?.favorites.length || 0})`, icon: Heart },
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id && !selectedAlbum && !selectedPlaylist
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any)
                setSelectedAlbum(null)
                setSelectedPlaylist(null)
              }}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 ${
                isActive
                  ? 'bg-sky-500/15 text-sky-500 dark:text-sky-300 font-semibold border border-sky-500/30'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Main Body Stage */}
      <div className="flex-1 overflow-y-auto p-6 pb-28 no-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-3">
            <div className="w-10 h-10 border-3 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-[var(--text-muted)]">Scanning audio metadata & embedded covers...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-rose-500">{error}</p>
            <button
              onClick={loadLibrary}
              className="px-4 py-2 rounded-xl bg-sky-500 text-white text-xs font-semibold"
            >
              Retry
            </button>
          </div>
        ) : !library || library.totalTracks === 0 ? (
          <div className="text-center py-16 space-y-4 max-w-md mx-auto">
            <div className="w-16 h-16 rounded-full bg-sky-500/10 text-sky-500 flex items-center justify-center mx-auto">
              <Music className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">No Music Tracks Found</h3>
            <p className="text-xs text-[var(--text-muted)]">
              No audio files were detected in your shared folders. Add a folder with MP3, FLAC, M4A, or WAV files from the PC application or Android phone to begin streaming!
            </p>
          </div>
        ) : (
          <>
            {/* DRILL-DOWN: SELECTED ALBUM */}
            {selectedAlbum && (
              <div className="space-y-6 animate-fadeIn">
                <button
                  onClick={() => setSelectedAlbum(null)}
                  className="text-xs text-sky-400 hover:underline flex items-center space-x-1"
                >
                  <span>← Back to Albums</span>
                </button>

                <div className="flex flex-col sm:flex-row items-center sm:items-end space-y-4 sm:space-y-0 sm:space-x-6 p-6 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                  <div className="w-40 h-40 rounded-2xl overflow-hidden shadow-xl border border-[var(--border-subtle)] shrink-0">
                    <img
                      src={api.getTrackArtworkUrl(selectedAlbum.coverTrackId)}
                      alt={selectedAlbum.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="space-y-2 text-center sm:text-left">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-sky-400">Album</span>
                    <h2 className="text-2xl font-extrabold text-[var(--text-primary)]">{selectedAlbum.name}</h2>
                    <p className="text-sm text-[var(--text-secondary)] font-medium">
                      {selectedAlbum.artist} • {selectedAlbum.year || 'Unknown Year'} • {selectedAlbum.trackCount} Songs
                    </p>
                    <div className="pt-2 flex items-center space-x-3">
                      <button
                        onClick={() => playTrack(selectedAlbum.tracks[0], selectedAlbum.tracks)}
                        className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center space-x-2 shadow-md shadow-sky-500/20"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Play Album</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Album Tracks Table */}
                <div className="space-y-1">
                  {selectedAlbum.tracks.map((track, idx) => (
                    <div
                      key={track.id}
                      onClick={() => playTrack(track, selectedAlbum.tracks)}
                      className="flex items-center justify-between p-3 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center space-x-3 truncate">
                        <span className="w-6 text-center text-xs font-mono text-[var(--text-muted)]">
                          {currentTrack?.id === track.id && isPlaying ? (
                            <Disc className="w-4 h-4 text-sky-400 animate-spin" />
                          ) : (
                            track.trackNumber || idx + 1
                          )}
                        </span>
                        <div className="truncate">
                          <h4 className={`text-xs font-semibold truncate ${currentTrack?.id === track.id ? 'text-sky-400' : 'text-[var(--text-primary)]'}`}>
                            {track.title}
                          </h4>
                          <p className="text-[11px] text-[var(--text-muted)] truncate">{track.artist}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4 shrink-0">
                        {track.lossless && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            FLAC
                          </span>
                        )}
                        <span className="text-xs font-mono text-[var(--text-muted)]">
                          {formatDuration(track.durationMs)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleFavorite(track)
                          }}
                          className={`p-1 text-gray-400 hover:text-rose-500 ${track.isFavorite ? 'text-rose-500' : ''}`}
                        >
                          <Heart className={`w-4 h-4 ${track.isFavorite ? 'fill-current' : ''}`} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DRILL-DOWN: SELECTED PLAYLIST */}
            {selectedPlaylist && !selectedAlbum && (
              <div className="space-y-6 animate-fadeIn">
                <button
                  onClick={() => setSelectedPlaylist(null)}
                  className="text-xs text-sky-400 hover:underline flex items-center space-x-1"
                >
                  <span>← Back to Playlists</span>
                </button>

                <div className="flex items-center justify-between p-6 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-sky-400">Playlist</span>
                    <h2 className="text-2xl font-extrabold text-[var(--text-primary)]">{selectedPlaylist.name}</h2>
                    <p className="text-xs text-[var(--text-muted)]">{playlistTracks.length} Songs</p>
                  </div>
                  {playlistTracks.length > 0 && (
                    <button
                      onClick={() => playTrack(playlistTracks[0], playlistTracks)}
                      className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center space-x-2 shadow-md shadow-sky-500/20"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Play Playlist</span>
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  {playlistTracks.map((track, idx) => (
                    <div
                      key={track.id}
                      onClick={() => playTrack(track, playlistTracks)}
                      className="flex items-center justify-between p-3 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center space-x-3 truncate">
                        <span className="w-6 text-center text-xs font-mono text-[var(--text-muted)]">{idx + 1}</span>
                        <div className="truncate">
                          <h4 className="text-xs font-semibold text-[var(--text-primary)] truncate">{track.title}</h4>
                          <p className="text-[11px] text-[var(--text-muted)] truncate">{track.artist} • {track.album}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-mono text-[var(--text-muted)]">{formatDuration(track.durationMs)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: OVERVIEW */}
            {activeTab === 'overview' && !selectedAlbum && !selectedPlaylist && (
              <div className="space-y-8 animate-fadeIn">
                {/* Continue Listening / Recently Played Row */}
                {library.recentlyPlayed.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-sky-400" />
                      <span>Recently Played</span>
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {library.recentlyPlayed.slice(0, 6).map((track) => (
                        <div
                          key={track.id}
                          onClick={() => playTrack(track, library.recentlyPlayed)}
                          className="group relative flex flex-col p-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-sky-500/40 cursor-pointer transition-all hover:shadow-lg"
                        >
                          <div className="relative aspect-square rounded-xl overflow-hidden mb-2.5 bg-black/40">
                            <img
                              src={api.getTrackArtworkUrl(track.id)}
                              alt={track.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <div className="w-10 h-10 rounded-full bg-sky-500 text-slate-950 flex items-center justify-center shadow-lg">
                                <Play className="w-5 h-5 fill-current ml-0.5" />
                              </div>
                            </div>
                          </div>
                          <h4 className="text-xs font-bold text-[var(--text-primary)] truncate">{track.title}</h4>
                          <p className="text-[11px] text-[var(--text-muted)] truncate">{track.artist}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Popular Albums Grid */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center space-x-2">
                      <Disc className="w-4 h-4 text-sky-400" />
                      <span>Featured Albums</span>
                    </h3>
                    <button
                      onClick={() => setActiveTab('albums')}
                      className="text-xs text-sky-400 hover:underline"
                    >
                      View All ({library.albums.length})
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {library.albums.slice(0, 6).map((album) => (
                      <div
                        key={album.id}
                        onClick={() => setSelectedAlbum(album)}
                        className="group flex flex-col p-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-sky-500/40 cursor-pointer transition-all hover:shadow-lg"
                      >
                        <div className="relative aspect-square rounded-xl overflow-hidden mb-2.5 bg-black/40 shadow-md">
                          <img
                            src={api.getTrackArtworkUrl(album.coverTrackId)}
                            alt={album.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>
                        <h4 className="text-xs font-bold text-[var(--text-primary)] truncate">{album.name}</h4>
                        <p className="text-[11px] text-[var(--text-muted)] truncate">{album.artist}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Newly Added Songs Quick List */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center space-x-2">
                    <Music className="w-4 h-4 text-sky-400" />
                    <span>All Songs Overview</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {library.tracks.slice(0, 10).map((track) => (
                      <div
                        key={track.id}
                        onClick={() => playTrack(track, library.tracks)}
                        className="flex items-center justify-between p-2.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-all group"
                      >
                        <div className="flex items-center space-x-3 truncate">
                          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-black/20">
                            <img
                              src={api.getTrackArtworkUrl(track.id)}
                              alt={track.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="truncate">
                            <h4 className="text-xs font-bold text-[var(--text-primary)] truncate">{track.title}</h4>
                            <p className="text-[11px] text-[var(--text-muted)] truncate">{track.artist} • {track.album}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 shrink-0 pr-2">
                          <span className="text-xs font-mono text-[var(--text-muted)]">{formatDuration(track.durationMs)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: ALL SONGS */}
            {activeTab === 'songs' && !selectedAlbum && !selectedPlaylist && (
              <div className="space-y-2 animate-fadeIn">
                {filteredTracks.map((track, idx) => {
                  const isCurrent = currentTrack?.id === track.id
                  return (
                    <div
                      key={track.id}
                      onClick={() => playTrack(track, filteredTracks)}
                      className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all group ${
                        isCurrent
                          ? 'bg-sky-500/15 border border-sky-500/30 font-semibold'
                          : 'hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-3.5 truncate">
                        <span className="w-6 text-center text-xs font-mono text-[var(--text-muted)]">
                          {isCurrent && isPlaying ? (
                            <Disc className="w-4 h-4 text-sky-400 animate-spin" />
                          ) : (
                            idx + 1
                          )}
                        </span>
                        <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-black/20 shadow-sm">
                          <img
                            src={api.getTrackArtworkUrl(track.id)}
                            alt={track.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="truncate">
                          <h4 className={`text-xs font-bold truncate ${isCurrent ? 'text-sky-400' : 'text-[var(--text-primary)]'}`}>
                            {track.title}
                          </h4>
                          <p className="text-[11px] text-[var(--text-muted)] truncate">
                            {track.artist} • {track.album}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4 shrink-0">
                        {track.lossless && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            LOSSLESS
                          </span>
                        )}
                        <span className="text-xs font-mono text-[var(--text-muted)]">
                          {formatDuration(track.durationMs)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleFavorite(track)
                          }}
                          className={`p-1 text-gray-400 hover:text-rose-500 ${track.isFavorite ? 'text-rose-500' : ''}`}
                        >
                          <Heart className={`w-4 h-4 ${track.isFavorite ? 'fill-current' : ''}`} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* TAB: ALBUMS GRID */}
            {activeTab === 'albums' && !selectedAlbum && !selectedPlaylist && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 animate-fadeIn">
                {library.albums.map((album) => (
                  <div
                    key={album.id}
                    onClick={() => setSelectedAlbum(album)}
                    className="group flex flex-col p-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-sky-500/40 cursor-pointer transition-all hover:shadow-lg"
                  >
                    <div className="relative aspect-square rounded-xl overflow-hidden mb-2.5 bg-black/40 shadow-md">
                      <img
                        src={api.getTrackArtworkUrl(album.coverTrackId)}
                        alt={album.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <h4 className="text-xs font-bold text-[var(--text-primary)] truncate">{album.name}</h4>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">{album.artist}</p>
                    <span className="text-[10px] text-gray-400 mt-1">{album.trackCount} Tracks</span>
                  </div>
                ))}
              </div>
            )}

            {/* TAB: PLAYLISTS */}
            {activeTab === 'playlists' && !selectedAlbum && !selectedPlaylist && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Your Playlists</h3>
                  <button
                    onClick={() => setIsCreatePlaylistOpen(true)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-sky-500 text-slate-950 font-bold text-xs shadow-md"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Playlist</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {library.playlists.map((pl) => (
                    <div
                      key={pl.id}
                      onClick={() => handleOpenPlaylist(pl)}
                      className="group p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-sky-500/40 cursor-pointer transition-all flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                          <ListMusic className="w-5 h-5" />
                        </div>
                        <button
                          onClick={(e) => handleDeletePlaylist(pl.id, e)}
                          className="p-1 rounded-lg text-gray-400 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete Playlist"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-[var(--text-primary)] truncate">{pl.name}</h4>
                        <p className="text-xs text-[var(--text-muted)]">{pl.trackCount} Songs</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: FAVORITES */}
            {activeTab === 'favorites' && !selectedAlbum && !selectedPlaylist && (
              <div className="space-y-2 animate-fadeIn">
                {library.favorites.length === 0 ? (
                  <div className="text-center py-12 text-xs text-[var(--text-muted)]">
                    No favorite songs added yet. Click the heart icon on any song to save it here!
                  </div>
                ) : (
                  library.favorites.map((track) => (
                    <div
                      key={track.id}
                      onClick={() => playTrack(track, library.favorites)}
                      className="flex items-center justify-between p-3 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center space-x-3.5 truncate">
                        <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-black/20">
                          <img
                            src={api.getTrackArtworkUrl(track.id)}
                            alt={track.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="truncate">
                          <h4 className="text-xs font-bold text-[var(--text-primary)] truncate">{track.title}</h4>
                          <p className="text-[11px] text-[var(--text-muted)] truncate">{track.artist} • {track.album}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-xs font-mono text-[var(--text-muted)]">{formatDuration(track.durationMs)}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleFavorite(track)
                          }}
                          className="p-1 text-rose-500"
                        >
                          <Heart className="w-4 h-4 fill-current" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Playlist Modal */}
      {isCreatePlaylistOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-[var(--text-primary)]">Create New Playlist</h3>
            <input
              type="text"
              placeholder="Playlist name..."
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-sky-500"
              autoFocus
            />
            <div className="flex items-center justify-end space-x-2">
              <button
                onClick={() => setIsCreatePlaylistOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePlaylist}
                className="px-4 py-2 rounded-xl bg-sky-500 text-slate-950 font-bold text-xs"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
