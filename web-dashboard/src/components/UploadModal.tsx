import React, { useState, useRef } from 'react'
import { X, Upload, Folder, AlertCircle, FileUp } from 'lucide-react'
import type { FolderItem } from '../types'
import { api } from '../api/client'
import { formatBytes } from '../utils/fileUtils'

interface UploadModalProps {
  isOpen: boolean
  onClose: () => void
  folders: FolderItem[]
  currentFolderId: string | null
  currentParentId: string | null
  onUploadSuccess: () => void
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  folders,
  currentFolderId,
  currentParentId,
  onUploadSuccess,
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    currentFolderId || (folders[0]?.id || '')
  )
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentFileIndex, setCurrentFileIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFiles(Array.from(e.dataTransfer.files))
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(Array.from(e.target.files))
    }
  }

  const handleStartUpload = async () => {
    if (!selectedFolderId) {
      setError('Please select a destination shared folder on your phone')
      return
    }
    if (selectedFiles.length === 0) {
      setError('Please choose at least one file to upload')
      return
    }

    setUploading(true)
    setError(null)
    setProgress(0)

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        setCurrentFileIndex(i)
        const file = selectedFiles[i]
        await api.uploadFile(
          selectedFolderId,
          currentParentId,
          file,
          (percent) => setProgress(percent)
        )
      }
      onUploadSuccess()
      onClose()
      setSelectedFiles([])
    } catch (err: any) {
      setError(err.message || 'File upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-colors duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--glass-bg)]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Upload to PhoneDrive</h3>
              <p className="text-[11px] text-[var(--text-muted)]">Send files directly to your phone's storage</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={uploading}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          {/* Target Folder Selector */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-primary)] mb-1.5">
              Destination Folder on Phone
            </label>
            <div className="relative">
              <select
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                disabled={uploading}
                className="w-full pl-3 pr-8 py-2.5 rounded-xl bg-[var(--glass-bg)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs focus:outline-none focus:border-sky-500 transition appearance-none cursor-pointer"
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id} className="bg-[var(--bg-card)] text-[var(--text-primary)]">
                    {f.name}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[var(--text-muted)]">
                <Folder className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Drag & Drop Area */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-3 ${
              dragActive
                ? 'border-sky-500 bg-sky-500/10'
                : 'border-[var(--border-subtle)] hover:border-sky-500/40 bg-[var(--glass-bg)]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-full bg-sky-500/10 text-sky-400 flex items-center justify-center">
              <FileUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--text-primary)]">
                Drag and drop files here, or <span className="text-sky-400 font-semibold">browse</span>
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-1">Uploads stream straight to phone disk</p>
            </div>
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              <div className="text-[11px] font-medium text-[var(--text-muted)] flex justify-between">
                <span>Selected Files ({selectedFiles.length})</span>
                <span>
                  Total: {formatBytes(selectedFiles.reduce((acc, f) => acc + f.size, 0))}
                </span>
              </div>
              {selectedFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                >
                  <span className="truncate max-w-xs">{f.name}</span>
                  <span className="text-[var(--text-muted)] text-[10px] ml-2 shrink-0">{formatBytes(f.size)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Progress bar */}
          {uploading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-sky-400 font-medium">
                <span>
                  Uploading file {currentFileIndex + 1} of {selectedFiles.length}
                </span>
                <span className="font-mono">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-[var(--glass-bg)] rounded-full overflow-hidden border border-[var(--border-subtle)]">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-blue-600 rounded-full transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error notice */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center space-x-2 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--glass-bg)]">
          <button
            onClick={onClose}
            disabled={uploading}
            className="py-2 px-4 rounded-xl text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)] transition"
          >
            Cancel
          </button>
          <button
            onClick={handleStartUpload}
            disabled={uploading || selectedFiles.length === 0}
            className="py-2 px-4 rounded-xl text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 active:scale-[0.98] transition shadow-md shadow-sky-600/25 flex items-center space-x-2 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                <span>Start Upload</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
