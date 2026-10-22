import React from 'react'
import { Download, Trash2, Edit2, Play } from 'lucide-react'
import type { FileItem } from '../types'
import { api } from '../api/client'
import {
  formatBytes,
  formatDate,
  isImage,
  isVideo,
  isAudio,
} from '../utils/fileUtils'
import { MacFolderIcon, MacDocumentIcon } from './MacIcons'

interface FileListProps {
  files: FileItem[]
  selectedFile: FileItem | null
  onSelectFile: (file: FileItem) => void
  onOpenFile: (file: FileItem) => void
  onDeleteFile: (file: FileItem) => void
  onRenameFile: (file: FileItem) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string, e: React.MouseEvent) => void
  onSelectAll: () => void
}

export const FileList: React.FC<FileListProps> = ({
  files,
  selectedFile,
  onSelectFile,
  onOpenFile,
  onDeleteFile,
  onRenameFile,
  selectedIds,
  onToggleSelect,
  onSelectAll,
}) => {
  const allSelected = files.length > 0 && selectedIds.size === files.length

  return (
    <div className="w-full px-4 lg:px-8 py-4">
      <div className="overflow-x-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-medium bg-black/[0.02] dark:bg-white/[0.02]">
              <th className="py-3 px-4 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onSelectAll}
                  className="rounded border-[var(--border-subtle)] bg-black/40 text-sky-500 focus:ring-0 cursor-pointer"
                />
              </th>
              <th className="py-3 px-4">Name</th>
              <th className="py-3 px-4 w-28">Size</th>
              <th className="py-3 px-4 w-44 hidden md:table-cell">Date Modified</th>
              <th className="py-3 px-4 w-28 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {files.map((file) => {
              const isSelected = selectedFile?.id === file.id || selectedIds.has(file.id)

              return (
                <tr
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
                  className={`group transition cursor-pointer select-none ${
                    isSelected ? 'bg-sky-500/15' : 'hover:bg-black/5 dark:hover:bg-white/[0.03]'
                  }`}
                >
                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(file.id)}
                      onChange={(e) => onToggleSelect(file.id, e as any)}
                      className="rounded border-[var(--border-subtle)] bg-black/40 text-sky-500 focus:ring-0 cursor-pointer"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center space-x-3">
                      {file.isDirectory ? (
                        <div className="shrink-0">
                          <MacFolderIcon size={26} />
                        </div>
                      ) : (
                        <div className="shrink-0">
                          <MacDocumentIcon extension={file.name.includes('.') ? file.name.split('.').pop() || 'FILE' : 'FILE'} size={20} />
                        </div>
                      )}
                      <span className="font-medium text-[var(--text-primary)] truncate max-w-xs sm:max-w-md group-hover:text-sky-500 dark:group-hover:text-sky-300 transition">
                        {file.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-[var(--text-secondary)] whitespace-nowrap">
                    {file.isDirectory ? '—' : formatBytes(file.size)}
                  </td>
                  <td className="py-3 px-4 text-[var(--text-muted)] whitespace-nowrap hidden md:table-cell">
                    {formatDate(file.lastModified)}
                  </td>
                  <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end space-x-1">
                      {(isVideo(file) || isAudio(file)) && (
                        <button
                          onClick={() => onOpenFile(file)}
                          title="Stream Media"
                          className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {!file.isDirectory && (
                        <a
                          href={api.getContentUrl(file.id, true)}
                          download={file.name}
                          title="Download file"
                          className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition inline-block"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => onRenameFile(file)}
                        title="Rename"
                        className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteFile(file)}
                        title="Delete"
                        className="p-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
