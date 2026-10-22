import React from 'react'
import { Play, Info, Check, Plus, Film, Clock } from 'lucide-react'
import type { MediaItem } from '../types'
import { api } from '../api/client'

interface MediaCardProps {
  media: MediaItem
  onPlay: (media: MediaItem, resume?: boolean) => void
  onOpenDetails: (media: MediaItem) => void
  onToggleWatchlist?: (media: MediaItem) => void
  aspectRatio?: 'video' | 'poster'
}

export const MediaCard: React.FC<MediaCardProps> = ({
  media,
  onPlay,
  onOpenDetails,
  onToggleWatchlist,
  aspectRatio = 'video',
}) => {
  const formatDuration = (ms: number) => {
    if (!ms || ms <= 0) return ''
    const totalSec = Math.floor(ms / 1000)
    const hours = Math.floor(totalSec / 3600)
    const minutes = Math.floor((totalSec % 3600) / 60)
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const progressPercent = media.durationMs > 0 && media.playbackPositionMs > 0
    ? Math.min(100, Math.round((media.playbackPositionMs / media.durationMs) * 100))
    : 0

  const hasProgress = progressPercent > 2 && !media.completed

  return (
    <div className="group relative flex flex-col rounded-xl overflow-hidden bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-sky-500/40 transition-all duration-300 hover:shadow-xl hover:shadow-sky-950/20 hover:-translate-y-1">
      {/* Thumbnail Banner */}
      <div className={`relative w-full ${aspectRatio === 'poster' ? 'aspect-[2/3]' : 'aspect-video'} bg-gray-950 overflow-hidden`}>
        <img
          src={api.getMediaThumbnailUrl(media.id)}
          alt={media.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            // Fallback to placeholder if thumbnail extraction is pending
            const target = e.target as HTMLElement
            target.style.display = 'none'
          }}
        />

        {/* Fallback Icon if image fails */}
        <div className="absolute inset-0 flex items-center justify-center -z-10 text-gray-700">
          <Film className="w-12 h-12 stroke-[1.2]" />
        </div>

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-transparent to-transparent opacity-80" />

        {/* Resolution Badge */}
        {media.resolution && (
          <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider bg-black/60 backdrop-blur-md text-sky-300 border border-sky-500/30 shadow-sm">
            {media.resolution}
          </div>
        )}

        {/* Duration Badge */}
        {media.durationMs > 0 && (
          <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-black/70 backdrop-blur-md text-gray-300 flex items-center space-x-1">
            <Clock className="w-3 h-3 text-gray-400" />
            <span>{formatDuration(media.durationMs)}</span>
          </div>
        )}

        {/* Watched Badge */}
        {media.completed && (
          <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/90 text-white flex items-center space-x-1 shadow-sm">
            <Check className="w-3 h-3 stroke-[2.5]" />
            <span>WATCHED</span>
          </div>
        )}

        {/* Hover Quick Action Overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center space-x-3 backdrop-blur-[2px]">
          <button
            onClick={() => onPlay(media, hasProgress)}
            title={hasProgress ? "Resume Playing" : "Play"}
            className="w-12 h-12 rounded-full bg-sky-600 hover:bg-sky-500 text-white flex items-center justify-center shadow-lg shadow-sky-600/50 hover:scale-110 active:scale-95 transition-all"
          >
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </button>

          {onToggleWatchlist && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleWatchlist(media)
              }}
              title={media.isWatchlisted ? "In Watchlist" : "Add to Watchlist"}
              className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${
                media.isWatchlisted
                  ? 'bg-sky-500/30 border-sky-400 text-sky-300'
                  : 'bg-white/10 hover:bg-white/20 border-white/20 text-white'
              }`}
            >
              {media.isWatchlisted ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation()
              onOpenDetails(media)
            }}
            title="Details & Info"
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 flex items-center justify-center backdrop-blur-md transition-all hover:scale-105"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>

        {/* Playback Progress Bar */}
        {hasProgress && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gray-800">
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-cyan-400"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Info Card Content */}
      <div className="p-3.5 flex flex-col justify-between flex-1">
        <div>
          <h4
            onClick={() => onOpenDetails(media)}
            title={media.title}
            className="text-sm font-semibold text-[var(--text-primary)] hover:text-sky-400 transition-colors line-clamp-1 cursor-pointer"
          >
            {media.title}
          </h4>

          <div className="flex items-center space-x-2 mt-1.5 text-xs text-[var(--text-muted)]">
            <span>{formatBytes(media.size)}</span>
            {media.hasSubtitles && (
              <>
                <span className="opacity-40">•</span>
                <span className="px-1 py-0.2 rounded text-[10px] bg-[var(--glass-bg)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">
                  CC
                </span>
              </>
            )}
            {media.audioTracksCount > 1 && (
              <>
                <span className="opacity-40">•</span>
                <span className="px-1 py-0.2 rounded text-[10px] bg-[var(--glass-bg)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                  {media.audioTracksCount} Audios
                </span>
              </>
            )}
          </div>
        </div>

        {hasProgress && (
          <div className="mt-2 text-[11px] text-sky-400 font-medium">
            Resume at {Math.floor(media.playbackPositionMs / 60000)}m
          </div>
        )}
      </div>
    </div>
  )
}
