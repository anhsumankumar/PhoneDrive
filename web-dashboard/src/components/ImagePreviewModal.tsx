import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  X,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Play,
  Pause,
  Image as ImageIcon,
} from 'lucide-react'
import type { FileItem } from '../types'
import { api } from '../api/client'
import { formatBytes, isImage } from '../utils/fileUtils'

interface ImagePreviewModalProps {
  file: FileItem | null
  files?: FileItem[]
  onClose: () => void
  onSelectFile?: (file: FileItem) => void
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  file,
  files = [],
  onClose,
  onSelectFile,
}) => {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPlayingSlideshow, setIsPlayingSlideshow] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const hideControlsTimer = useRef<number | null>(null)

  // Filter only image files for gallery navigation
  const imageFiles = React.useMemo(() => {
    return files.filter(isImage)
  }, [files])

  const currentIndex = React.useMemo(() => {
    if (!file) return -1
    return imageFiles.findIndex((f) => f.id === file.id)
  }, [file, imageFiles])

  const hasMultiple = imageFiles.length > 1
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < imageFiles.length - 1 && currentIndex !== -1

  const handlePrev = useCallback(() => {
    if (hasPrev && onSelectFile) {
      setZoom(1)
      setRotation(0)
      onSelectFile(imageFiles[currentIndex - 1])
    }
  }, [hasPrev, onSelectFile, imageFiles, currentIndex])

  const handleNext = useCallback(() => {
    if (hasNext && onSelectFile) {
      setZoom(1)
      setRotation(0)
      onSelectFile(imageFiles[currentIndex + 1])
    } else if (isPlayingSlideshow && onSelectFile && imageFiles.length > 0) {
      // Loop slideshow back to start
      setZoom(1)
      setRotation(0)
      onSelectFile(imageFiles[0])
    }
  }, [hasNext, isPlayingSlideshow, onSelectFile, imageFiles, currentIndex])

  // Auto-hide controls after inactivity (great for TV / Cinema view)
  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    if (hideControlsTimer.current) {
      window.clearTimeout(hideControlsTimer.current)
    }
    hideControlsTimer.current = window.setTimeout(() => {
      setShowControls(false)
    }, 3500)
  }, [])

  useEffect(() => {
    resetHideTimer()
    return () => {
      if (hideControlsTimer.current) window.clearTimeout(hideControlsTimer.current)
    }
  }, [resetHideTimer, file])

  // Slideshow auto-advance (ideal for Android TV)
  useEffect(() => {
    if (!isPlayingSlideshow) return
    const timer = setInterval(() => {
      handleNext()
    }, 4000)
    return () => clearInterval(timer)
  }, [isPlayingSlideshow, handleNext])

  // Fullscreen toggle (browser native)
  const toggleBrowserFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.().catch(() => {})
      setIsFullscreen(false)
    }
  }

  // Keyboard navigation (works with PC keyboard & Android TV remotes)
  useEffect(() => {
    setZoom(1)
    setRotation(0)

    const handleKeyDown = (e: KeyboardEvent) => {
      resetHideTimer()
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
        handlePrev()
      } else if (e.key === 'ArrowRight' || e.key === 'Right') {
        handleNext()
      } else if (e.key === 'f' || e.key === 'F') {
        toggleBrowserFullscreen()
      } else if (e.key === ' ' || e.key === 'Enter') {
        setIsPlayingSlideshow((p) => !p)
      } else if (e.key === '+' || e.key === '=') {
        setZoom((z) => Math.min(3.5, z + 0.25))
      } else if (e.key === '-') {
        setZoom((z) => Math.max(0.5, z - 0.25))
      } else if (e.key.toLowerCase() === 'r') {
        setRotation((r) => (r + 90) % 360)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [file, onClose, handlePrev, handleNext, resetHideTimer])

  if (!file) return null

  const imageUrl = api.getContentUrl(file.id)

  return (
    <div
      onMouseMove={resetHideTimer}
      onClick={resetHideTimer}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center w-screen h-screen overflow-hidden select-none"
    >
      {/* 1. Edge-to-Edge Pure Photo Display (No card borders, no inner boxes, full screen) */}
      <div className="w-full h-full flex items-center justify-center relative p-0 m-0">
        <img
          key={file.id}
          src={imageUrl}
          alt={file.name}
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: 'center center',
          }}
          className="w-full h-full object-contain max-w-[100vw] max-h-[100vh] select-none transition-transform duration-200"
          draggable={false}
        />
      </div>

      {/* 2. Floating Top Header Overlay (Gradual shadow fade, auto-hides on inactivity) */}
      <div
        className={`absolute top-0 left-0 right-0 z-30 px-4 sm:px-8 py-4 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* File Details */}
        <div className="flex items-center space-x-3 truncate">
          <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 shrink-0 backdrop-blur-md">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div className="truncate">
            <div className="flex items-center space-x-2.5">
              <h3 className="text-sm sm:text-base font-semibold text-white truncate max-w-md lg:max-w-xl drop-shadow-md" title={file.name}>
                {file.name}
              </h3>
              {hasMultiple && currentIndex !== -1 && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-500/25 border border-sky-400/30 text-sky-300 font-medium whitespace-nowrap shadow-sm">
                  {currentIndex + 1} / {imageFiles.length}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-300/80 drop-shadow-sm">{formatBytes(file.size)}</p>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Slideshow button (Great for Android TV / Auto Playback) */}
          {hasMultiple && (
            <button
              onClick={() => setIsPlayingSlideshow((p) => !p)}
              className={`p-2.5 rounded-xl transition flex items-center space-x-1.5 text-xs font-medium backdrop-blur-md border ${
                isPlayingSlideshow
                  ? 'bg-sky-600 text-white border-sky-400 shadow-lg shadow-sky-500/30'
                  : 'bg-black/50 hover:bg-black/75 text-gray-200 hover:text-white border-white/10'
              }`}
              title={isPlayingSlideshow ? 'Pause Slideshow (Space)' : 'Play Slideshow (Space)'}
            >
              {isPlayingSlideshow ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              <span className="hidden sm:inline">{isPlayingSlideshow ? 'Pause' : 'Slideshow'}</span>
            </button>
          )}

          {/* Zoom Controls */}
          <div className="hidden sm:flex items-center space-x-1 bg-black/50 backdrop-blur-md rounded-xl p-1 border border-white/10">
            <button
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
              className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-white w-10 text-center font-mono">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(3.5, z + 0.25))}
              className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Rotate */}
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-2.5 rounded-xl bg-black/50 hover:bg-black/75 text-gray-300 hover:text-white border border-white/10 backdrop-blur-md transition"
            title="Rotate 90° (R)"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* Native Fullscreen Toggle */}
          <button
            onClick={toggleBrowserFullscreen}
            className="p-2.5 rounded-xl bg-black/50 hover:bg-black/75 text-gray-300 hover:text-white border border-white/10 backdrop-blur-md transition"
            title="Toggle Fullscreen (F)"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>

          {/* Download Original Photo */}
          <a
            href={api.getContentUrl(file.id, true)}
            download={file.name}
            className="p-2.5 rounded-xl bg-black/50 hover:bg-black/75 text-gray-300 hover:text-white border border-white/10 backdrop-blur-md transition"
            title="Download Original File"
          >
            <Download className="w-4 h-4" />
          </a>

          {/* Close Fullscreen Viewer */}
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-red-600/80 hover:bg-red-600 text-white backdrop-blur-md transition ml-1 shadow-lg"
            title="Close Viewer (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 3. Large Edge Navigation Buttons */}
      {hasMultiple && (
        <>
          {/* Previous Arrow */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              handlePrev()
            }}
            disabled={!hasPrev}
            className={`absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 z-30 w-14 h-14 rounded-full flex items-center justify-center transition shadow-2xl backdrop-blur-md border border-white/10 ${
              hasPrev
                ? 'bg-black/50 hover:bg-sky-600 hover:scale-105 text-white cursor-pointer active:scale-95'
                : 'bg-black/20 text-gray-600 cursor-not-allowed opacity-30'
            } ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            title="Previous (Left Arrow)"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>

          {/* Next Arrow */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleNext()
            }}
            disabled={!hasNext && !isPlayingSlideshow}
            className={`absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 z-30 w-14 h-14 rounded-full flex items-center justify-center transition shadow-2xl backdrop-blur-md border border-white/10 ${
              hasNext || isPlayingSlideshow
                ? 'bg-black/50 hover:bg-sky-600 hover:scale-105 text-white cursor-pointer active:scale-95'
                : 'bg-black/20 text-gray-600 cursor-not-allowed opacity-30'
            } ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            title="Next (Right Arrow)"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        </>
      )}

      {/* 4. Floating Bottom Thumbnail Carousel (Floats cleanly over bottom, doesn't squeeze photo) */}
      {hasMultiple && (
        <div
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-[90vw] sm:max-w-2xl bg-black/60 backdrop-blur-xl border border-white/15 px-3 py-2 rounded-2xl flex items-center space-x-2.5 overflow-x-auto shadow-2xl transition-opacity duration-300 scrollbar-none ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {imageFiles.map((imgFile, idx) => {
            const isActive = imgFile.id === file.id
            return (
              <button
                key={imgFile.id}
                onClick={(e) => {
                  e.stopPropagation()
                  if (onSelectFile) {
                    setZoom(1)
                    setRotation(0)
                    onSelectFile(imgFile)
                  }
                }}
                className={`relative shrink-0 w-12 h-12 rounded-xl overflow-hidden transition duration-150 ${
                  isActive
                    ? 'ring-2 ring-sky-400 scale-110 shadow-lg shadow-sky-500/40'
                    : 'opacity-40 hover:opacity-100 hover:scale-105'
                }`}
                title={`${idx + 1}. ${imgFile.name}`}
              >
                <img
                  src={api.getThumbnailUrl(imgFile.id)}
                  alt={imgFile.name}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
