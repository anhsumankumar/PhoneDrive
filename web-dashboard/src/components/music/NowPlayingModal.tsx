import React, { useState, useRef, useEffect } from 'react'
import {
  X,
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Sliders,
  ListMusic,
  Activity,
  Disc,
  Trash2,
  MoveUp,
  MoveDown,
  Download,
} from 'lucide-react'
import { useMusicPlayer, EQ_FREQUENCIES, EQ_PRESETS } from './MusicPlayerContext'
import { api } from '../../api/client'

export const NowPlayingModal: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    queue,
    currentIndex,
    repeatMode,
    isShuffle,
    eqEnabled,
    eqGains,
    eqPreset,
    preampGain,
    analyserNode,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    nextTrack,
    prevTrack,
    removeFromQueue,
    clearQueue,
    reorderQueue,
    toggleShuffle,
    toggleRepeat,
    toggleFavorite,
    setEqGain,
    setEqPreset,
    toggleEq,
    setPreampGain,
    resetEq,
    isNowPlayingOpen,
    closeNowPlaying,
    playTrack,
  } = useMusicPlayer()

  const [activeTab, setActiveTab] = useState<'visualizer' | 'equalizer' | 'queue'>('visualizer')
  const [visualizerMode, setVisualizerMode] = useState<'bars' | 'wave' | 'vinyl'>('bars')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Real-time Canvas Visualizer rendering loop
  useEffect(() => {
    if (!isNowPlayingOpen || activeTab !== 'visualizer' || visualizerMode === 'vinyl') {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let isSubscribed = true

    const renderVisualizer = () => {
      if (!isSubscribed) return

      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)

      if (analyserNode && isPlaying) {
        const bufferLength = analyserNode.frequencyBinCount

        if (visualizerMode === 'bars') {
          const dataArray = new Uint8Array(bufferLength)
          analyserNode.getByteFrequencyData(dataArray)

          const numBars = 48
          const barWidth = (width / numBars) - 3
          let x = 2

          for (let i = 0; i < numBars; i++) {
            const index = Math.floor((i / numBars) * (bufferLength * 0.75))
            const barHeight = Math.max(4, (dataArray[index] / 255) * height * 0.9)

            // Dynamic gradient bar
            const grad = ctx.createLinearGradient(0, height, 0, height - barHeight)
            grad.addColorStop(0, '#0284c7') // sky blue
            grad.addColorStop(0.6, '#38bdf8') // light cyan
            grad.addColorStop(1, '#a7f3d0') // emerald glow

            ctx.fillStyle = grad
            ctx.beginPath()
            ctx.roundRect(x, height - barHeight, barWidth, barHeight, [4, 4, 0, 0])
            ctx.fill()

            x += barWidth + 3
          }
        } else if (visualizerMode === 'wave') {
          const timeData = new Uint8Array(bufferLength)
          analyserNode.getByteTimeDomainData(timeData)

          ctx.lineWidth = 3
          ctx.strokeStyle = '#38bdf8'
          ctx.shadowBlur = 12
          ctx.shadowColor = '#0ea5e9'
          ctx.beginPath()

          const sliceWidth = width / bufferLength
          let x = 0

          for (let i = 0; i < bufferLength; i++) {
            const v = timeData[i] / 128.0
            const y = (v * height) / 2

            if (i === 0) {
              ctx.moveTo(x, y)
            } else {
              ctx.lineTo(x, y)
            }
            x += sliceWidth
          }

          ctx.lineTo(width, height / 2)
          ctx.stroke()
          ctx.shadowBlur = 0 // reset
        }
      } else {
        // Idle gentle waveform line when paused
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(0, height / 2)
        ctx.lineTo(width, height / 2)
        ctx.stroke()
      }

      animationFrameRef.current = requestAnimationFrame(renderVisualizer)
    }

    renderVisualizer()

    return () => {
      isSubscribed = false
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [isNowPlayingOpen, activeTab, visualizerMode, analyserNode, isPlaying])

  if (!isNowPlayingOpen || !currentTrack) return null

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, clickX / rect.width))
    seek(percent * duration)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-3xl animate-fadeIn overflow-hidden select-none">
      {/* Ambient Album Art Glow Background */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-25 filter blur-3xl scale-125 pointer-events-none transition-all duration-1000"
        style={{ backgroundImage: `url(${api.getTrackArtworkUrl(currentTrack.id)})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-4xl h-full max-h-[92vh] flex flex-col justify-between p-6 md:p-8">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <button
            onClick={closeNowPlaying}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/15 text-white flex items-center justify-center transition-all hover:scale-105"
            title="Minimize (Esc)"
          >
            <ChevronDown className="w-6 h-6" />
          </button>

          <div className="flex items-center space-x-1.5 p-1 rounded-2xl bg-white/5 border border-white/10">
            <button
              onClick={() => setActiveTab('visualizer')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'visualizer'
                  ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/25'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Playing</span>
            </button>
            <button
              onClick={() => setActiveTab('equalizer')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'equalizer'
                  ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/25'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Equalizer</span>
            </button>
            <button
              onClick={() => setActiveTab('queue')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'queue'
                  ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/25'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              <ListMusic className="w-3.5 h-3.5" />
              <span>Queue ({queue.length})</span>
            </button>
          </div>

          <a
            href={api.getContentUrl(currentTrack.id, true)}
            download={currentTrack.fileName}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/15 text-white flex items-center justify-center transition-all hover:scale-105"
            title="Download Audio File"
          >
            <Download className="w-4 h-4" />
          </a>
        </div>

        {/* Center Stage: Tab Content */}
        <div className="flex-1 flex flex-col items-center justify-center my-6 overflow-y-auto no-scrollbar">
          {/* TAB 1: VISUALIZER / VINYL STAGE */}
          {activeTab === 'visualizer' && (
            <div className="w-full max-w-md flex flex-col items-center space-y-6 animate-fadeIn">
              {/* Visualizer Mode Switcher */}
              <div className="flex items-center space-x-2 bg-white/5 p-1 rounded-full border border-white/10 text-[11px] font-semibold text-gray-400">
                <button
                  onClick={() => setVisualizerMode('bars')}
                  className={`px-3 py-1 rounded-full transition-all ${
                    visualizerMode === 'bars' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold' : 'hover:text-white'
                  }`}
                >
                  Bars
                </button>
                <button
                  onClick={() => setVisualizerMode('wave')}
                  className={`px-3 py-1 rounded-full transition-all ${
                    visualizerMode === 'wave' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold' : 'hover:text-white'
                  }`}
                >
                  Waveform
                </button>
                <button
                  onClick={() => setVisualizerMode('vinyl')}
                  className={`px-3 py-1 rounded-full transition-all ${
                    visualizerMode === 'vinyl' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold' : 'hover:text-white'
                  }`}
                >
                  Vinyl Mode
                </button>
              </div>

              {visualizerMode === 'vinyl' ? (
                /* Animated Spinning Vinyl Disc */
                <div className="relative group my-4">
                  <div
                    className={`w-56 h-56 sm:w-64 sm:h-64 rounded-full bg-gradient-to-tr from-slate-950 via-zinc-900 to-slate-900 border-4 border-zinc-700/60 shadow-2xl flex items-center justify-center relative overflow-hidden ${
                      isPlaying ? 'animate-spin' : ''
                    }`}
                    style={{ animationDuration: '8s' }}
                  >
                    <div className="absolute inset-3 rounded-full border border-white/5" />
                    <div className="absolute inset-7 rounded-full border border-white/5" />
                    <div className="absolute inset-12 rounded-full border border-white/5" />
                    <div className="absolute inset-16 rounded-full border border-white/5" />

                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white/20 shadow-inner flex items-center justify-center bg-black">
                      <img
                        src={api.getTrackArtworkUrl(currentTrack.id)}
                        alt={currentTrack.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* Album Artwork Cover Card with Canvas Spectrum Overlay */
                <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-3xl overflow-hidden shadow-2xl border border-white/15 bg-black/60 group">
                  <img
                    src={api.getTrackArtworkUrl(currentTrack.id)}
                    alt={currentTrack.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  {/* Canvas Visualizer Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-end p-2">
                    <canvas
                      ref={canvasRef}
                      width={280}
                      height={80}
                      className="w-full h-full pointer-events-none"
                    />
                  </div>
                </div>
              )}

              {/* Title, Artist, & Badges */}
              <div className="text-center space-y-1.5 w-full">
                <div className="flex items-center justify-center space-x-2">
                  <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight truncate max-w-sm">
                    {currentTrack.title}
                  </h2>
                  <button
                    onClick={() => toggleFavorite(currentTrack)}
                    className={`p-1.5 rounded-full transition-transform active:scale-90 ${
                      currentTrack.isFavorite ? 'text-rose-500' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Heart className={`w-5 h-5 ${currentTrack.isFavorite ? 'fill-current' : ''}`} />
                  </button>
                </div>

                <p className="text-sm font-medium text-sky-400 truncate max-w-xs mx-auto">
                  {currentTrack.artist}
                </p>

                <p className="text-xs text-gray-400 truncate max-w-xs mx-auto">
                  {currentTrack.album} {currentTrack.year ? `(${currentTrack.year})` : ''}
                </p>

                {/* Quality & Codec Badges */}
                <div className="flex items-center justify-center space-x-2 pt-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white/10 text-cyan-300 border border-cyan-500/30">
                    {currentTrack.codec}
                  </span>
                  {currentTrack.lossless ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      HI-RES LOSSLESS
                    </span>
                  ) : currentTrack.bitrate ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono text-gray-400 bg-white/5 border border-white/10">
                      {Math.round(currentTrack.bitrate / 1000)} kbps
                    </span>
                  ) : null}
                  {currentTrack.sampleRate && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono text-gray-400 bg-white/5 border border-white/10">
                      {(currentTrack.sampleRate / 1000).toFixed(1)} kHz
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EQUALIZER */}
          {activeTab === 'equalizer' && (
            <div className="w-full max-w-xl bg-white/[0.03] border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6 animate-fadeIn">
              {/* EQ Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                    <Sliders className="w-5 h-5 text-sky-400" />
                    <span>10-Band Graphic Equalizer</span>
                  </h3>
                  <p className="text-xs text-gray-400">
                    Studio-grade Web Audio API parametric peaking filters
                  </p>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={resetEq}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => toggleEq()}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      eqEnabled
                        ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/30'
                        : 'bg-white/10 text-gray-400 hover:text-white'
                    }`}
                  >
                    EQ {eqEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* Preset Selector */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Presets
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(EQ_PRESETS).map((pName) => (
                    <button
                      key={pName}
                      onClick={() => setEqPreset(pName)}
                      className={`px-3 py-1 rounded-xl text-xs font-medium transition-all ${
                        eqPreset === pName
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
                          : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white border border-transparent'
                      }`}
                    >
                      {pName}
                    </button>
                  ))}
                </div>
              </div>

              {/* 10 Slider Bands */}
              <div className="grid grid-cols-10 gap-1.5 sm:gap-2 pt-2 items-end h-52">
                {EQ_FREQUENCIES.map((freq, idx) => {
                  const gain = eqGains[idx] || 0
                  const freqLabel = freq >= 1000 ? `${freq / 1000}k` : `${freq}`
                  return (
                    <div key={freq} className="flex flex-col items-center h-full justify-between">
                      <span className="text-[10px] font-mono font-bold text-sky-400">
                        {gain > 0 ? `+${gain}` : gain}
                      </span>
                      <div className="relative flex-1 flex items-center justify-center my-2">
                        <input
                          type="range"
                          min="-12"
                          max="12"
                          step="1"
                          value={gain}
                          disabled={!eqEnabled}
                          onChange={(e) => setEqGain(idx, parseFloat(e.target.value))}
                          className="w-32 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-sky-400 -rotate-90 origin-center disabled:opacity-40"
                        />
                      </div>
                      <span className="text-[10px] font-mono text-gray-400 font-semibold">
                        {freqLabel}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Preamp Gain */}
              <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-300">
                  Preamp Master Gain: <span className="font-mono text-sky-400">{preampGain > 0 ? `+${preampGain}` : preampGain} dB</span>
                </span>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="1"
                  value={preampGain}
                  onChange={(e) => setPreampGain(parseFloat(e.target.value))}
                  className="w-36 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-sky-400"
                />
              </div>
            </div>
          )}

          {/* TAB 3: PLAYBACK QUEUE */}
          {activeTab === 'queue' && (
            <div className="w-full max-w-xl bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-4 animate-fadeIn flex flex-col h-[50vh]">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <ListMusic className="w-5 h-5 text-sky-400" />
                  <span>Playback Queue ({queue.length} Tracks)</span>
                </h3>
                <button
                  onClick={clearQueue}
                  className="px-3 py-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold transition-colors flex items-center space-x-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
                {queue.map((track, idx) => {
                  const isCurrent = idx === currentIndex
                  return (
                    <div
                      key={`${track.id}_${idx}`}
                      onClick={() => playTrack(track)}
                      className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                        isCurrent
                          ? 'bg-sky-500/20 border border-sky-500/40 text-white font-semibold'
                          : 'bg-white/[0.02] hover:bg-white/[0.06] text-gray-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <span className="w-5 text-center text-xs font-mono text-gray-400">
                          {isCurrent ? (
                            <Disc className="w-4 h-4 text-sky-400 animate-spin" />
                          ) : (
                            idx + 1
                          )}
                        </span>
                        <div className="truncate">
                          <h4 className="text-xs font-medium truncate">{track.title}</h4>
                          <p className="text-[10px] text-gray-400 truncate">{track.artist}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => reorderQueue(idx, Math.max(0, idx - 1))}
                          disabled={idx === 0}
                          className="p-1 rounded text-gray-500 hover:text-white disabled:opacity-20"
                          title="Move Up"
                        >
                          <MoveUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => reorderQueue(idx, Math.min(queue.length - 1, idx + 1))}
                          disabled={idx === queue.length - 1}
                          className="p-1 rounded text-gray-500 hover:text-white disabled:opacity-20"
                          title="Move Down"
                        >
                          <MoveDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => removeFromQueue(idx)}
                          className="p-1 rounded text-gray-500 hover:text-rose-400 transition-colors"
                          title="Remove"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Timeline & Playback Controls Bar */}
        <div className="w-full max-w-xl mx-auto space-y-4 pt-4 border-t border-white/10">
          {/* Scrub Bar */}
          <div className="space-y-1">
            <div
              onClick={handleScrub}
              className="group relative h-2 w-full bg-white/10 hover:h-3 rounded-full cursor-pointer transition-all overflow-hidden"
            >
              <div
                className="h-full bg-gradient-to-r from-sky-500 via-cyan-400 to-teal-400 transition-all duration-75 relative rounded-full"
                style={{ width: `${progressPercent}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-gray-400">
              <span>{formatTime(currentTime)}</span>
              <span>-{formatTime(Math.max(0, duration - currentTime))}</span>
            </div>
          </div>

          {/* Master Transport Controls */}
          <div className="flex items-center justify-center space-x-6 sm:space-x-8">
            <button
              onClick={toggleShuffle}
              className={`p-2 rounded-xl transition-colors ${
                isShuffle ? 'text-sky-400 font-bold' : 'text-gray-400 hover:text-white'
              }`}
              title="Shuffle"
            >
              <Shuffle className="w-5 h-5" />
            </button>

            <button
              onClick={() => seek(Math.max(0, currentTime - 10))}
              className="p-2 rounded-xl text-gray-300 hover:text-white transition-colors"
              title="Rewind 10s"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            <button
              onClick={prevTrack}
              className="p-2 rounded-xl text-gray-200 hover:text-white transition-transform active:scale-95"
              title="Previous Track"
            >
              <SkipBack className="w-6 h-6 fill-current" />
            </button>

            <button
              onClick={togglePlay}
              className="w-16 h-16 rounded-full bg-gradient-to-tr from-sky-500 via-cyan-400 to-teal-400 text-slate-950 flex items-center justify-center shadow-xl shadow-sky-500/30 transition-transform hover:scale-105 active:scale-95"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-7 h-7 fill-current" />
              ) : (
                <Play className="w-7 h-7 fill-current ml-1" />
              )}
            </button>

            <button
              onClick={nextTrack}
              className="p-2 rounded-xl text-gray-200 hover:text-white transition-transform active:scale-95"
              title="Next Track"
            >
              <SkipForward className="w-6 h-6 fill-current" />
            </button>

            <button
              onClick={() => seek(Math.min(duration, currentTime + 10))}
              className="p-2 rounded-xl text-gray-300 hover:text-white transition-colors"
              title="Forward 10s"
            >
              <RotateCw className="w-5 h-5" />
            </button>

            <button
              onClick={toggleRepeat}
              className={`p-2 rounded-xl transition-colors ${
                repeatMode !== 'off' ? 'text-sky-400 font-bold' : 'text-gray-400 hover:text-white'
              }`}
              title="Repeat"
            >
              {repeatMode === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
            </button>
          </div>

          {/* Volume Control */}
          <div className="flex items-center justify-center space-x-3 pt-2">
            <button
              onClick={toggleMute}
              className="text-gray-400 hover:text-white transition-colors"
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
              className="w-48 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-sky-400"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
