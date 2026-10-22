import React from 'react'
import {
  Folder,
  Image,
  Film,
  Music,
  FileText,
  Star,
  Clock,
  LogOut,
  FolderCheck,
  Smartphone,
  Tv,
} from 'lucide-react'
import type { FolderItem, StorageStatus } from '../types'

interface SidebarProps {
  currentCategory: string
  onSelectCategory: (category: string) => void
  folders: FolderItem[]
  selectedFolderId: string | null
  onSelectFolder: (folderId: string | null) => void
  storageStatus: StorageStatus | null
  onLogout: () => void
  isOpen: boolean
  onCloseMobile: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentCategory,
  onSelectCategory,
  folders,
  selectedFolderId,
  onSelectFolder,
  storageStatus,
  onLogout,
  isOpen,
  onCloseMobile,
}) => {
  const categories = [
    { id: 'all', label: 'All Files', icon: Folder },
    { id: 'cinema', label: 'Cinema & Shows', icon: Tv },
    { id: 'photos', label: 'Photos', icon: Image },
    { id: 'videos', label: 'Videos', icon: Film },
    { id: 'audio', label: 'Audio', icon: Music },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'favorites', label: 'Favorites', icon: Star },
    { id: 'recent', label: 'Recent', icon: Clock },
  ]

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const usedBytes = storageStatus ? storageStatus.totalSpaceBytes - storageStatus.freeSpaceBytes : 0
  const usedPercent = storageStatus && storageStatus.totalSpaceBytes > 0
    ? Math.min(100, Math.round((usedBytes / storageStatus.totalSpaceBytes) * 100))
    : 0

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-sm"
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 w-64 bg-[var(--bg-sidebar)] border-r border-[var(--border-subtle)] z-40 flex flex-col transition-all duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="h-16 px-5 flex items-center space-x-3 border-b border-[var(--border-subtle)]">
          <img
            src="/icon.png"
            alt="PhoneDrive"
            className="w-9 h-9 object-contain drop-shadow-md"
          />
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight text-[var(--text-primary)]">PhoneDrive</span>
            <span className="text-[11px] text-[var(--text-secondary)] flex items-center space-x-1">
              <Smartphone className="w-3 h-3 text-sky-400" />
              <span className="truncate max-w-[130px]">{storageStatus?.deviceModel || 'Connected Phone'}</span>
            </span>
          </div>
        </div>

        {/* Categories Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 no-scrollbar">
          <div>
            <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Browse
            </div>
            <nav className="space-y-0.5">
              {categories.map((cat) => {
                const Icon = cat.icon
                const isActive = currentCategory === cat.id && selectedFolderId === null
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      onSelectFolder(null)
                      onSelectCategory(cat.id)
                      onCloseMobile()
                    }}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                      isActive
                        ? 'bg-sky-500/15 text-sky-500 dark:text-sky-300 font-semibold border border-sky-500/30 shadow-sm'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-sky-500 dark:text-sky-400' : 'text-[var(--text-muted)]'}`} />
                    <span>{cat.label}</span>
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Shared Phone Folders */}
          <div>
            <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center justify-between">
              <span>Shared Folders</span>
              <span className="text-[10px] bg-[var(--input-bg)] border border-[var(--border-subtle)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded-full">
                {folders.length}
              </span>
            </div>
            {folders.length === 0 ? (
              <div className="px-3 py-3 text-xs text-[var(--text-muted)] rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-dashed border-[var(--border-subtle)] text-center">
                No folders selected on phone yet
              </div>
            ) : (
              <div className="space-y-0.5">
                {folders.map((folder) => {
                  const isSelected = selectedFolderId === folder.id
                  return (
                    <button
                      key={folder.id}
                      onClick={() => {
                        onSelectFolder(folder.id)
                        onSelectCategory('all')
                        onCloseMobile()
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition ${
                        isSelected
                          ? 'bg-sky-500/15 text-sky-500 dark:text-sky-300 font-semibold border border-sky-500/30 shadow-sm'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 truncate">
                        <FolderCheck className={`w-4 h-4 shrink-0 ${isSelected ? 'text-sky-500 dark:text-sky-400' : 'text-emerald-500'}`} />
                        <span className="truncate">{folder.name}</span>
                      </div>
                      {folder.fileCount !== undefined && (
                        <span className="text-[10px] text-[var(--text-muted)] ml-1 shrink-0">
                          {folder.fileCount}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Storage status & Logout footer */}
        <div className="p-4 border-t border-[var(--border-subtle)] space-y-3 bg-[var(--bg-sidebar)]">
          {storageStatus && (
            <div className="p-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] border border-[var(--border-subtle)] space-y-2">
              <div className="flex justify-between text-[11px]">
                <span className="text-[var(--text-secondary)]">Phone Storage</span>
                <span className="text-[var(--text-primary)] font-medium">{usedPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-400 to-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${usedPercent}%` }}
                />
              </div>
              <div className="text-[10px] text-[var(--text-muted)] flex justify-between">
                <span>{formatBytes(usedBytes)} used</span>
                <span>{formatBytes(storageStatus.totalSpaceBytes)}</span>
              </div>
            </div>
          )}

          <button
            onClick={onLogout}
            className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-xs text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Disconnect Session</span>
          </button>
        </div>
      </aside>
    </>
  )
}
