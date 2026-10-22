import React, { useRef, useEffect, useState } from 'react'
import { X, Download, Music, Volume2, VolumeX, Play, Pause, Disc } from 'lucide-react'
import type { FileItem } from '../types'
import { api } from '../api/client'
import { formatBytes } from '../utils/fileUtils'

interface MediaPlayerModalProps {
  file: FileItem | null
  onClose: () => void
}

export const MediaPlayerModal: React.FC<MediaPlayerModalProps> = ({ file, onClose }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState<boolean>(true)
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [duration, setDuration] = useState<number>(0)
  const [isMuted, setIsMuted] = useState<boolean>(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!file) return null

  const streamUrl = api.getContentUrl(file.id)

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch(() => {})
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-3xl shadow-2xl overflow-hidden flex flex-col transition-all">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--glass-bg)]">
          <div className="flex items-center space-x-3 truncate">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Music className="w-4 h-4" />
            </div>
            <div className="truncate">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{file.name}</h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                {formatBytes(file.size)} • High-Fidelity Audio
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <a
              href={api.getContentUrl(file.id, true)}
              download={file.name}
              className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition"
              title="Download Song"
            >
              <Download className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Audio Visualizer Stage */}
        <div className="p-8 flex flex-col items-center text-center space-y-6 bg-gradient-to-b from-[var(--glass-bg)] to-transparent">
          {/* Animated Vinyl Disc */}
          <div className="relative group">
            <div className={`w-36 h-36 rounded-full bg-gradient-to-tr from-gray-950 via-zinc-900 to-gray-800 border-4 border-zinc-700/50 shadow-2xl flex items-center justify-center relative overflow-hidden ${
              isPlaying ? 'animate-spin' : ''
            }`} style={{ animationDuration: '6s' }}>
              {/* Vinyl grooves */}
              <div className="absolute inset-2 rounded-full border border-white/5" />
              <div className="absolute inset-5 rounded-full border border-white/5" />
              <div className="absolute inset-9 rounded-full border border-white/5" />
              {/* Disc Center Label */}
              <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-inner">
                <Disc className="w-6 h-6 text-white" />
              </div>
            </div>

            {/* Glowing Aura */}
            <div className={`absolute -inset-4 rounded-full bg-emerald-500/10 blur-xl pointer-events-none transition-opacity ${
              isPlaying ? 'opacity-100' : 'opacity-0'
            }`} />
          </div>

          <div className="space-y-1 max-w-xs">
            <p className="text-base font-bold text-[var(--text-primary)] truncate">{file.name}</p>
            <p className="text-xs text-[var(--text-muted)]">Playing directly from your phone storage</p>
          </div>

          {/* Sound Wave Bars */}
          <div className="flex items-end justify-center space-x-1.5 h-8">
            {[40, 75, 55, 90, 60, 85, 45, 95, 70, 50, 80, 65].map((h, i) => (
              <div
                key={i}
                className="w-1 rounded-full bg-gradient-to-t from-emerald-600 to-teal-400 transition-all duration-300"
                style={{
                  height: isPlaying ? `${Math.max(20, (h * ((i % 3) + 1)) % 100)}%` : '15%',
                  transitionDelay: `${i * 30}ms`
                }}
              />
            ))}
          </div>

          {/* Seek Bar */}
          <div className="w-full space-y-1.5">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={(e) => {
                const newT = parseFloat(e.target.value)
                setCurrentTime(newT)
                if (audioRef.current) audioRef.current.currentTime = newT
              }}
              className="w-full h-1.5 bg-[var(--border-subtle)] rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex justify-between text-[11px] font-mono text-[var(--text-muted)]">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center space-x-6">
            <button
              onClick={() => {
                if (audioRef.current) audioRef.current.currentTime = Math.max(0, currentTime - 10)
              }}
              className="p-2.5 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition"
              title="-10s"
            >
              -10s
            </button>

            <button
              onClick={togglePlay}
              className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30 transition transform active:scale-95"
            >
              {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
            </button>

            <button
              onClick={() => {
                if (audioRef.current) audioRef.current.currentTime = Math.min(duration, currentTime + 10)
              }}
              className="p-2.5 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition"
              title="+10s"
            >
              +10s
            </button>

            <button
              onClick={() => {
                if (!audioRef.current) return
                audioRef.current.muted = !isMuted
                setIsMuted(!isMuted)
              }}
              className="p-2.5 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
            </button>
          </div>

          <audio
            ref={audioRef}
            src={streamUrl}
            autoPlay
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={() => {
              if (audioRef.current) setCurrentTime(audioRef.current.currentTime)
            }}
            onLoadedMetadata={() => {
              if (audioRef.current) setDuration(audioRef.current.duration)
            }}
            className="hidden"
          />
        </div>
      </div>
    </div>
  )
}
export default MediaPlayerModal
