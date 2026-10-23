import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  ArrowLeft,
  Settings,
  Subtitles,
  Headphones,
  Check,
  PictureInPicture,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import type { MediaItem, MediaTrack } from '../types'
import { api } from '../api/client'

interface CinematicVideoPlayerProps {
  media: MediaItem
  initialResume?: boolean
  onClose: () => void
  onProgressUpdate?: (positionMs: number, durationMs: number, completed: boolean) => void
}

export const CinematicVideoPlayer: React.FC<CinematicVideoPlayerProps> = ({
  media,
  initialResume = false,
  onClose,
  onProgressUpdate,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Player State
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [duration, setDuration] = useState<number>(media.durationMs > 0 ? media.durationMs / 1000 : 0)
  const [bufferedPercent, setBufferedPercent] = useState<number>(0)
  const [volume, setVolume] = useState<number>(1.0)
  const [isMuted, setIsMuted] = useState<boolean>(false)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)
  const [isBuffering, setIsBuffering] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Transcoding & Compatibility Mode: Only non-native containers (.mkv, .avi, .wmv, .flv, .ts) require transcode by default
  const isNonNativeFile = ['.mkv', '.avi', '.wmv', '.flv', '.ts'].some((ext) => media.name.toLowerCase().endsWith(ext))
  const [useCompatibilityMode, setUseCompatibilityMode] = useState<boolean>(isNonNativeFile)
  const [streamOffset, setStreamOffset] = useState<number>(0)
  const [autoRetryCount, setAutoRetryCount] = useState<number>(0)

  // Controls Visibility
  const [showControls, setShowControls] = useState<boolean>(true)
  const showControlsRef = useRef<boolean>(true)
  const [activeMenu, setActiveMenu] = useState<'none' | 'speed' | 'subtitles' | 'audio' | 'quality' | 'settings'>('none')

  // Video Quality State
  const [selectedQuality, setSelectedQuality] = useState<string>('auto')

  // Keep showControlsRef strictly in sync with showControls state
  useEffect(() => {
    showControlsRef.current = showControls
  }, [showControls])

  // Resume State
  const [showResumePrompt, setShowResumePrompt] = useState<boolean>(
    !initialResume && media.playbackPositionMs > 10000 && !media.completed
  )

  // Subtitle & Audio Tracks
  const [tracks, setTracks] = useState<MediaTrack[]>([])
  const [selectedSubtitle, setSelectedSubtitle] = useState<string>('off')
  const [selectedAudio, setSelectedAudio] = useState<string>('default')
  const [subtitleSize, setSubtitleSize] = useState<'small' | 'medium' | 'large'>('medium')

  // Stream URL Generator Helper (with Quality Support)
  const getStreamUrl = useCallback(
    (startTime: number = 0, transcodeOverride?: boolean, audioIndex?: number, qualityOverride?: string) => {
      const isCompat = transcodeOverride !== undefined ? transcodeOverride : useCompatibilityMode
      const activeQuality = qualityOverride !== undefined ? qualityOverride : selectedQuality
      const needsTranscode = isCompat || (activeQuality !== 'auto' && activeQuality !== 'original') || isNonNativeFile
      return api.getMediaStreamUrl(media.id, {
        start: startTime,
        transcode: needsTranscode,
        direct: !needsTranscode,
        audioTrack: audioIndex !== undefined ? audioIndex : (selectedAudio !== 'default' ? parseInt(selectedAudio, 10) : undefined),
        quality: activeQuality !== 'auto' ? activeQuality : undefined,
      })
    },
    [media.id, useCompatibilityMode, selectedAudio, selectedQuality, isNonNativeFile]
  )

  // Active Video Stream Source State (persists stream URL across React re-renders)
  const [streamSrc, setStreamSrc] = useState<string>(() =>
    getStreamUrl(initialResume && media.playbackPositionMs > 0 ? media.playbackPositionMs / 1000 : 0)
  )

  // Available video qualities ladder (up to media's maximum resolution)
  const availableQualities = React.useMemo(() => {
    let nativeHeight = media.height || 0
    if (!nativeHeight && media.resolution) {
      if (media.resolution.includes('4K') || media.resolution.includes('2160')) nativeHeight = 2160
      else if (media.resolution.includes('1080')) nativeHeight = 1080
      else if (media.resolution.includes('720')) nativeHeight = 720
      else if (media.resolution.includes('480')) nativeHeight = 480
    }
    if (!nativeHeight) nativeHeight = 1080

    const qualities = [
      { id: 'auto', label: `Auto (${media.resolution || 'Original'})`, badge: 'AUTO', desc: 'Original bitrate & quality' },
    ]

    if (nativeHeight >= 2000) {
      qualities.push({ id: '2160p', label: '4K (2160p Ultra HD)', badge: '4K', desc: '12 Mbps UHD Stream' })
    }
    if (nativeHeight >= 1000) {
      qualities.push({ id: '1080p', label: '1080p (Full HD)', badge: '1080p', desc: '4.2 Mbps FHD Stream' })
    }
    if (nativeHeight >= 700) {
      qualities.push({ id: '720p', label: '720p (HD)', badge: '720p', desc: '2.0 Mbps HD Stream' })
    }
    if (nativeHeight >= 400) {
      qualities.push({ id: '480p', label: '480p (Standard)', badge: '480p', desc: '800 kbps SD Fast Buffering' })
    }
    qualities.push({ id: '360p', label: '360p (Data Saver)', badge: '360p', desc: '400 kbps Mobile Data Saver' })

    return qualities
  }, [media.height, media.resolution])

  // Toast Feedback (e.g. "+10s", "1.5x Speed")
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mobile / Touch / Desktop Gestures & Double-Tap Seeking
  const gestureOverlayRef = useRef<HTMLDivElement | null>(null)
  const touchStartPosRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const lastTouchTimeRef = useRef<number>(0)
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right' | 'center' } | null>(null)
  const lastSeekTapTimeRef = useRef<number>(0)
  const lastSeekSideRef = useRef<'left' | 'right' | null>(null)
  const accumulatedSeekRef = useRef<number>(0)
  const doubleTapFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Target Seek Time ref to handle rapid continuous seeking without stuttering or stalling
  const targetSeekTimeRef = useRef<number | null>(null)
  const clearTargetSeekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [doubleTapFeedback, setDoubleTapFeedback] = useState<{
    side: 'left' | 'right'
    accumulatedSec: number
    key: number
  } | null>(null)

  const showToast = useCallback((msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToastMessage(msg)
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null)
    }, 1500)
  }, [])

  // Fetch tracks on mount
  useEffect(() => {
    api.getMediaTracks(media.id)
      .then((res) => {
        if (Array.isArray(res)) {
          setTracks(res)
          const defaultSub = res.find((t) => t.type === 'subtitle' && t.isDefault)
          if (defaultSub) setSelectedSubtitle(defaultSub.id)
        }
      })
      .catch(() => setTracks([]))
  }, [media.id])

  // Ensure true movie duration is always loaded from media metadata
  useEffect(() => {
    if (duration <= 0) {
      if (media.durationMs > 0) {
        setDuration(media.durationMs / 1000)
      } else {
        api.getMediaDetails(media.id)
          .then((details) => {
            if (details.durationMs > 0) {
              setDuration(details.durationMs / 1000)
            }
          })
          .catch(() => {})
      }
    }
  }, [media.id, media.durationMs, duration])

  // Periodic watch progress sync
  const saveProgress = useCallback((timeSec: number, totalDurationSec: number) => {
    if (timeSec <= 0 || totalDurationSec <= 0) return
    const posMs = Math.floor(timeSec * 1000)
    const durMs = Math.floor(totalDurationSec * 1000)
    const isCompleted = posMs >= durMs * 0.90

    api.savePlaybackProgress(media.id, {
      positionMs: posMs,
      durationMs: durMs,
      completed: isCompleted,
      subtitleTrack: selectedSubtitle !== 'off' ? selectedSubtitle : null,
      audioTrack: selectedAudio,
      playbackSpeed,
    }).catch(() => {})

    if (onProgressUpdate) {
      onProgressUpdate(posMs, durMs, isCompleted)
    }
  }, [media.id, selectedSubtitle, selectedAudio, playbackSpeed, onProgressUpdate])

  // Initialize playback position if resuming
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (initialResume && media.playbackPositionMs > 0) {
      video.currentTime = media.playbackPositionMs / 1000
    }
  }, [initialResume, media.playbackPositionMs])

  // Auto-hide controls timer
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true)
    showControlsRef.current = true
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)

    // Only hide if playing and no menu is open
    if (isPlaying && activeMenu === 'none') {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false)
        showControlsRef.current = false
      }, 4000)
    }
  }, [isPlaying, activeMenu])

  const handleMouseMove = () => {
    // Ignore synthetic mousemove events emitted by touchscreens on mobile devices!
    if (Date.now() - lastTouchTimeRef.current < 1500) return
    resetControlsTimeout()
  }

  // Explicit Toggle Controls (Single Tap on video area)
  const toggleControlsVisibility = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
      controlsTimeoutRef.current = null
    }

    if (showControlsRef.current) {
      // Was visible -> Hide controls immediately
      setShowControls(false)
      showControlsRef.current = false
    } else {
      // Was hidden -> Show controls and start 4-second auto-hide timer if playing
      setShowControls(true)
      showControlsRef.current = true
      if (isPlaying && activeMenu === 'none') {
        controlsTimeoutRef.current = setTimeout(() => {
          setShowControls(false)
          showControlsRef.current = false
        }, 4000)
      }
    }
  }, [isPlaying, activeMenu])

  // Play / Pause toggle
  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {})
    } else {
      video.pause()
      setIsPlaying(false)
      const currentPos = useCompatibilityMode ? streamOffset + video.currentTime : video.currentTime
      saveProgress(currentPos, video.duration || duration)
    }
    resetControlsTimeout()
  }, [duration, resetControlsTimeout, saveProgress, useCompatibilityMode, streamOffset])

  // Seek handler (works seamlessly for both Direct Range 206 and FFmpeg Transcoding)
  const handleSeek = useCallback(
    (targetSec: number) => {
      const video = videoRef.current
      if (!video) return

      const maxDur = duration > 0 ? duration : (media.durationMs > 0 ? media.durationMs / 1000 : 999999)
      const clamped = Math.max(0, Math.min(maxDur, targetSec))

      targetSeekTimeRef.current = clamped
      if (clearTargetSeekTimeoutRef.current) clearTimeout(clearTargetSeekTimeoutRef.current)
      clearTargetSeekTimeoutRef.current = setTimeout(() => {
        targetSeekTimeRef.current = null
      }, 1000)

      setCurrentTime(clamped)

      const isTranscoding = useCompatibilityMode || (selectedQuality !== 'auto' && selectedQuality !== 'original') || isNonNativeFile
      if (isTranscoding) {
        // Check if target is already inside video.buffered
        const relTarget = clamped - streamOffset
        let isAlreadyBuffered = false
        if (relTarget >= 0 && video.buffered.length > 0) {
          for (let i = 0; i < video.buffered.length; i++) {
            if (relTarget >= video.buffered.start(i) && relTarget <= video.buffered.end(i) - 0.5) {
              isAlreadyBuffered = true
              break
            }
          }
        }

        if (isAlreadyBuffered) {
          video.currentTime = relTarget
          if (isPlaying && video.paused) {
            video.play().catch(() => {})
          }
        } else {
          setStreamOffset(clamped)
          setIsBuffering(true)
          const audioIdx = selectedAudio !== 'default' ? parseInt(selectedAudio, 10) : undefined
          const newUrl = getStreamUrl(clamped, true, audioIdx, selectedQuality)
          setStreamSrc(newUrl)
          video.src = newUrl
          video.currentTime = 0
          video.load()
          video.play().catch(() => {})
        }
      } else {
        video.currentTime = clamped
        if (isPlaying && video.paused) {
          video.play().catch(() => {})
        }
      }
      resetControlsTimeout()
    },
    [duration, media.durationMs, useCompatibilityMode, selectedQuality, isNonNativeFile, streamOffset, selectedAudio, getStreamUrl, isPlaying, resetControlsTimeout]
  )

  // Seek relative (5 seconds default as requested)
  const seekRelative = useCallback(
    (seconds: number = 5, suppressToast: boolean = false) => {
      const video = videoRef.current
      if (!video) return

      const isTranscoding = useCompatibilityMode || (selectedQuality !== 'auto' && selectedQuality !== 'original') || isNonNativeFile
      // Use targetSeekTimeRef if rapid seek is active, otherwise current actual playback time
      const currentPos = targetSeekTimeRef.current !== null
        ? targetSeekTimeRef.current
        : (isTranscoding ? streamOffset + video.currentTime : video.currentTime)

      const maxDur = duration > 0 ? duration : (media.durationMs > 0 ? media.durationMs / 1000 : 999999)
      const target = Math.max(0, Math.min(maxDur, currentPos + seconds))

      handleSeek(target)
      if (!suppressToast) {
        showToast(seconds > 0 ? `+${seconds}s` : `${seconds}s`)
      }
    },
    [duration, media.durationMs, useCompatibilityMode, selectedQuality, isNonNativeFile, streamOffset, handleSeek, showToast]
  )

  // Quality change handler
  const handleQualityChange = useCallback((qualityId: string) => {
    setSelectedQuality(qualityId)
    setActiveMenu('none')
    const qualObj = availableQualities.find((q) => q.id === qualityId)
    const label = qualObj ? qualObj.label : qualityId
    showToast(`Quality: ${label}`)

    const video = videoRef.current
    if (!video) return

    const isSpecificQuality = qualityId !== 'auto' && qualityId !== 'original'
    const willTranscode = isSpecificQuality || useCompatibilityMode || isNonNativeFile
    setUseCompatibilityMode(willTranscode)

    const isTranscoding = useCompatibilityMode || (selectedQuality !== 'auto' && selectedQuality !== 'original') || isNonNativeFile
    const resumePos = targetSeekTimeRef.current !== null
      ? targetSeekTimeRef.current
      : (isTranscoding ? streamOffset + video.currentTime : video.currentTime)

    setStreamOffset(resumePos)
    setIsBuffering(true)

    const audioIdx = selectedAudio !== 'default' ? parseInt(selectedAudio, 10) : undefined
    const newUrl = getStreamUrl(resumePos, willTranscode, audioIdx, qualityId)
    setStreamSrc(newUrl)
    video.src = newUrl
    video.currentTime = 0
    video.load()
    video.play().catch(() => {})
    resetControlsTimeout()
  }, [availableQualities, getStreamUrl, isNonNativeFile, resetControlsTimeout, selectedAudio, selectedQuality, showToast, streamOffset, useCompatibilityMode])

  // Gesture & Tap Processor (Handles mobile touch & desktop clicks with 5s double-tap and multi-tap sequential seeking)
  const processGestureTap = useCallback(
    (clientX: number, _clientY: number) => {
      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const relX = clientX - rect.left
      const width = rect.width
      const now = Date.now()

      let side: 'left' | 'right' | 'center' = 'center'
      if (relX < width * 0.40) {
        side = 'left'
      } else if (relX > width * 0.60) {
        side = 'right'
      }

      // Case 1: Sequential rapid taps on the same seek side (adding 5s each tap in rapid continuous tapping)
      const timeSinceLastSeek = now - lastSeekTapTimeRef.current
      if (
        (side === 'left' || side === 'right') &&
        timeSinceLastSeek < 650 &&
        lastSeekSideRef.current === side
      ) {
        if (tapTimeoutRef.current) {
          clearTimeout(tapTimeoutRef.current)
          tapTimeoutRef.current = null
        }
        lastTapRef.current = null
        lastSeekTapTimeRef.current = now

        accumulatedSeekRef.current += 5
        const total = accumulatedSeekRef.current

        seekRelative(side === 'left' ? -5 : 5, true)

        setDoubleTapFeedback({
          side,
          accumulatedSec: total,
          key: now,
        })

        if (doubleTapFeedbackTimerRef.current) clearTimeout(doubleTapFeedbackTimerRef.current)
        doubleTapFeedbackTimerRef.current = setTimeout(() => {
          setDoubleTapFeedback(null)
          accumulatedSeekRef.current = 0
          lastSeekTapTimeRef.current = 0
          lastSeekSideRef.current = null
        }, 800)
        return
      }

      // Case 2: Double-tap detection (two taps within 350ms on same side)
      const lastTap = lastTapRef.current
      const isDoubleTap =
        lastTap &&
        now - lastTap.time < 350 &&
        lastTap.side === side

      if (isDoubleTap) {
        // Double-tap confirmed! Cancel single-tap timer immediately
        if (tapTimeoutRef.current) {
          clearTimeout(tapTimeoutRef.current)
          tapTimeoutRef.current = null
        }
        lastTapRef.current = null

        if (side === 'left' || side === 'right') {
          // Fresh double tap after a gap: start clean at 5s!
          accumulatedSeekRef.current = 5
          lastSeekTapTimeRef.current = now
          lastSeekSideRef.current = side

          seekRelative(side === 'left' ? -5 : 5, true)

          setDoubleTapFeedback({
            side,
            accumulatedSec: 5,
            key: now,
          })

          if (doubleTapFeedbackTimerRef.current) clearTimeout(doubleTapFeedbackTimerRef.current)
          doubleTapFeedbackTimerRef.current = setTimeout(() => {
            setDoubleTapFeedback(null)
            accumulatedSeekRef.current = 0
            lastSeekTapTimeRef.current = 0
            lastSeekSideRef.current = null
          }, 800)
        } else {
          // Center double tap toggles Play / Pause
          togglePlay()
        }
        return
      }

      // Case 3: First tap: record and wait 260ms to see if second tap arrives
      lastTapRef.current = { time: now, side }

      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current)
      tapTimeoutRef.current = setTimeout(() => {
        // Single tap confirmed!
        tapTimeoutRef.current = null
        lastTapRef.current = null

        if (activeMenu !== 'none') {
          setActiveMenu('none')
          return
        }

        toggleControlsVisibility()
      }, 260)
    },
    [activeMenu, seekRelative, toggleControlsVisibility, togglePlay]
  )

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartPosRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current || e.changedTouches.length === 0) return
    const touch = e.changedTouches[0]
    const dx = touch.clientX - touchStartPosRef.current.x
    const dy = touch.clientY - touchStartPosRef.current.y
    const dist = Math.hypot(dx, dy)
    touchStartPosRef.current = null

    // Ignore if drag / swipe
    if (dist > 20) return

    lastTouchTimeRef.current = Date.now()
    processGestureTap(touch.clientX, touch.clientY)
  }

  const handleClick = (e: React.MouseEvent) => {
    // Prevent duplicate firing from mobile synthetic mouse clicks
    if (Date.now() - lastTouchTimeRef.current < 600) return
    processGestureTap(e.clientX, e.clientY)
  }

  // Volume toggle & change
  const handleVolumeChange = (newVol: number) => {
    const video = videoRef.current
    if (!video) return

    const clamped = Math.max(0, Math.min(1, newVol))
    video.volume = clamped
    setVolume(clamped)
    if (clamped === 0) {
      video.muted = true
      setIsMuted(true)
      showToast('Muted')
    } else {
      video.muted = false
      setIsMuted(false)
      showToast(`Volume ${Math.round(clamped * 100)}%`)
    }
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return

    if (video.muted) {
      video.muted = false
      setIsMuted(false)
      video.volume = volume > 0 ? volume : 1.0
      showToast('Unmuted')
    } else {
      video.muted = true
      setIsMuted(true)
      showToast('Muted')
    }
    resetControlsTimeout()
  }

  // Speed change
  const handleSpeedChange = (speed: number) => {
    const video = videoRef.current
    if (!video) return

    video.playbackRate = speed
    setPlaybackSpeed(speed)
    setActiveMenu('none')
    showToast(`${speed}x Speed`)
    resetControlsTimeout()
  }

  // Fullscreen toggle
  const toggleFullscreen = () => {
    const container = containerRef.current
    if (!container) return

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
    resetControlsTimeout()
  }

  // Picture in Picture
  const togglePip = async () => {
    const video = videoRef.current
    if (!video) return

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture()
      }
    } catch (err) {
      console.error('PiP failed', err)
    }
  }

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return

      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          seekRelative(-5)
          break
        case 'ArrowRight':
          e.preventDefault()
          seekRelative(5)
          break
        case 'ArrowUp':
          e.preventDefault()
          handleVolumeChange(volume + 0.1)
          break
        case 'ArrowDown':
          e.preventDefault()
          handleVolumeChange(volume - 0.1)
          break
        case 'KeyM':
          e.preventDefault()
          toggleMute()
          break
        case 'KeyF':
          e.preventDefault()
          toggleFullscreen()
          break
        case 'KeyC':
          e.preventDefault()
          // Toggle subtitle
          setSelectedSubtitle((prev) => (prev === 'off' ? (tracks.find((t) => t.type === 'subtitle')?.id || 'off') : 'off'))
          showToast(selectedSubtitle === 'off' ? 'Subtitles On' : 'Subtitles Off')
          break
        case 'Escape':
          if (!document.fullscreenElement) {
            onClose()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlay, seekRelative, volume, toggleMute, toggleFullscreen, selectedSubtitle, tracks, showToast, onClose])

  // Track video progress and save periodically
  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (!video) return

    const isTranscoding = useCompatibilityMode || (selectedQuality !== 'auto' && selectedQuality !== 'original') || isNonNativeFile
    const actualTime = isTranscoding ? streamOffset + video.currentTime : video.currentTime
    setCurrentTime(actualTime)

    // Save every 5 seconds
    if (!progressSaveTimeoutRef.current) {
      progressSaveTimeoutRef.current = setTimeout(() => {
        const fullDuration = duration > 0 ? duration : (media.durationMs > 0 ? media.durationMs / 1000 : (video.duration || 0))
        saveProgress(actualTime, fullDuration)
        progressSaveTimeoutRef.current = null
      }, 5000)
    }
  }

  // Buffered progress calculation
  const handleProgress = () => {
    const video = videoRef.current
    if (!video) return

    if (video.buffered.length > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1)
      const fullDuration = duration > 0 ? duration : (media.durationMs > 0 ? media.durationMs / 1000 : (video.duration || 0))
      if (fullDuration > 0) {
        const isTranscoding = useCompatibilityMode || (selectedQuality !== 'auto' && selectedQuality !== 'original') || isNonNativeFile
        const bufferedTotal = isTranscoding ? streamOffset + bufferedEnd : bufferedEnd
        setBufferedPercent(Math.min(100, (bufferedTotal / fullDuration) * 100))
      }
    }
  }

  // Format time (MM:SS or HH:MM:SS)
  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const totalSec = Math.floor(seconds)
    const hrs = Math.floor(totalSec / 3600)
    const mins = Math.floor((totalSec % 3600) / 60)
    const secs = totalSec % 60
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Seek bar scrub
  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetSec = parseFloat(e.target.value)
    handleSeek(targetSec)
  }

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
      if (progressSaveTimeoutRef.current) clearTimeout(progressSaveTimeoutRef.current)
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current)
      if (doubleTapFeedbackTimerRef.current) clearTimeout(doubleTapFeedbackTimerRef.current)
      if (clearTargetSeekTimeoutRef.current) clearTimeout(clearTargetSeekTimeoutRef.current)
      const video = videoRef.current
      if (video) {
        const currentPos = useCompatibilityMode ? streamOffset + video.currentTime : video.currentTime
        const fullDuration = duration > 0 ? duration : (media.durationMs > 0 ? media.durationMs / 1000 : (video.duration || 0))
        saveProgress(currentPos, fullDuration)
      }
    }
  }, [duration, saveProgress, useCompatibilityMode, streamOffset, media.durationMs])

  const subtitleTracks = tracks.filter((t) => t.type === 'subtitle')
  const audioTracks = tracks.filter((t) => t.type === 'audio')
  const cueFontSize = subtitleSize === 'small' ? '14px' : subtitleSize === 'large' ? '24px' : '18px'

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={`fixed inset-0 z-50 bg-black flex flex-col justify-between overflow-hidden select-none font-sans ${
        !showControls ? 'cursor-none' : 'cursor-default'
      }`}
    >
      {/* Subtitle Cue Custom Styling & Double-Tap Keyframes */}
      <style>{`
        video::cue {
          font-size: ${cueFontSize};
          background-color: rgba(0, 0, 0, 0.75);
          color: #ffffff;
        }
        @keyframes doubleTapRipple {
          0% {
            opacity: 0;
            transform: scale(0.65);
          }
          40% {
            opacity: 1;
            transform: scale(1.08);
          }
          80% {
            opacity: 0.9;
            transform: scale(1);
          }
          100% {
            opacity: 0;
            transform: scale(1.15);
          }
        }
        .animate-double-tap-ripple {
          animation: doubleTapRipple 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-black/80 backdrop-blur-md text-white text-sm font-semibold border border-white/10 shadow-2xl animate-fade-in pointer-events-none">
          {toastMessage}
        </div>
      )}

      {/* Video Element */}
      <video
        ref={videoRef}
        src={streamSrc}
        autoPlay
        playsInline
        crossOrigin="anonymous"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onCanPlay={() => setIsBuffering(false)}
        onTimeUpdate={handleTimeUpdate}
        onProgress={handleProgress}
        onLoadedMetadata={() => {
          const video = videoRef.current
          if (video) {
            // ONLY if duration is not set or 0, fallback to metadata or video duration
            if (duration <= 0) {
              if (media.durationMs > 0) {
                setDuration(media.durationMs / 1000)
              } else if (!useCompatibilityMode && video.duration && isFinite(video.duration) && video.duration > 30) {
                setDuration(video.duration)
              }
            }
          }
        }}
        onError={() => {
          if (!useCompatibilityMode && autoRetryCount === 0) {
            setAutoRetryCount(1)
            setUseCompatibilityMode(true)
            showToast('Activating Universal Compatibility Mode (H.264 / AAC)...')
            const video = videoRef.current
            if (video) {
              const resumePos = currentTime > 0 ? currentTime : (media.playbackPositionMs > 0 ? media.playbackPositionMs / 1000 : 0)
              setStreamOffset(resumePos)
              setIsBuffering(true)
              const audioIdx = selectedAudio !== 'default' ? parseInt(selectedAudio, 10) : undefined
              const newUrl = api.getMediaStreamUrl(media.id, {
                transcode: true,
                start: resumePos,
                audioTrack: audioIdx,
                quality: selectedQuality !== 'auto' ? selectedQuality : undefined,
              })
              setStreamSrc(newUrl)
              video.src = newUrl
              video.load()
              video.play().catch(() => {})
            }
          } else if (autoRetryCount < 2) {
            // Second fallback: direct content URL from file manager endpoint
            setAutoRetryCount(2)
            showToast('Switching to Direct Content Stream...')
            const directFileUrl = api.getContentUrl(media.id)
            setStreamSrc(directFileUrl)
            const video = videoRef.current
            if (video) {
              video.src = directFileUrl
              video.load()
              video.play().catch(() => {})
            }
          } else {
            setIsBuffering(false)
            setError('Browser playback error: Incompatible codec or unsupported stream format.')
          }
        }}
        className="absolute inset-0 w-full h-full object-contain z-0 pointer-events-none"
      >
        {/* WebVTT Subtitle Tracks */}
        {subtitleTracks.map((sub) => (
          <track
            key={sub.id}
            kind="subtitles"
            label={sub.label}
            srcLang={sub.language || 'en'}
            src={api.getMediaSubtitleUrl(media.id, sub.id)}
            default={selectedSubtitle === sub.id}
          />
        ))}
      </video>

      {/* Full-screen Gesture Overlay for Mobile Touch & Desktop Clicks (Prevents accidental pause) */}
      <div
        ref={gestureOverlayRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        className="absolute inset-0 z-10 w-full h-full cursor-pointer select-none"
        style={{ touchAction: 'manipulation' }}
      />

      {/* DOUBLE-TAP RIPPLE SEEK FEEDBACK (Left: -5s Rewind, Right: +5s Forward) */}
      {doubleTapFeedback && doubleTapFeedback.side === 'left' && (
        <div className="absolute left-0 top-0 bottom-0 w-2/5 z-15 flex items-center justify-center pointer-events-none overflow-hidden select-none">
          <div className="absolute inset-0 bg-gradient-to-r from-white/20 via-sky-500/10 to-transparent rounded-r-full animate-fade-in" />
          <div
            key={doubleTapFeedback.key}
            className="relative flex flex-col items-center justify-center p-6 rounded-full bg-black/75 backdrop-blur-md border border-white/20 shadow-2xl text-white animate-double-tap-ripple"
          >
            <RotateCcw className="w-8 h-8 text-sky-400" />
            <span className="text-xl font-extrabold tracking-wider text-white mt-1 drop-shadow-md">
              -{doubleTapFeedback.accumulatedSec}s
            </span>
            <span className="text-[10px] uppercase font-bold tracking-widest text-sky-300 mt-0.5">
              Rewind
            </span>
          </div>
        </div>
      )}

      {doubleTapFeedback && doubleTapFeedback.side === 'right' && (
        <div className="absolute right-0 top-0 bottom-0 w-2/5 z-15 flex items-center justify-center pointer-events-none overflow-hidden select-none">
          <div className="absolute inset-0 bg-gradient-to-l from-white/20 via-sky-500/10 to-transparent rounded-l-full animate-fade-in" />
          <div
            key={doubleTapFeedback.key}
            className="relative flex flex-col items-center justify-center p-6 rounded-full bg-black/75 backdrop-blur-md border border-white/20 shadow-2xl text-white animate-double-tap-ripple"
          >
            <RotateCw className="w-8 h-8 text-sky-400" />
            <span className="text-xl font-extrabold tracking-wider text-white mt-1 drop-shadow-md">
              +{doubleTapFeedback.accumulatedSec}s
            </span>
            <span className="text-[10px] uppercase font-bold tracking-widest text-sky-300 mt-0.5">
              Forward
            </span>
          </div>
        </div>
      )}

      {/* Resume Playback Prompt Modal */}
      {showResumePrompt && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="p-6 rounded-2xl bg-[#141724] border border-white/15 max-w-md w-full shadow-2xl text-center space-x-0 space-y-4">
            <h3 className="text-xl font-bold text-white">Resume Watching?</h3>
            <p className="text-sm text-gray-300">
              You were watching at{' '}
              <span className="text-sky-400 font-semibold">{formatTime(media.playbackPositionMs / 1000)}</span>.
            </p>
            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                onClick={() => {
                  setShowResumePrompt(false)
                  handleSeek(media.playbackPositionMs / 1000)
                }}
                className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow-lg shadow-sky-600/40 transition-all"
              >
                Resume
              </button>
              <button
                onClick={() => {
                  setShowResumePrompt(false)
                  handleSeek(0)
                }}
                className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium border border-white/10 transition-all"
              >
                Start Over
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/90 animate-fadeIn">
          <div className="p-6 rounded-2xl bg-[#141724] border border-rose-500/30 max-w-md w-full text-center space-y-4 shadow-2xl">
            <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
            <h3 className="text-lg font-bold text-white">Playback Notice</h3>
            <p className="text-sm text-gray-300">{error}</p>
            <p className="text-xs text-sky-400/90 bg-sky-950/40 p-2.5 rounded-xl border border-sky-500/20">
              On-the-fly FFmpeg Transcoding converts MKV / HEVC / AC3 5.1/7.1 to standard H.264 & AAC Stereo automatically.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
              <button
                onClick={() => {
                  setError(null)
                  setUseCompatibilityMode(true)
                  setAutoRetryCount(0)
                  const video = videoRef.current
                  if (video) {
                    const resumePos = currentTime > 0 ? currentTime : 0
                    setStreamOffset(resumePos)
                    setIsBuffering(true)
                    video.src = api.getMediaStreamUrl(media.id, { transcode: true, start: resumePos })
                    video.load()
                    video.play().catch(() => {})
                  }
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-lg shadow-sky-600/30 transition-all"
              >
                Force Compatibility Mode
              </button>
              <a
                href={api.getContentUrl(media.id, true)}
                download
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold border border-white/10 transition-all text-center"
              >
                Download Video
              </a>
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-medium transition-all"
              >
                Back to Library
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Center Buffering Spinner */}
      {isBuffering && !error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="p-4 rounded-full bg-black/60 backdrop-blur-md border border-white/10">
            <Loader2 className="w-10 h-10 text-sky-400 animate-spin" />
          </div>
        </div>
      )}

      {/* TOP CONTROLS BAR */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative z-30 px-6 py-4 flex items-center justify-between bg-gradient-to-b from-black/90 via-black/40 to-transparent transition-opacity duration-300 ${
          showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Back and Title */}
        <div className="flex items-center space-x-4">
          <button
            onClick={onClose}
            title="Back to Movies (Esc)"
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center backdrop-blur-md border border-white/10 transition-all hover:scale-105"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <h1 className="text-base md:text-lg font-bold text-white tracking-tight drop-shadow-md">
              {media.title}
            </h1>
            <div className="flex items-center space-x-2 text-xs text-gray-300 mt-0.5">
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-500/30 text-sky-300 border border-sky-500/40 font-bold">
                {media.resolution || 'HD'}
              </span>
              <span>•</span>
              <span className="font-mono text-gray-400">{media.name}</span>
            </div>
          </div>
        </div>

        {/* Quick Top Controls */}
        <div className="flex items-center space-x-2">
          {media.hasSubtitles && (
            <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[11px] font-mono bg-white/10 text-cyan-300 border border-cyan-500/30">
              CC Ready
            </span>
          )}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
            title="Toggle Fullscreen (F)"
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* CENTER BIG PLAY / SEEK CONTROLS (Fade in on hover / pause) */}
      <div
        className={`relative z-20 flex items-center justify-center space-x-8 transition-opacity duration-300 pointer-events-none ${
          showControls && !isBuffering ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            seekRelative(-5)
          }}
          title="Rewind 5s (Left Arrow / Double-tap Left)"
          className="pointer-events-auto w-14 h-14 rounded-full bg-black/60 hover:bg-black/80 text-gray-200 hover:text-white flex flex-col items-center justify-center backdrop-blur-md border border-white/15 transition-all hover:scale-110 active:scale-95 shadow-xl"
        >
          <RotateCcw className="w-5 h-5" />
          <span className="text-[10px] font-bold font-mono tracking-tighter mt-0.5 text-gray-300">5s</span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation()
            togglePlay()
          }}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          className="pointer-events-auto w-20 h-20 rounded-full bg-sky-600/90 hover:bg-sky-500 text-white flex items-center justify-center backdrop-blur-md shadow-2xl shadow-sky-600/50 transition-all hover:scale-110 active:scale-95"
        >
          {isPlaying ? <Pause className="w-9 h-9 fill-current" /> : <Play className="w-9 h-9 fill-current ml-1" />}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation()
            seekRelative(5)
          }}
          title="Forward 5s (Right Arrow / Double-tap Right)"
          className="pointer-events-auto w-14 h-14 rounded-full bg-black/60 hover:bg-black/80 text-gray-200 hover:text-white flex flex-col items-center justify-center backdrop-blur-md border border-white/15 transition-all hover:scale-110 active:scale-95 shadow-xl"
        >
          <RotateCw className="w-5 h-5" />
          <span className="text-[10px] font-bold font-mono tracking-tighter mt-0.5 text-gray-300">5s</span>
        </button>
      </div>

      {/* BOTTOM CONTROLS & TIMELINE */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative z-30 px-6 py-5 bg-gradient-to-t from-black/95 via-black/70 to-transparent transition-opacity duration-300 ${
          showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Interactive Seek Bar */}
        <div className="relative group/seeker w-full mb-3 flex items-center">
          {/* Buffered Track Bar */}
          <div className="absolute left-0 right-0 h-1.5 rounded-full bg-gray-800/80 overflow-hidden">
            <div
              className="h-full bg-white/20 transition-all duration-300"
              style={{ width: `${bufferedPercent}%` }}
            />
          </div>

          {/* Played Progress Bar */}
          <div className="absolute left-0 right-0 h-1.5 rounded-full overflow-hidden pointer-events-none">
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-cyan-400"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>

          {/* Actual Range Input */}
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeekChange}
            className="relative w-full h-4 appearance-none bg-transparent cursor-pointer z-10 focus:outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:transition-transform group-hover/seeker:[&::-webkit-slider-thumb]:scale-125"
          />
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between">
          {/* Left Controls: Play, Volume, Time */}
          <div className="flex items-center space-x-4">
            <button
              onClick={togglePlay}
              className="p-2 text-white hover:text-sky-400 transition-colors"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            {/* Volume Control */}
            <div className="flex items-center space-x-2 group/vol">
              <button
                onClick={toggleMute}
                className="p-2 text-gray-300 hover:text-white transition-colors"
                title="Mute / Unmute (M)"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-16 sm:w-24 h-1.5 appearance-none bg-gray-700 rounded-lg cursor-pointer accent-sky-500 hidden sm:block"
              />
            </div>

            {/* Current Time / Duration */}
            <div className="text-[11px] sm:text-xs font-mono text-gray-300 flex items-center space-x-1">
              <span className="text-white font-medium">{formatTime(currentTime)}</span>
              <span className="text-gray-500">/</span>
              <span className="text-gray-400">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right Controls: Speed, Audio, Subtitles, Quality, PiP, Fullscreen */}
          <div className="flex items-center space-x-1 sm:space-x-2 relative shrink-0">
            {/* Playback Speed Button */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveMenu(activeMenu === 'speed' ? 'none' : 'speed')
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  playbackSpeed !== 1.0 ? 'bg-sky-600 text-white' : 'text-gray-300 hover:text-white hover:bg-white/10'
                }`}
                title="Playback Speed"
              >
                {playbackSpeed}x
              </button>

              {/* Speed Menu Popup */}
              {activeMenu === 'speed' && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-12 right-0 w-36 rounded-xl bg-[#141724] border border-white/10 p-1.5 shadow-2xl space-y-0.5 animate-fadeIn"
                >
                  <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Speed
                  </div>
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSpeedChange(s)}
                      className={`w-full px-3 py-1.5 rounded-lg text-xs text-left flex items-center justify-between ${
                        playbackSpeed === s ? 'bg-sky-600 text-white font-semibold' : 'text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      <span>{s === 1.0 ? 'Normal (1x)' : `${s}x`}</span>
                      {playbackSpeed === s && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Subtitles Button & Menu */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveMenu(activeMenu === 'subtitles' ? 'none' : 'subtitles')
                }}
                className={`p-2 rounded-lg transition-colors ${
                  selectedSubtitle !== 'off'
                    ? 'text-cyan-400 bg-cyan-500/20'
                    : 'text-gray-300 hover:text-white hover:bg-white/10'
                }`}
                title="Subtitles & Audio (C)"
              >
                <Subtitles className="w-5 h-5" />
              </button>

              {/* Subtitle Menu Popup */}
              {activeMenu === 'subtitles' && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-12 right-0 w-56 rounded-xl bg-[#141724] border border-white/10 p-2 shadow-2xl space-y-2 animate-fadeIn"
                >
                  <div className="px-2 text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">
                    Subtitles
                  </div>
                  <div className="space-y-0.5 max-h-48 overflow-y-auto">
                    <button
                      onClick={() => {
                        setSelectedSubtitle('off')
                        setActiveMenu('none')
                        showToast('Subtitles Off')
                      }}
                      className={`w-full px-3 py-1.5 rounded-lg text-xs text-left flex items-center justify-between ${
                        selectedSubtitle === 'off' ? 'bg-cyan-600 text-white font-semibold' : 'text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      <span>Off</span>
                      {selectedSubtitle === 'off' && <Check className="w-3.5 h-3.5" />}
                    </button>

                    {subtitleTracks.map((sub) => (
                      <button
                        key={sub.id}
                        onClick={() => {
                          setSelectedSubtitle(sub.id)
                          setActiveMenu('none')
                          showToast(`Subtitles: ${sub.label}`)
                        }}
                        className={`w-full px-3 py-1.5 rounded-lg text-xs text-left flex items-center justify-between ${
                          selectedSubtitle === sub.id ? 'bg-cyan-600 text-white font-semibold' : 'text-gray-300 hover:bg-white/5'
                        }`}
                      >
                        <span className="truncate">{sub.label}</span>
                        {selectedSubtitle === sub.id && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>

                  {/* Subtitle Size Selector */}
                  <div className="pt-2 border-t border-white/5">
                    <div className="px-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                      Text Size
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(['small', 'medium', 'large'] as const).map((sz) => (
                        <button
                          key={sz}
                          onClick={() => setSubtitleSize(sz)}
                          className={`py-1 rounded text-xs capitalize ${
                            subtitleSize === sz ? 'bg-sky-600 text-white font-semibold' : 'bg-white/5 text-gray-300 hover:bg-white/10'
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Audio Track Selector */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveMenu(activeMenu === 'audio' ? 'none' : 'audio')
                }}
                className={`p-2 rounded-lg transition-colors ${
                  audioTracks.length > 1
                    ? 'text-sky-400 hover:bg-white/10'
                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
                title="Audio Languages"
              >
                <Headphones className="w-5 h-5" />
              </button>

              {activeMenu === 'audio' && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-12 right-0 w-48 rounded-xl bg-[#141724] border border-white/10 p-2 shadow-2xl space-y-1 animate-fadeIn"
                >
                  <div className="px-2 text-[10px] font-semibold text-sky-400 uppercase tracking-wider">
                    Audio Language
                  </div>
                  {audioTracks.length > 0 ? (
                    audioTracks.map((aud) => (
                      <button
                        key={aud.id}
                        onClick={() => {
                          setSelectedAudio(aud.id)
                          setActiveMenu('none')
                          showToast(aud.label)
                          const isTranscoding = useCompatibilityMode || (selectedQuality !== 'auto' && selectedQuality !== 'original') || isNonNativeFile
                          if (isTranscoding) {
                            const video = videoRef.current
                            if (video) {
                              const resumePos = currentTime
                              setStreamOffset(resumePos)
                              setIsBuffering(true)
                              const audioIdx = aud.id !== 'default' ? parseInt(aud.id, 10) : undefined
                              const newUrl = getStreamUrl(resumePos, true, audioIdx, selectedQuality)
                              setStreamSrc(newUrl)
                              video.src = newUrl
                              video.currentTime = 0
                              video.load()
                              video.play().catch(() => {})
                            }
                          }
                        }}
                        className={`w-full px-3 py-1.5 rounded-lg text-xs text-left flex items-center justify-between ${
                          selectedAudio === aud.id ? 'bg-sky-600 text-white font-semibold' : 'text-gray-300 hover:bg-white/5'
                        }`}
                      >
                        <span className="truncate">{aud.label}</span>
                        {selectedAudio === aud.id && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-1.5 text-xs text-gray-400">
                      Standard Stereo (1 Track)
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Video Quality Selector */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveMenu(activeMenu === 'quality' ? 'none' : 'quality')
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 ${
                  selectedQuality !== 'auto'
                    ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
                    : 'text-gray-300 hover:text-white hover:bg-white/10'
                }`}
                title="Video Quality (Resolution)"
              >
                <span>{selectedQuality === 'auto' ? (media.resolution || 'Auto') : selectedQuality}</span>
              </button>

              {/* Quality Menu Popup */}
              {activeMenu === 'quality' && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-12 right-0 w-64 rounded-xl bg-[#141724] border border-white/10 p-2 shadow-2xl space-y-1 animate-fadeIn z-50"
                >
                  <div className="px-2 text-[10px] font-semibold text-sky-400 uppercase tracking-wider flex items-center justify-between pb-1 border-b border-white/5">
                    <span>Video Quality</span>
                    <span className="text-gray-400 font-mono text-[9px]">{media.resolution || 'Original'} Max</span>
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto pt-1">
                    {availableQualities.map((q) => (
                      <button
                        key={q.id}
                        onClick={() => handleQualityChange(q.id)}
                        className={`w-full px-3 py-2 rounded-lg text-xs text-left flex items-center justify-between transition-colors ${
                          selectedQuality === q.id ? 'bg-sky-600 text-white font-semibold' : 'text-gray-300 hover:bg-white/5'
                        }`}
                      >
                        <div className="flex flex-col">
                          <div className="flex items-center space-x-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/10 font-bold font-mono">
                              {q.badge}
                            </span>
                            <span className="font-medium">{q.label}</span>
                          </div>
                          {q.desc && (
                            <span className="text-[10px] text-gray-400 pl-0.5 mt-0.5 opacity-80">
                              {q.desc}
                            </span>
                          )}
                        </div>
                        {selectedQuality === q.id && <Check className="w-4 h-4 text-white shrink-0 ml-2" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Compatibility & Settings Badge */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveMenu(activeMenu === 'settings' ? 'none' : 'settings')
                }}
                className={`p-2 rounded-lg transition-colors ${
                  activeMenu === 'settings' ? 'text-white bg-white/15' : 'text-gray-300 hover:text-white hover:bg-white/10'
                }`}
                title="Stream Compatibility Settings"
              >
                <Settings className="w-5 h-5" />
              </button>

              {activeMenu === 'settings' && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-12 right-0 w-64 rounded-xl bg-[#141724] border border-white/10 p-3 shadow-2xl space-y-2 animate-fadeIn z-50"
                >
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Streaming & Compatibility
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{media.resolution || 'Original Resolution'}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/30 font-semibold">
                        {useCompatibilityMode ? 'H.264 / AAC' : 'Direct 206'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {useCompatibilityMode
                        ? 'Universal real-time stream active (H.264 & AAC Stereo).'
                        : 'Direct native HTTP 206 range stream from storage.'}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      const nextMode = !useCompatibilityMode
                      setUseCompatibilityMode(nextMode)
                      const video = videoRef.current
                      if (video) {
                        const resumePos = currentTime
                        setStreamOffset(resumePos)
                        setIsBuffering(true)
                        video.src = getStreamUrl(resumePos, nextMode)
                        video.currentTime = 0
                        video.play().catch(() => {})
                      }
                      showToast(nextMode ? 'Compatibility Mode Enabled (H.264/AAC)' : 'Direct Stream Enabled')
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 text-sky-300 text-xs font-semibold text-left flex items-center justify-between transition-colors"
                  >
                    <span>Compatibility Mode</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${useCompatibilityMode ? 'bg-sky-500 text-white' : 'bg-gray-700 text-gray-300'}`}>
                      {useCompatibilityMode ? 'ON' : 'OFF'}
                    </span>
                  </button>
                  <p className="text-[10px] text-gray-500 leading-tight">
                    Turn ON if movies with MKV, HEVC, AC3 5.1/7.1 audio show a black screen or lack sound on your browser.
                  </p>
                </div>
              )}
            </div>

            {/* Picture in Picture */}
            <button
              onClick={togglePip}
              className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors hidden sm:block"
              title="Picture in Picture"
            >
              <PictureInPicture className="w-5 h-5" />
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Fullscreen (F)"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
