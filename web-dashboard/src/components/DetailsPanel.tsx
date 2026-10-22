import React from 'react'
import {
  X,
  Download,
  Trash2,
  Edit2,
  Play,
  Eye,
  Calendar,
  FileBadge,
  HardDrive,
} from 'lucide-react'
import type { FileItem } from '../types'
import { api } from '../api/client'
import {
  formatBytes,
  formatDate,
  getFileIcon,
  getFileColorClass,
  isImage,
  isVideo,
  isAudio,
} from '../utils/fileUtils'

interface DetailsPanelProps {
  file: FileItem | null
  onClose: () => void
  onOpenFile: (file: FileItem) => void
  onDeleteFile: (file: FileItem) => void
  onRenameFile: (file: FileItem) => void
}

export const DetailsPanel: React.FC<DetailsPanelProps> = ({
  file,
  onClose,
  onOpenFile,
  onDeleteFile,
  onRenameFile,
}) => {
  if (!file) return null

  const Icon = getFileIcon(file)
  const colorClass = getFileColorClass(file)
  const hasThumb = isImage(file)
  const isMedia = isVideo(file) || isAudio(file)

  return (
    <aside className="w-80 bg-[var(--bg-card)] border-l border-[var(--border-subtle)] flex flex-col h-full shrink-0 transition-colors duration-200">
      {/* Header */}
      <div className="h-16 px-5 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          File Details
        </span>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Preview Tile */}
        <div
          onClick={() => {
            if (hasThumb || isMedia) onOpenFile(file)
          }}
          className={`w-full aspect-video rounded-2xl bg-[var(--glass-bg)] border border-[var(--border-subtle)] flex items-center justify-center overflow-hidden relative ${
            hasThumb || isMedia ? 'cursor-pointer group' : ''
          }`}
        >
          {hasThumb ? (
            <>
              <img
                src={api.getThumbnailUrl(file.id)}
                alt={file.name}
                className="w-full h-full object-cover transition duration-200 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <div className="p-2.5 rounded-full bg-white/90 text-sky-600 shadow-lg">
                  <Eye className="w-5 h-5" />
                </div>
              </div>
            </>
          ) : (
            <div className={`p-4 rounded-2xl ${colorClass}`}>
              <Icon className="w-10 h-10" />
            </div>
          )}
        </div>

        {/* Title & Actions */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] break-words">{file.name}</h2>
          <div className="flex items-center space-x-2">
            {hasThumb && (
              <button
                onClick={() => onOpenFile(file)}
                className="flex-1 py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center justify-center space-x-1.5 transition shadow-sm"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View Photo</span>
              </button>
            )}
            {isMedia && (
              <button
                onClick={() => onOpenFile(file)}
                className="flex-1 py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center justify-center space-x-1.5 transition shadow-sm"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play Media</span>
              </button>
            )}
            {!file.isDirectory && (
              <a
                href={api.getContentUrl(file.id, true)}
                download={file.name}
                className="flex-1 py-2 px-3 rounded-xl bg-[var(--glass-bg)] hover:bg-[var(--glass-hover)] text-[var(--text-primary)] text-xs font-medium flex items-center justify-center space-x-1.5 transition border border-[var(--border-subtle)] text-center"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </a>
            )}
          </div>
        </div>

        {/* Metadata List */}
        <div className="space-y-3 text-xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Information
          </div>

          <div className="p-3 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)] flex items-center space-x-1.5">
                <HardDrive className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span>Size</span>
              </span>
              <span className="text-[var(--text-primary)] font-mono">
                {file.isDirectory ? 'Directory' : formatBytes(file.size)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)] flex items-center space-x-1.5">
                <FileBadge className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span>MIME Type</span>
              </span>
              <span className="text-[var(--text-primary)] font-mono text-[11px] truncate max-w-[140px]" title={file.mimeType}>
                {file.mimeType || 'unknown'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)] flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span>Modified</span>
              </span>
              <span className="text-[var(--text-primary)] text-[11px]">
                {formatDate(file.lastModified)}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="pt-2 space-y-2">
          <button
            onClick={() => onRenameFile(file)}
            className="w-full flex items-center space-x-2 py-2 px-3 rounded-xl text-xs text-[var(--text-primary)] bg-[var(--glass-bg)] hover:bg-[var(--glass-hover)] border border-[var(--border-subtle)] transition"
          >
            <Edit2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>Rename File</span>
          </button>
          <button
            onClick={() => onDeleteFile(file)}
            className="w-full flex items-center space-x-2 py-2 px-3 rounded-xl text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Permanently</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
