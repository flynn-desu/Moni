// SVG 环形仪表：图标标题行 + 大弧圈 + 中心大数值，Liquid Glass 高光风格
import type { ReactNode } from 'react'

interface Props {
  /** 弧线百分比 0-100（可超过 100，内部截断） */
  value: number
  /** 中心大字（仅数值部分，如 "9.81"） */
  display: string
  /** 中心数值下方小字（单位，如 "GB"） */
  unit?: string
  /** 标题 */
  title: string
  /** 标题旁的硬件图标（配合 variant 决定配色） */
  icon?: ReactNode
  /** 图标配色方案：cpu/mem/gpu/vram/disk/net（主题感知） */
  variant?: string
  /** 明细行（右侧列） */
  details?: ReactNode
  /** 弧线渐变主色（CSS 颜色或 var） */
  accent: string
}

export function Gauge({ value, display, unit, title, icon, variant, details, accent }: Props) {
  const r = 42
  const c = 2 * Math.PI * r
  // 270° 弧：留出底部 90° 缺口
  const arc = c * 0.75
  const pct = Math.max(0, Math.min(100, value))
  const gid = `g-${accent.replace(/[^a-z0-9]/gi, '')}`
  // 自适应字号：避免长文本溢出弧圈
  const fontSize = display.length > 6 ? 19 : display.length > 4 ? 24 : 32
  return (
    <div className="gauge-card glass">
      <div className="gauge-head">
        {icon && <span className={'gauge-ico' + (variant ? ' ico-' + variant : '')}>{icon}</span>}
        <span className="gauge-title">{title}</span>
      </div>
      <div className="gauge-body">
        <div className="gauge-svg">
          <svg width="100%" height="100%" viewBox="0 0 104 104" style={{ display: 'block', transform: 'rotate(135deg)' }}>
            <defs>
              <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                <stop offset="100%" stopColor={accent} />
              </linearGradient>
            </defs>
            <circle
              cx="52" cy="52" r={r} fill="none"
              strokeWidth="8.5"
              style={{ stroke: 'var(--gauge-track)' }}
              strokeDasharray={`${arc} ${c}`} strokeLinecap="round"
            />
            <circle
              cx="52" cy="52" r={r} fill="none"
              stroke={`url(#${gid})`} strokeWidth="8.5"
              strokeDasharray={`${arc * pct / 100} ${c}`} strokeLinecap="round"
              style={{
                filter: `drop-shadow(0 0 6px color-mix(in srgb, ${accent} 40%, transparent))`,
                transition: 'stroke-dasharray 0.5s cubic-bezier(0.22,1,0.36,1)',
              }}
            />
          </svg>
          <div className="gauge-num">
            <b style={{ fontSize }}>{display}</b>
            {unit && <span>{unit}</span>}
          </div>
        </div>
        <div className="gauge-info">{details}</div>
      </div>
    </div>
  )
}
