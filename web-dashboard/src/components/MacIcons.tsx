import React from 'react'

interface MacFolderIconProps {
  className?: string
  size?: number
}

export const MacFolderIcon: React.FC<MacFolderIconProps> = ({ className = '', size = 96 }) => {
  const gradFrontId = React.useId()
  const gradBackId = React.useId()
  const gradTabId = React.useId()

  return (
    <svg
      width={size}
      height={Math.round(size * 0.82)}
      viewBox="0 0 120 98"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`transition-transform duration-200 ${className}`}
      style={{
        filter: 'drop-shadow(0 10px 14px rgba(14, 165, 233, 0.22)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.08))',
      }}
    >
      <defs>
        {/* Back plate gradient */}
        <linearGradient id={gradBackId} x1="60" y1="6" x2="60" y2="84" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0284C7" />
          <stop offset="100%" stopColor="#0369A1" />
        </linearGradient>

        {/* Tab gradient */}
        <linearGradient id={gradTabId} x1="26" y1="4" x2="26" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>

        {/* Front pocket gradient - Apple macOS Blue */}
        <linearGradient id={gradFrontId} x1="60" y1="22" x2="60" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="18%" stopColor="#0EA5E9" />
          <stop offset="70%" stopColor="#0284C7" />
          <stop offset="100%" stopColor="#0369A1" />
        </linearGradient>
      </defs>

      {/* Back Plate & Tab */}
      <path
        d="M12 12C12 7.58172 15.5817 4 20 4H42.5C46.2 4 49.5 6.2 51 9.5L54.5 16.5C55.5 18.5 57.5 19.8 59.8 19.8H104C108.418 19.8 112 23.3817 112 27.8V78C112 82.4183 108.418 86 104 86H16C13.7909 86 12 84.2091 12 82V12Z"
        fill={`url(#${gradBackId})`}
      />

      {/* Back tab subtle inner highlight */}
      <path
        d="M20 5H42.2C45.6 5 48.6 6.9 50 10L53.5 17C54.8 19.5 57.2 21 60 21H104C107.8 21 111 24.2 111 28"
        stroke="rgba(255, 255, 255, 0.45)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* Front Pocket Body */}
      <rect
        x="6"
        y="23"
        width="108"
        height="68"
        rx="10"
        fill={`url(#${gradFrontId})`}
      />

      {/* Front pocket top rim highlight */}
      <path
        d="M16 23.8H104C108 23.8 111.5 26.5 112.5 30.2"
        stroke="rgba(255, 255, 255, 0.65)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* Front pocket embossed horizontal seam */}
      <path
        d="M9 39H111"
        stroke="rgba(3, 105, 161, 0.35)"
        strokeWidth="1.2"
      />
      <path
        d="M9 40.2H111"
        stroke="rgba(255, 255, 255, 0.25)"
        strokeWidth="0.8"
      />

      {/* Front pocket bottom rim shadow */}
      <rect
        x="7"
        y="24"
        width="106"
        height="66"
        rx="9"
        stroke="rgba(0, 0, 0, 0.12)"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  )
}

interface MacDocumentIconProps {
  extension?: string
  className?: string
  size?: number
}

export const MacDocumentIcon: React.FC<MacDocumentIconProps> = ({
  extension = 'FILE',
  className = '',
  size = 84,
}) => {
  const ext = extension.toUpperCase().slice(0, 4)

  // Badge colors tailored by extension
  let badgeGradient = 'from-sky-500 to-blue-600'
  if (['PDF'].includes(ext)) {
    badgeGradient = 'from-rose-500 to-red-600'
  } else if (['MP3', 'WAV', 'M4A', 'FLAC', 'AAC'].includes(ext)) {
    badgeGradient = 'from-violet-500 to-purple-600'
  } else if (['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(ext)) {
    badgeGradient = 'from-amber-500 to-yellow-600'
  } else if (['JS', 'TS', 'PY', 'KT', 'HTML', 'CSS', 'JSON', 'CPP'].includes(ext)) {
    badgeGradient = 'from-emerald-500 to-teal-600'
  } else if (['DOC', 'DOCX', 'TXT', 'MD', 'XLS', 'PPT'].includes(ext)) {
    badgeGradient = 'from-sky-500 to-cyan-600'
  } else if (['APK', 'AAB'].includes(ext)) {
    badgeGradient = 'from-lime-500 to-emerald-600'
  }

  return (
    <div
      className={`relative flex items-center justify-center transition-transform duration-200 ${className}`}
      style={{
        width: size,
        height: Math.round(size * 1.18),
        filter: 'drop-shadow(0 8px 12px rgba(0, 0, 0, 0.12)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.06))',
      }}
    >
      <svg
        viewBox="0 0 90 110"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Paper Body with Folded Top Right Corner */}
        <path
          d="M8 8C8 3.58172 11.5817 0 16 0H62L88 26V102C88 106.418 84.4183 110 80 110H16C11.5817 110 8 106.418 8 102V8Z"
          fill="var(--mac-doc-bg, #FFFFFF)"
          stroke="var(--mac-doc-border, rgba(0, 0, 0, 0.1))"
          strokeWidth="1.5"
        />

        {/* Folded Corner Triangle */}
        <path
          d="M62 0V20C62 23.3137 64.6863 26 68 26H88L62 0Z"
          fill="var(--mac-doc-fold, #E2E8F0)"
        />
        <path
          d="M62 20C62 23.3137 64.6863 26 68 26H88"
          stroke="rgba(0, 0, 0, 0.1)"
          strokeWidth="1.2"
        />

        {/* Decorative document text lines */}
        <rect x="20" y="38" width="48" height="3" rx="1.5" fill="var(--mac-doc-line, #CBD5E1)" />
        <rect x="20" y="47" width="50" height="3" rx="1.5" fill="var(--mac-doc-line, #CBD5E1)" />
        <rect x="20" y="56" width="36" height="3" rx="1.5" fill="var(--mac-doc-line, #CBD5E1)" />
      </svg>

      {/* macOS Style Colored Extension Tag */}
      <div
        className={`absolute bottom-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-md shadow-sm bg-gradient-to-r ${badgeGradient} text-white font-bold text-[10px] tracking-wider uppercase select-none`}
      >
        {ext}
      </div>
    </div>
  )
}
