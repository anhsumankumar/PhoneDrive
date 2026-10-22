import React from 'react'
import { Play, Eye, Download, Trash2, Edit2 } from 'lucide-react'
import type { FileItem } from '../types'
import { api } from '../api/client'
import {
  formatBytes,
  isImage,
  isVideo,
  isAudio,
} from '../utils/fileUtils'
import { MacFolderIcon, MacDocumentIcon } from './MacIcons'

interface FileGridProps {
  files: FileItem[]
  selectedFile: FileItem | null
  onSelectFile: (file: FileItem) => void
  onOpenFile: (file: FileItem) => void
  onDeleteFile: (file: FileItem) => void
  onRenameFile: (file: FileItem) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string, e: React.MouseEvent) => void
}

export const FileGrid: React.FC<FileGridProps> = ({
  files,
  selectedFile,
  onSelectFile,
  onOpenFile,
  onDeleteFile,
  onRenameFile,
  selectedIds,
  onToggleSelect,
}) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-6 sm:gap-7 p-4 sm:p-6 lg:p-8">
      {files.map((file) => {
        const isSelected = selectedFile?.id === file.id || selectedIds.has(file.id)
        const hasThumb = isImage(file) || isVideo(file)
        const ext = file.name.includes('.') ? file.name.split('.').pop() || 'FILE' : 'FILE'

        return (
          <div
            key={file.id}
            onClick={() => {
              if (file.isDirectory || isImage(file) || isVideo(file) || isAudio(file)) {
                onOpenFile(file)
                onSelectFile(file)
              } else {
                onSelectFile(file)
              }
            }}
            onDoubleClick={() => onOpenFile(file)}
            className={`group relative flex flex-col items-center rounded-2xl p-3 sm:p-4 transition-all duration-200 cursor-pointer select-none ${
              isSelected
                ? 'bg-sky-500/15 ring-2 ring-sky-500/70 shadow-lg shadow-sky-500/10'
                : 'hover:bg-sky-500/[0.08] dark:hover:bg-white/[0.06] border border-transparent hover:border-sky-500/20'
            }`}
          >
            {/* Multi-select checkbox */}
            <div
              onClick={(e) => {
                e.stopPropagation()
                onToggleSelect(file.id, e)
              }}
              className={`absolute top-2.5 left-2.5 z-20 w-5 h-5 rounded-md border flex items-center justify-center transition shadow-sm ${
                selectedIds.has(file.id)
                  ? 'bg-sky-500 border-sky-400 text-white'
                  : 'border-[var(--border-subtle)] bg-white/80 dark:bg-black/60 opacity-0 group-hover:opacity-100 hover:border-sky-400 backdrop-blur-sm'
              }`}
            >
              {selectedIds.has(file.id) && (
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6L5 8.5L9.5 3.5"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>

            {/* macOS Icon Presentation Container */}
            <div className="w-full h-28 sm:h-32 flex items-center justify-center relative">
              {file.isDirectory ? (
                /* Authentic macOS Folder (No grey background box!) */
                <MacFolderIcon
                  size={104}
                  className="group-hover:scale-105 group-hover:-translate-y-1 transition-transform duration-200"
                />
              ) : hasThumb ? (
                /* macOS Preview Thumbnail */
                <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden shadow-md shadow-black/15 border border-black/10 dark:border-white/15 bg-black/5 dark:bg-black/40 group-hover:scale-105 group-hover:-translate-y-1 transition-transform duration-200">
                  <img
                    src={isVideo(file) ? api.getMediaThumbnailUrl(file.id) : api.getThumbnailUrl(file.id)}
                    alt={file.name}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none'
                    }}
                    className="w-full h-full object-cover"
                  />

                  {/* Image quick view overlay */}
                  {isImage(file) && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenFile(file)
                      }}
                      className="absolute inset-0 bg-black/35 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 flex items-center justify-center transition"
                      title="View Full Photo"
                    >
                      <div className="w-8 h-8 rounded-full bg-white text-sky-600 flex items-center justify-center shadow-lg transform active:scale-95 transition">
                        <Eye className="w-4 h-4" />
                      </div>
                    </div>
                  )}

                  {/* Video/Audio play overlay */}
                  {(isVideo(file) || isAudio(file)) && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenFile(file)
                      }}
                      className="absolute inset-0 bg-black/35 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 flex items-center justify-center transition"
                    >
                      <div className="w-9 h-9 rounded-full bg-white text-sky-600 flex items-center justify-center shadow-lg transform active:scale-95 transition">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* macOS Document Icon */
                <MacDocumentIcon
                  extension={ext}
                  size={84}
                  className="group-hover:scale-105 group-hover:-translate-y-1 transition-transform duration-200"
                />
              )}
            </div>

            {/* macOS Finder Label Area */}
            <div className="w-full flex flex-col items-center mt-2 px-1">
              <div
                className={`max-w-full text-center transition px-2 py-0.5 rounded-md ${
                  isSelected
                    ? 'bg-sky-500 text-white font-semibold shadow-sm'
                    : 'text-[var(--text-primary)] group-hover:text-sky-600 dark:group-hover:text-sky-300'
                }`}
                title={file.name}
              >
                <p className="text-xs font-medium line-clamp-2 leading-snug break-words">
                  {file.name}
                </p>
              </div>

              <span className="text-[11px] text-[var(--text-muted)] mt-1 tracking-tight">
                {file.isDirectory ? 'Folder' : formatBytes(file.size)}
              </span>
            </div>

            {/* Floating macOS Action Pill on Hover */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center space-x-1 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 rounded-lg border border-[var(--border-subtle)] shadow-md">
              {!file.isDirectory && (
                <a
                  href={api.getContentUrl(file.id, true)}
                  download={file.name}
                  onClick={(e) => e.stopPropagation()}
                  title="Download file"
                  className="p-1 rounded-md hover:bg-sky-500/15 text-slate-600 dark:text-slate-300 hover:text-sky-500 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRenameFile(file)
                }}
                title="Rename"
                className="p-1 rounded-md hover:bg-sky-500/15 text-slate-600 dark:text-slate-300 hover:text-sky-500 transition"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteFile(file)
                }}
                title="Delete"
                className="p-1 rounded-md hover:bg-red-500/15 text-slate-600 dark:text-slate-300 hover:text-red-500 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
