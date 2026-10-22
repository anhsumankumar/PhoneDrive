import {
  FileText,
  Image,
  Film,
  Music,
  Folder,
  Archive,
  FileCode,
  Package,
  File,
} from 'lucide-react'
import type { FileItem } from '../types'

export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export const formatDate = (timestamp: number): string => {
  if (!timestamp) return '—'
  const date = new Date(timestamp)
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const isImage = (file: FileItem): boolean => {
  if (file.isDirectory) return false
  return (
    file.mimeType.startsWith('image/') ||
    /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(file.name)
  )
}

export const isVideo = (file: FileItem): boolean => {
  if (file.isDirectory) return false
  return (
    file.mimeType.startsWith('video/') ||
    /\.(mp4|mkv|webm|mov|avi|wmv|m4v)$/i.test(file.name)
  )
}

export const isAudio = (file: FileItem): boolean => {
  if (file.isDirectory) return false
  return (
    file.mimeType.startsWith('audio/') ||
    /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(file.name)
  )
}

export const isDocument = (file: FileItem): boolean => {
  if (file.isDirectory) return false
  return (
    file.mimeType.includes('pdf') ||
    file.mimeType.includes('document') ||
    file.mimeType.includes('text') ||
    /\.(pdf|txt|docx|doc|xlsx|xls|pptx|md|json|csv)$/i.test(file.name)
  )
}

export const getFileIcon = (file: FileItem) => {
  if (file.isDirectory) return Folder
  if (isImage(file)) return Image
  if (isVideo(file)) return Film
  if (isAudio(file)) return Music
  if (/\.(zip|tar|gz|rar|7z)$/i.test(file.name)) return Archive
  if (/\.(js|ts|jsx|tsx|html|css|py|kt|java|cpp|c|go|rs)$/i.test(file.name)) return FileCode
  if (/\.(apk|aab)$/i.test(file.name)) return Package
  if (isDocument(file)) return FileText
  return File
}

export const getFileColorClass = (file: FileItem): string => {
  if (file.isDirectory) return 'text-sky-400 bg-sky-500/15 border border-sky-500/25'
  if (isImage(file)) return 'text-cyan-400 bg-cyan-400/15'
  if (isVideo(file)) return 'text-blue-400 bg-blue-500/15'
  if (isAudio(file)) return 'text-emerald-400 bg-emerald-400/15'
  if (isDocument(file)) return 'text-blue-400 bg-blue-500/15 border border-blue-500/25'
  return 'text-gray-400 bg-gray-400/15'
}
