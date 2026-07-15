import type { SVGProps } from 'react'

export type IconName =
  | 'home'
  | 'folder'
  | 'image'
  | 'help'
  | 'settings'
  | 'upload-cloud'
  | 'monitor'
  | 'phone'
  | 'bookmark'
  | 'play'
  | 'download'
  | 'refresh'
  | 'bulb'
  | 'check-circle'
  | 'arrow-right'
  | 'plus'
  | 'x'
  | 'chevron-right'
  | 'alert'

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

const PATHS: Record<IconName, JSX.Element> = {
  home: (
    <path d="M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m4 17 5-5 4 4 3-3 4 4" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.3-2.4 3.8" />
      <path d="M12 17.5h.01" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.3a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.3 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 7 2.6h.1A1.7 1.7 0 0 0 8.9 1V.9a2 2 0 1 1 4 0V1a1.7 1.7 0 0 0 2.9 1.2 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21.4 8H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 3Z" />
    </>
  ),
  'upload-cloud': (
    <>
      <path d="M16 16.5 12 12.5l-4 4" />
      <path d="M12 12.5v9" />
      <path d="M20.4 17.6A4.5 4.5 0 0 0 18 9.2h-1.3A7 7 0 1 0 5 15.6" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  bookmark: <path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4Z" />,
  play: <path d="M8 5.5v13l11-6.5Z" />,
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v5h-5" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2h5c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3Z" />
    </>
  ),
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  'arrow-right': <path d="M4 12h15m0 0-6-6m6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  alert: (
    <>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
}

export function Icon({ name, size = 20, ...rest }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}

/**
 * The SowyVid brand mark: a stylized swift in forward motion (suggesting speed
 * + video), NOT the old Colibrí hummingbird. Rendered filled in accent violet.
 * See docs/MOCKUP-ANALYSIS.md for why the brand glyph deviates from the mockup.
 */
export function SowyvidMark({ size = 30, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <defs>
        <linearGradient id="sowyvid-mark" x1="4" y1="6" x2="28" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b6cff" />
          <stop offset="1" stopColor="#6a3ff0" />
        </linearGradient>
      </defs>
      {/* Swept wing / play-triangle hybrid */}
      <path
        d="M4 20.5c6.2-1 10.3-3.4 13.4-7.6 1.1-1.5 2-3.3 2.7-5.4.3-.9 1.5-1 2-.2 1.6 2.7 2 5.7 1 8.9-1.7 5.5-7 9-13.2 8.8-2 0-3.9-.5-5.6-1.4-.6-.3-.6-1.2 0-1.5Z"
        fill="url(#sowyvid-mark)"
      />
      <path
        d="M14.5 18.2c2.4-1 4.2-2.6 5.6-4.9"
        stroke="#0a0a0f"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.25"
      />
    </svg>
  )
}
