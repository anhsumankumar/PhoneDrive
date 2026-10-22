import React, { useState, useEffect } from 'react'
import {
  X,
  Play,
  RotateCcw,
  Check,
  Plus,
  Clock,
  HardDrive,
  Subtitles,
  Volume2,
  Calendar,
  Layers,
  Loader2,
} from 'lucide-react'
import type { MediaItem, MediaTrack } from '../types'
import { api } from '../api/client'

interface MovieDetailsModalProps {
  media: MediaItem | null
  isOpen: boolean
  onClose: () => void
  onPlay: (media: MediaItem, resume: boolean) => void
  onToggleWatchlist?: (media: MediaItem) => void
}

export const MovieDetailsModal: React.FC<MovieDetailsModalProps> = ({
  media,
  isOpen,
  onClose,
  onPlay,
  onToggleWatchlist,
}) => {
  const [tracks, setTracks] = useState<MediaTrack[]>([])
  const [loadingTracks, setLoadingTracks] = useState<boolean>(false)

  useEffect(() => {
    if (media && isOpen) {
      setLoadingTracks(true)
      api.getMediaTracks(media.id)
        .then((res) => setTracks(res))
        .catch(() => setTracks([]))
        .finally(() => setLoadingTracks(false))
    }
  }, [media, isOpen])

  if (!isOpen || !media) return null

  const formatDuration = (ms: number) => {
    if (!ms || ms <= 0) return 'Unknown Duration'
    const totalSec = Math.floor(ms / 1000)
    const hours = Math.floor(totalSec / 3600)
    const minutes = Math.floor((totalSec % 3600) / 60)
    const seconds = totalSec % 60
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`
    }
    return `${minutes}m ${seconds}s`
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatDate = (timestamp: number) => {
    if (!timestamp) return '-'
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const hasProgress = media.playbackPositionMs > 5000 && !media.completed
  const progressMin = Math.floor(media.playbackPositionMs / 60000)
  const progressSec = Math.floor((media.playbackPositionMs % 60000) / 1000)

  const audioTracks = tracks.filter((t) => t.type === 'audio')
  const subtitleTracks = tracks.filter((t) => t.type === 'subtitle')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] transition-colors duration-200">
        {/* Backdrop Banner */}
        <div className="relative w-full h-64 md:h-80 bg-gray-950 overflow-hidden shrink-0">
          <img
            src={api.getMediaThumbnailUrl(media.id)}
            alt={media.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLElement
              target.style.display = 'none'
            }}
          />
          {/* Gradients */}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-[var(--bg-card)]/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg-card)]/80 via-transparent to-transparent" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-white/10 flex items-center justify-center backdrop-blur-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header Title Overlay */}
          <div className="absolute bottom-6 left-6 right-6">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-sky-600/90 text-white shadow-sm">
                {media.resolution || 'HD'}
              </span>
              {media.isSeries && (
                <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  Series
                </span>
              )}
              {media.completed && (
                <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>Watched</span>
                </span>
              )}
            </div>

            <h2 className="text-2xl md:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight drop-shadow-md">
              {media.title}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1 font-mono truncate">{media.name}</p>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {hasProgress ? (
              <>
                <button
                  onClick={() => {
                    onPlay(media, true)
                    onClose()
                  }}
                  className="px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold flex items-center space-x-2 shadow-lg shadow-sky-600/30 active:scale-98 transition-all"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>Resume at {progressMin}:{progressSec.toString().padStart(2, '0')}</span>
                </button>

                <button
                  onClick={() => {
                    onPlay(media, false)
                    onClose()
                  }}
                  className="px-5 py-3 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-hover)] text-[var(--text-primary)] font-medium flex items-center space-x-2 border border-[var(--border-subtle)] transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Start from Beginning</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  onPlay(media, false)
                  onClose()
                }}
                className="px-8 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold flex items-center space-x-2 shadow-lg shadow-sky-600/30 active:scale-98 transition-all"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Play Now</span>
              </button>
            )}

            {onToggleWatchlist && (
              <button
                onClick={() => onToggleWatchlist(media)}
                className={`px-5 py-3 rounded-xl flex items-center space-x-2 font-medium border transition-all ${
                  media.isWatchlisted
                    ? 'bg-sky-500/20 border-sky-500 text-sky-400'
                    : 'bg-[var(--glass-bg)] hover:bg-[var(--glass-hover)] border-[var(--border-subtle)] text-[var(--text-primary)]'
                }`}
              >
                {media.isWatchlisted ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>In Watchlist</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Add to Watchlist</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Quick Meta Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)]">
            <div className="flex items-center space-x-3">
              <Clock className="w-5 h-5 text-sky-400" />
              <div>
                <p className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wider">Duration</p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{formatDuration(media.durationMs)}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Layers className="w-5 h-5 text-cyan-400" />
              <div>
                <p className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wider">Resolution</p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {media.resolution} {media.width > 0 ? `(${media.width}x${media.height})` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <HardDrive className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wider">File Size</p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{formatBytes(media.size)}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Calendar className="w-5 h-5 text-sky-400" />
              <div>
                <p className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wider">Modified</p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{formatDate(media.lastModified)}</p>
              </div>
            </div>
          </div>

          {/* Tracks: Audio & Subtitles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Audio Tracks */}
            <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)] space-y-3">
              <div className="flex items-center space-x-2 text-sky-400 font-semibold text-sm">
                <Volume2 className="w-4 h-4" />
                <span>Audio Tracks ({audioTracks.length || media.audioTracksCount})</span>
                {loadingTracks && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-muted)]" />}
              </div>
              <div className="space-y-1.5">
                {loadingTracks ? (
                  <div className="px-3 py-2 text-xs text-[var(--text-muted)]">Detecting audio languages...</div>
                ) : audioTracks.length > 0 ? (
                  audioTracks.map((track) => (
                    <div
                      key={track.id}
                      className="px-3 py-2 rounded-lg bg-[var(--bg-app)] text-xs text-[var(--text-primary)] flex items-center justify-between border border-[var(--border-subtle)]"
                    >
                      <span className="font-medium">{track.label}</span>
                      {track.isDefault && (
                        <span className="text-[10px] text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                          Default
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-2 rounded-lg bg-[var(--bg-app)] text-xs text-[var(--text-muted)] border border-[var(--border-subtle)]">
                    Standard Audio Stream
                  </div>
                )}
              </div>
            </div>

            {/* Subtitles */}
            <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)] space-y-3">
              <div className="flex items-center space-x-2 text-cyan-400 font-semibold text-sm">
                <Subtitles className="w-4 h-4" />
                <span>Subtitles ({subtitleTracks.length || (media.hasSubtitles ? 'Available' : 'None')})</span>
                {loadingTracks && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-muted)]" />}
              </div>
              <div className="space-y-1.5">
                {loadingTracks ? (
                  <div className="px-3 py-2 text-xs text-[var(--text-muted)]">Scanning for subtitles...</div>
                ) : subtitleTracks.length > 0 ? (
                  subtitleTracks.map((sub) => (
                    <div
                      key={sub.id}
                      className="px-3 py-2 rounded-lg bg-[var(--bg-app)] text-xs text-[var(--text-primary)] flex items-center justify-between border border-[var(--border-subtle)]"
                    >
                      <span className="font-medium">{sub.label}</span>
                      <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded font-mono border border-cyan-500/20">
                        {sub.source === 'sidecar' ? 'External SRT/VTT' : 'Embedded'}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-2 rounded-lg bg-[var(--bg-app)] text-xs text-[var(--text-muted)] border border-[var(--border-subtle)]">
                    {media.hasSubtitles ? 'Subtitle tracks ready' : 'No subtitles detected'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Technical Specs & Direct Stream Info */}
          <div className="p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] space-y-1.5">
            <div className="flex justify-between">
              <span>MIME Type:</span>
              <span className="font-mono text-[var(--text-primary)]">{media.mimeType}</span>
            </div>
            <div className="flex justify-between">
              <span>Streaming Engine:</span>
              <span className="text-sky-400 font-medium">HTTP 206 Partial Content (Range Seeking)</span>
            </div>
            <div className="flex justify-between">
              <span>Storage Location:</span>
              <span className="text-[var(--text-primary)]">Android Device (SAF Protected)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
