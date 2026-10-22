import React from 'react'
import { ChevronRight, Home, Folder } from 'lucide-react'

interface BreadcrumbItem {
  id: string
  name: string
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
  onNavigate: (id: string | null) => void
  currentFolderTitle?: string
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  items,
  onNavigate,
  currentFolderTitle,
}) => {
  return (
    <div className="flex items-center space-x-1.5 text-xs text-[var(--text-secondary)] overflow-x-auto py-2 no-scrollbar">
      <button
        onClick={() => onNavigate(null)}
        className="flex items-center space-x-1 hover:text-[var(--text-primary)] transition py-1 px-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
      >
        <Home className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
        <span>Shared Drives</span>
      </button>

      {items
        .filter((item) => item.id !== '' && item.id !== 'root')
        .map((item, index, filtered) => {
          const isLast = index === filtered.length - 1
          return (
            <React.Fragment key={item.id}>
              <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
              <button
                onClick={() => onNavigate(item.id)}
                disabled={isLast}
                className={`flex items-center space-x-1 py-1 px-1.5 rounded-lg transition shrink-0 ${
                  isLast
                    ? 'text-[var(--text-primary)] font-medium cursor-default'
                    : 'hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <Folder className="w-3.5 h-3.5 text-sky-400" />
                <span>{item.name}</span>
              </button>
            </React.Fragment>
          )
        })}

      {!items.length && currentFolderTitle && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          <span className="text-[var(--text-primary)] font-medium py-1 px-1.5">{currentFolderTitle}</span>
        </>
      )}
    </div>
  )
}
