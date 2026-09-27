// 手写线性 SVG 图标（24 viewBox，stroke 风格与玻璃设计统一）
import type { ReactNode } from 'react'

const svgProps = {
  width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

export function IconCpu(): ReactNode {
  return (
    <svg {...svgProps}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="10" y="10" width="4" height="4" rx="0.8" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </svg>
  )
}

export function IconGpu(): ReactNode {
  return (
    <svg {...svgProps}>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <circle cx="9" cy="12" r="2.6" />
      <path d="M9 9.4v-1M9 15.6v1M6.4 12h-1M12.6 12h1" />
      <path d="M15 10h3.5M15 12h3.5M15 14h2" />
      <path d="M5 17.5v1.5M19 17.5v1.5" />
    </svg>
  )
}

export function IconMemory(): ReactNode {
  return (
    <svg {...svgProps}>
      <rect x="3" y="7" width="18" height="9" rx="1.6" />
      <path d="M7 10v3M11 10v3M15 10v3" />
      <path d="M5.5 16v2M9.5 16v2M13.5 16v2M17.5 16v2" />
    </svg>
  )
}

export function IconVram(): ReactNode {
  return (
    <svg {...svgProps}>
      <path d="M12 3.5L20 9v6l-8 5.5L4 15V9l8-5.5z" />
      <path d="M4 9l8 5 8-5M12 14v6.5" />
    </svg>
  )
}

export function IconDisk(): ReactNode {
  return (
    <svg {...svgProps}>
      <rect x="3" y="6.5" width="18" height="11" rx="2" />
      <circle cx="9" cy="12" r="2.4" />
      <path d="M14.5 10h4M14.5 12.5h4M14.5 15h2.2" />
      <path d="M6 17.5v2M18 17.5v2" />
    </svg>
  )
}

export function IconNet(): ReactNode {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.8 2.6 2.8 14.4 0 17M12 3.5c-2.8 2.6-2.8 14.4 0 17" />
    </svg>
  )
}

export function IconOS(): ReactNode {
  return (
    <svg {...svgProps}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M3 9h18" />
      <circle cx="6" cy="6.8" r="0.4" fill="currentColor" />
      <circle cx="8.4" cy="6.8" r="0.4" fill="currentColor" />
      <path d="M7 13.5h6M7 16h9" />
    </svg>
  )
}

export function IconDevice(): ReactNode {
  return (
    <svg {...svgProps}>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <circle cx="12" cy="17.5" r="1" />
      <path d="M10 6.5h4" />
    </svg>
  )
}

// 图钉（进程钉选），size 可缩小用于行内按钮/角标
export function IconPin({ size = 22 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3.5h6" />
      <path d="M10 3.5v4.8L6.6 12.4a1.1 1.1 0 0 0 .95 1.6h8.9a1.1 1.1 0 0 0 .95-1.6L14 8.3V3.5" />
      <path d="M12 14v6.5" />
    </svg>
  )
}

// ---- 自绘标题栏窗口控制按钮（实心小图形，置于彩色圆钮上） ----

export function IconWinClose({ size = 14 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={3.4} strokeLinecap="round">
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  )
}

export function IconWinMin({ size = 14 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={3.4} strokeLinecap="round">
      <path d="M5.5 12h13" />
    </svg>
  )
}

// 最大化：圆角方块轮廓
export function IconWinMax({ size = 13 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.8} strokeLinejoin="round">
      <rect x="5" y="5" width="14" height="14" rx="2.5" />
    </svg>
  )
}

// 向下还原：两个背向三角（参考图样式）
export function IconWinRestore({ size = 13 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M13.5 4L4 13.5h9.5V4z" />
      <path d="M10.5 20L20 10.5h-9.5V20z" />
    </svg>
  )
}
