import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react'
import type { MusicTrack } from '../../types'
import { api } from '../../api/client'

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export const EQ_PRESETS: Record<string, number[]> = {
  'Flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [7, 6, 4, 2, 0, 0, 0, 0, 1, 2],
  'Treble Boost': [-2, -1, 0, 0, 1, 2, 4, 6, 7, 8],
  'Rock': [5, 4, 2, -1, -2, 0, 2, 4, 5, 6],
  'Pop': [-1, 1, 3, 4, 4, 2, -1, -1, 1, 2],
  'Classical': [4, 3, 2, 2, -1, -1, 0, 2, 3, 4],
  'Jazz': [3, 2, 1, 2, -1, -1, 0, 2, 3, 4],
  'Vocal': [-2, -2, -1, 2, 4, 4, 3, 1, 0, -2],
  'Electronic': [6, 5, 2, 0, -2, 1, 2, 3, 5, 6],
  'Hip-Hop': [7, 6, 3, 1, -1, -1, 1, 2, 4, 5],
}

interface MusicContextType {
  currentTrack: MusicTrack | null
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  queue: MusicTrack[]
  currentIndex: number
  repeatMode: 'off' | 'all' | 'one'
  isShuffle: boolean
  isNowPlayingOpen: boolean
  isEqOpen: boolean
  eqEnabled: boolean
  eqGains: number[]
  eqPreset: string
  preampGain: number
  analyserNode: AnalyserNode | null

  // Controls
  playTrack: (track: MusicTrack, newQueue?: MusicTrack[]) => void
  togglePlay: () => void
  seek: (seconds: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  nextTrack: () => void
  prevTrack: () => void
  addToQueue: (track: MusicTrack) => void
  playNext: (track: MusicTrack) => void
  removeFromQueue: (index: number) => void
  clearQueue: () => void
  reorderQueue: (fromIndex: number, toIndex: number) => void
  toggleShuffle: () => void
  toggleRepeat: () => void
  toggleFavorite: (track: MusicTrack) => Promise<void>

  // Equalizer
  setEqGain: (bandIndex: number, gain: number) => void
  setEqPreset: (presetName: string) => void
  toggleEq: (enabled?: boolean) => void
  setPreampGain: (gainDb: number) => void
  resetEq: () => void

  // Modals
  openNowPlaying: () => void
  closeNowPlaying: () => void
  toggleNowPlaying: () => void
  openEq: () => void
  closeEq: () => void
}

const MusicContext = createContext<MusicContextType | null>(null)

export const useMusicPlayer = () => {
  const context = useContext(MusicContext)
  if (!context) {
    throw new Error('useMusicPlayer must be used within a MusicPlayerProvider')
  }
  return context
}

export const MusicPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const eqFiltersRef = useRef<BiquadFilterNode[]>([])
  const preampNodeRef = useRef<GainNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  // Player State
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [duration, setDuration] = useState<number>(0)
  const [volume, setVolumeState] = useState<number>(() => {
    const saved = localStorage.getItem('phonedrive_music_volume')
    return saved !== null ? parseFloat(saved) : 0.85
  })
  const [isMuted, setIsMuted] = useState<boolean>(false)
  const [queue, setQueue] = useState<MusicTrack[]>([])
  const [currentIndex, setCurrentIndex] = useState<number>(-1)
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off')
  const [isShuffle, setIsShuffle] = useState<boolean>(false)

  // Modal Views
  const [isNowPlayingOpen, setIsNowPlayingOpen] = useState<boolean>(false)
  const [isEqOpen, setIsEqOpen] = useState<boolean>(false)

  // Equalizer State
  const [eqEnabled, setEqEnabled] = useState<boolean>(true)
  const [eqPreset, setEqPresetState] = useState<string>('Flat')
  const [eqGains, setEqGains] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  const [preampGain, setPreampGainState] = useState<number>(0)

  // Initialize Web Audio Engine connected to the HTML5 Audio element
  const initWebAudio = useCallback(() => {
    if (audioCtxRef.current || !audioRef.current) return

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioCtx()
      audioCtxRef.current = ctx

      const source = ctx.createMediaElementSource(audioRef.current)
      sourceNodeRef.current = source

      // Preamp gain node
      const preamp = ctx.createGain()
      preamp.gain.value = 1.0
      preampNodeRef.current = preamp

      // 10-band peaking filter nodes
      const filters = EQ_FREQUENCIES.map((freq) => {
        const filter = ctx.createBiquadFilter()
        filter.type = 'peaking'
        filter.frequency.value = freq
        filter.Q.value = 1.414 // Standard audio bandwidth Q
        filter.gain.value = 0
        return filter
      })
      eqFiltersRef.current = filters

      // Analyser node for live visualizations
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.8
      analyserRef.current = analyser

      // Chain: Source -> Preamp -> EQ Filter 0 -> ... -> EQ Filter 9 -> Analyser -> Destination
      source.connect(preamp)
      let prevNode: AudioNode = preamp
      for (const filter of filters) {
        prevNode.connect(filter)
        prevNode = filter
      }
      prevNode.connect(analyser)
      analyser.connect(ctx.destination)
    } catch (e) {
      console.warn('Web Audio API Equalizer initialization fallback:', e)
    }
  }, [])

  // Setup HTML5 Audio element
  useEffect(() => {
    const audio = new Audio()
    audio.crossOrigin = 'anonymous'
    audio.preload = 'metadata'
    audio.volume = volume
    audioRef.current = audio

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handleDurationChange = () => {
      setDuration(audio.duration || 0)
    }

    const handlePlay = () => {
      setIsPlaying(true)
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume()
      }
    }

    const handlePause = () => {
      setIsPlaying(false)
    }

    const handleEnded = () => {
      if (repeatMode === 'one') {
        audio.currentTime = 0
        audio.play().catch(() => {})
      } else {
        nextTrack()
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('durationchange', handleDurationChange)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('durationchange', handleDurationChange)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      audio.pause()
      audio.src = ''
    }
  }, [repeatMode])

  // Play a track and optionally set a new playlist/queue
  const playTrack = useCallback(
    (track: MusicTrack, newQueue?: MusicTrack[]) => {
      const audio = audioRef.current
      if (!audio) return

      initWebAudio()
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume()
      }

      let q = queue
      if (newQueue) {
        q = newQueue
        setQueue(newQueue)
      } else if (!queue.some((t) => t.id === track.id)) {
        q = [track, ...queue]
        setQueue(q)
      }

      const index = q.findIndex((t) => t.id === track.id)
      setCurrentIndex(index >= 0 ? index : 0)
      setCurrentTrack(track)

      const streamUrl = api.getTrackStreamUrl(track.id)
      audio.src = streamUrl
      audio.currentTime = 0
      audio.play().catch((err) => {
        console.warn('Audio play request interrupted:', err)
      })

      // Record play in history on server
      api.recordMusicHistory(track.id).catch(() => {})
    },
    [queue, initWebAudio]
  )

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    initWebAudio()
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume()
    }

    if (isPlaying) {
      audio.pause()
    } else {
      if (!audio.src && currentTrack) {
        audio.src = api.getTrackStreamUrl(currentTrack.id)
      }
      audio.play().catch(() => {})
    }
  }, [isPlaying, currentTrack, initWebAudio])

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = seconds
    setCurrentTime(seconds)
  }, [])

  const setVolume = useCallback((v: number) => {
    const val = Math.max(0, Math.min(1, v))
    setVolumeState(val)
    if (audioRef.current) {
      audioRef.current.volume = val
    }
    setIsMuted(val === 0)
    localStorage.setItem('phonedrive_music_volume', val.toString())
  }, [])

  const toggleMute = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isMuted) {
      audio.volume = volume || 0.85
      setIsMuted(false)
    } else {
      audio.volume = 0
      setIsMuted(true)
    }
  }, [isMuted, volume])

  const nextTrack = useCallback(() => {
    if (queue.length === 0) return

    let nextIdx: number
    if (isShuffle) {
      nextIdx = Math.floor(Math.random() * queue.length)
    } else {
      nextIdx = currentIndex + 1
      if (nextIdx >= queue.length) {
        if (repeatMode === 'all') {
          nextIdx = 0
        } else {
          return // Stop at end of queue
        }
      }
    }

    const next = queue[nextIdx]
    if (next) {
      playTrack(next)
    }
  }, [queue, currentIndex, isShuffle, repeatMode, playTrack])

  const prevTrack = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      setCurrentTime(0)
      return
    }

    if (queue.length === 0) return

    let prevIdx = currentIndex - 1
    if (prevIdx < 0) {
      prevIdx = repeatMode === 'all' ? queue.length - 1 : 0
    }

    const prev = queue[prevIdx]
    if (prev) {
      playTrack(prev)
    }
  }, [queue, currentIndex, repeatMode, playTrack])

  const addToQueue = useCallback((track: MusicTrack) => {
    setQueue((prev) => [...prev, track])
  }, [])

  const playNext = useCallback(
    (track: MusicTrack) => {
      setQueue((prev) => {
        const next = [...prev]
        next.splice(currentIndex + 1, 0, track)
        return next
      })
    },
    [currentIndex]
  )

  const removeFromQueue = useCallback(
    (index: number) => {
      setQueue((prev) => {
        const updated = prev.filter((_, i) => i !== index)
        if (index < currentIndex) {
          setCurrentIndex((c) => c - 1)
        } else if (index === currentIndex) {
          if (updated.length > 0) {
            const nextIdx = Math.min(index, updated.length - 1)
            playTrack(updated[nextIdx])
          } else {
            setCurrentTrack(null)
            if (audioRef.current) audioRef.current.src = ''
          }
        }
        return updated
      })
    },
    [currentIndex, playTrack]
  )

  const clearQueue = useCallback(() => {
    if (currentTrack) {
      setQueue([currentTrack])
      setCurrentIndex(0)
    } else {
      setQueue([])
      setCurrentIndex(-1)
    }
  }, [currentTrack])

  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    setQueue((prev) => {
      const result = Array.from(prev)
      const [removed] = result.splice(fromIndex, 1)
      result.splice(toIndex, 0, removed)
      return result
    })
  }, [])

  const toggleShuffle = useCallback(() => {
    setIsShuffle((prev) => !prev)
  }, [])

  const toggleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all'
      if (prev === 'all') return 'one'
      return 'off'
    })
  }, [])

  const toggleFavorite = useCallback(
    async (track: MusicTrack) => {
      try {
        const res = await api.toggleMusicFavorite(track.id)
        const updatedFav = res.isFavorite

        if (currentTrack && currentTrack.id === track.id) {
          setCurrentTrack((prev) => (prev ? { ...prev, isFavorite: updatedFav } : null))
        }

        setQueue((prev) =>
          prev.map((t) => (t.id === track.id ? { ...t, isFavorite: updatedFav } : t))
        )
      } catch (err) {
        console.error('Failed to toggle favorite', err)
      }
    },
    [currentTrack]
  )

  // ----------------- EQUALIZER CONTROLS -----------------
  const setEqGain = useCallback(
    (bandIndex: number, gain: number) => {
      const clamped = Math.max(-12, Math.min(12, gain))
      setEqGains((prev) => {
        const updated = [...prev]
        updated[bandIndex] = clamped
        return updated
      })
      setEqPresetState('Custom')

      const filter = eqFiltersRef.current[bandIndex]
      if (filter && eqEnabled) {
        filter.gain.value = clamped
      }
    },
    [eqEnabled]
  )

  const setEqPreset = useCallback(
    (presetName: string) => {
      const preset = EQ_PRESETS[presetName]
      if (!preset) return

      setEqPresetState(presetName)
      setEqGains([...preset])

      if (eqEnabled) {
        eqFiltersRef.current.forEach((filter, idx) => {
          if (filter) filter.gain.value = preset[idx]
        })
      }
    },
    [eqEnabled]
  )

  const toggleEq = useCallback(
    (enabled?: boolean) => {
      const next = enabled !== undefined ? enabled : !eqEnabled
      setEqEnabled(next)

      eqFiltersRef.current.forEach((filter, idx) => {
        if (filter) {
          filter.gain.value = next ? eqGains[idx] : 0
        }
      })
    },
    [eqEnabled, eqGains]
  )

  const setPreampGain = useCallback((gainDb: number) => {
    const clamped = Math.max(-12, Math.min(12, gainDb))
    setPreampGainState(clamped)
    if (preampNodeRef.current) {
      // Convert dB to linear gain: gain = 10^(dB/20)
      const linear = Math.pow(10, clamped / 20)
      preampNodeRef.current.gain.value = linear
    }
  }, [])

  const resetEq = useCallback(() => {
    setEqPreset('Flat')
    setPreampGain(0)
  }, [setEqPreset, setPreampGain])

  return (
    <MusicContext.Provider
      value={{
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
        isNowPlayingOpen,
        isEqOpen,
        eqEnabled,
        eqGains,
        eqPreset,
        preampGain,
        analyserNode: analyserRef.current,

        playTrack,
        togglePlay,
        seek,
        setVolume,
        toggleMute,
        nextTrack,
        prevTrack,
        addToQueue,
        playNext,
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

        openNowPlaying: () => setIsNowPlayingOpen(true),
        closeNowPlaying: () => setIsNowPlayingOpen(false),
        toggleNowPlaying: () => setIsNowPlayingOpen((prev) => !prev),
        openEq: () => setIsEqOpen(true),
        closeEq: () => setIsEqOpen(false),
      }}
    >
      {children}
    </MusicContext.Provider>
  )
}
