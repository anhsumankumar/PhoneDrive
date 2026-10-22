import React from 'react'
import {
  Menu,
  Search,
  LayoutGrid,
  List,
  Upload,
  RefreshCw,
  X,
  Wifi,
  Sun,
  Moon,
} from 'lucide-react'

interface HeaderProps {
  onToggleSidebar: () => void
  searchQuery: string
  onSearchChange: (q: string) => void
  viewMode: 'grid' | 'list'
  onChangeViewMode: (mode: 'grid' | 'list') => void
  onOpenUpload: () => void
  onRefresh: () => void
  loading: boolean
  theme?: 'light' | 'dark'
  onToggleTheme?: () => void
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  searchQuery,
  onSearchChange,
  viewMode,
  onChangeViewMode,
  onOpenUpload,
  onRefresh,
  loading,
  theme = 'dark',
  onToggleTheme,
}) => {
  return (
    <header className="h-16 px-4 lg:px-8 border-b border-[var(--border-subtle)] bg-[var(--bg-header)] backdrop-blur-md flex items-center justify-between sticky top-0 z-20 transition-colors duration-200">
      <div className="flex items-center space-x-3 flex-1 max-w-xl">
        {/* Mobile menu trigger */}
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 transition"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Search Bar */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search files on your phone..."
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] text-xs focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-2 sm:space-x-3 ml-3">
        {/* Day / Night Theme Toggle */}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to Day Mode (Light)' : 'Switch to Night Mode (Dark)'}
            className="p-2 rounded-xl bg-[var(--input-bg)] border border-[var(--border-subtle)] hover:border-sky-500/40 text-[var(--text-secondary)] hover:text-sky-400 transition flex items-center justify-center shadow-sm"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400 hover:rotate-45 transition-transform" />
            ) : (
              <Moon className="w-4 h-4 text-sky-600 hover:-rotate-12 transition-transform" />
            )}
          </button>
        )}

        {/* Local Network connection badge */}
        <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[11px] font-medium">
          <Wifi className="w-3.5 h-3.5" />
          <span>Local Wi-Fi</span>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl p-0.5">
          <button
            onClick={() => onChangeViewMode('grid')}
            title="Grid View"
            className={`p-1.5 rounded-lg transition ${
              viewMode === 'grid'
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => onChangeViewMode('list')}
            title="List View"
            className={`p-1.5 rounded-lg transition ${
              viewMode === 'list'
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        {/* Refresh */}
        <button
          onClick={onRefresh}
          title="Refresh files"
          disabled={loading}
          className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-400' : ''}`} />
        </button>

        {/* Upload Button */}
        <button
          onClick={onOpenUpload}
          className="flex items-center space-x-2 py-2 px-3.5 rounded-xl text-xs font-medium text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:scale-[0.98] transition shadow-md shadow-sky-500/25"
        >
          <Upload className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Upload File</span>
        </button>
      </div>
    </header>
  )
}
