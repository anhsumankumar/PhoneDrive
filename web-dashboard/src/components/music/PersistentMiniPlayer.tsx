import React from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Sliders,
  ListMusic,
  ChevronUp,
} from 'lucide-react'
import { useMusicPlayer } from './MusicPlayerContext'
import { api } from '../../api/client'

export const PersistentMiniPlayer: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    isShuffle,
    repeatMode,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    nextTrack,
    prevTrack,
    toggleShuffle,
    toggleRepeat,
    toggleFavorite,
    openNowPlaying,
    openEq,
    queue,
  } = useMusicPlayer()

  if (!currentTrack) return null

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const newPercent = Math.max(0, Math.min(1, clickX / rect.width))
    seek(newPercent * duration)
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0b1120]/95 backdrop-blur-2xl border-t border-sky-500/20 shadow-2xl text-white transition-all select-none">
      {/* Top Thin Interactive Scrub Progress Bar */}
      <div
        onClick={handleTimelineClick}
        className="group relative h-1.5 w-full bg-white/10 hover:h-2.5 cursor-pointer transition-all overflow-hidden"
      >
        <div
          className="h-full bg-gradient-to-r from-sky-500 via-cyan-400 to-teal-400 transition-all duration-100 relative"
          style={{ width: `${progressPercent}%` }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
        {/* Left: Track Info & Artwork */}
        <div className="flex items-center space-x-3.5 min-w-0 max-w-[35%] sm:max-w-[30%]">
          <div
            onClick={openNowPlaying}
            className="relative group shrink-0 w-12 h-12 rounded-xl overflow-hidden cursor-pointer shadow-lg shadow-sky-500/10 border border-white/10 bg-black/40 flex items-center justify-center"
          >
            <img
              src={api.getTrackArtworkUrl(currentTrack.id)}
              alt={currentTrack.title}
              className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${
                isPlaying ? 'animate-pulse' : ''
              }`}
              onError={(e) => {
                // If artwork image fails, replace with disc icon
                ;(e.target as HTMLElement).style.display = 'none'
              }}
            />
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <ChevronUp className="w-5 h-5 text-white drop-shadow" />
            </div>
          </div>

          <div className="truncate">
            <div className="flex items-center space-x-2">
              <h4
                onClick={openNowPlaying}
                className="text-xs sm:text-sm font-bold text-white truncate hover:text-sky-300 cursor-pointer transition-colors"
                title={currentTrack.title}
              >
                {currentTrack.title}
              </h4>
              {currentTrack.lossless && (
                <span className="shrink-0 px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  LOSSLESS
                </span>
              )}
            </div>
            <p
              className="text-[11px] text-gray-400 truncate hover:text-gray-200 transition-colors cursor-pointer"
              onClick={openNowPlaying}
              title={currentTrack.artist}
            >
              {currentTrack.artist}
            </p>
          </div>

          <button
            onClick={() => toggleFavorite(currentTrack)}
            className={`hidden sm:flex p-2 rounded-xl transition-transform active:scale-90 ${
              currentTrack.isFavorite
                ? 'text-rose-500 hover:text-rose-400'
                : 'text-gray-400 hover:text-white'
            }`}
            title={currentTrack.isFavorite ? 'Favorited' : 'Add to Favorites'}
          >
            <Heart className={`w-4 h-4 ${currentTrack.isFavorite ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* Center: Playback Controls */}
        <div className="flex flex-col items-center max-w-[45%] flex-1">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <button
              onClick={toggleShuffle}
              className={`p-1.5 rounded-lg text-xs transition-colors hidden sm:block ${
                isShuffle ? 'text-sky-400 font-bold' : 'text-gray-400 hover:text-white'
              }`}
              title={`Shuffle: ${isShuffle ? 'ON' : 'OFF'}`}
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              onClick={prevTrack}
              className="p-1.5 rounded-lg text-gray-300 hover:text-white transition-colors hover:scale-105 active:scale-95"
              title="Previous Track"
            >
              <SkipBack className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
            </button>

            <button
              onClick={togglePlay}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-tr from-sky-500 to-cyan-400 hover:from-sky-400 hover:to-cyan-300 text-slate-950 flex items-center justify-center shadow-lg shadow-sky-500/30 transition-all hover:scale-105 active:scale-95"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>

            <button
              onClick={nextTrack}
              className="p-1.5 rounded-lg text-gray-300 hover:text-white transition-colors hover:scale-105 active:scale-95"
              title="Next Track"
            >
              <SkipForward className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
            </button>

            <button
              onClick={toggleRepeat}
              className={`p-1.5 rounded-lg text-xs transition-colors hidden sm:block ${
                repeatMode !== 'off' ? 'text-sky-400 font-bold' : 'text-gray-400 hover:text-white'
              }`}
              title={`Repeat: ${repeatMode.toUpperCase()}`}
            >
              {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            </button>
          </div>

          <div className="hidden md:flex items-center space-x-2 text-[10px] font-mono text-gray-400 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Audio Features (EQ, Volume, Queue, Expand) */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Equalizer Button */}
          <button
            onClick={openEq}
            className="p-2 rounded-xl text-gray-300 hover:text-sky-300 hover:bg-white/5 transition-colors hidden sm:flex items-center space-x-1"
            title="10-Band Equalizer"
          >
            <Sliders className="w-4 h-4" />
          </button>

          {/* Volume Control */}
          <div className="hidden lg:flex items-center space-x-2 pl-2 border-l border-white/10">
            <button
              onClick={toggleMute}
              className="p-1.5 rounded-lg text-gray-300 hover:text-white transition-colors"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-16 xl:w-24 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-sky-400"
              title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
            />
          </div>

          {/* Queue & Expand Buttons */}
          <button
            onClick={openNowPlaying}
            className="p-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-colors relative"
            title="Now Playing & Queue"
          >
            <ListMusic className="w-4 h-4 sm:w-5 sm:h-5" />
            {queue.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-sky-500 text-[9px] font-bold text-white flex items-center justify-center">
                {queue.length > 99 ? '99+' : queue.length}
              </span>
            )}
          </button>

          <button
            onClick={openNowPlaying}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-200 hover:text-white transition-all hover:scale-105"
            title="Expand Player"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
