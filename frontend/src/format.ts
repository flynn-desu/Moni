export type StorageUnit = 'auto' | 'MB' | 'GB'
export type NetUnit = 'auto' | 'KB' | 'MB' | 'GB'
export type MapTheme = 'aurora' | 'teal' | 'mono' | 'rainbow' | 'sunset' | 'candy'
export type UiMode = 'dark' | 'light'

// 偏好上下文默认值
export const DEFAULT_PREFS = { storage: 'auto', net: 'auto', theme: 'aurora' } as const

/** 存储容量格式化：auto = <1GB 用 MB，≥1GB 用 GB；固定单位时始终换算到该单位 */
export function fmtStorage(v: number, mode: StorageUnit): string {
  if (!isFinite(v) || v <= 0) return '0 MB'
  if (mode === 'GB') return (v / 2 ** 30).toFixed(2) + ' GB'
  const mb = v / 2 ** 20
  if (mode === 'MB') return (mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)) + ' MB'
  return v >= 2 ** 30 ? (v / 2 ** 30).toFixed(2) + ' GB' : (mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)) + ' MB'
}

/** 拆出数值与单位（仪表盘中心大数字用） */
export function splitStorage(v: number, mode: StorageUnit): { n: string; u: string } {
  if (!isFinite(v) || v <= 0) return { n: '0', u: 'MB' }
  if (mode === 'GB') return { n: (v / 2 ** 30).toFixed(2), u: 'GB' }
  const mb = v / 2 ** 20
  if (mode === 'MB') return { n: mb >= 100 ? mb.toFixed(0) : mb.toFixed(1), u: 'MB' }
  if (v >= 2 ** 30) return { n: (v / 2 ** 30).toFixed(2), u: 'GB' }
  return { n: mb >= 100 ? mb.toFixed(0) : mb.toFixed(1), u: 'MB' }
}

/** 网络速率格式化：auto = KB/s → MB/s → GB/s */
export function fmtNet(v: number, mode: NetUnit): string {
  if (!isFinite(v) || v <= 0) return '0 KB/s'
  if (mode === 'KB') return (v / 2 ** 10).toFixed(0) + ' KB/s'
  if (mode === 'MB') return (v / 2 ** 20).toFixed(2) + ' MB/s'
  if (mode === 'GB') return (v / 2 ** 30).toFixed(3) + ' GB/s'
  if (v >= 2 ** 30) return (v / 2 ** 30).toFixed(2) + ' GB/s'
  if (v >= 2 ** 20) return (v / 2 ** 20).toFixed(1) + ' MB/s'
  return (v / 2 ** 10).toFixed(1) + ' KB/s'
}

/** 拆出数值与单位（网络） */
export function splitNet(v: number, mode: NetUnit): { n: string; u: string } {
  const s = fmtNet(v, mode)
  const i = s.lastIndexOf(' ')
  return { n: s.slice(0, i), u: s.slice(i + 1) }
}

/** 曲线 Y 轴紧凑刻度（按单位模式） */
export function fmtNetAxis(v: number, mode: NetUnit): string {
  if (!isFinite(v) || v <= 0) return '0'
  const pick = (bytes: number, suffix: string) =>
    v >= 100 * bytes ? (v / bytes).toFixed(0) : (v / bytes).toFixed(1)
  if (mode === 'KB') return pick(2 ** 10, 'K') + 'K'
  if (mode === 'MB') return pick(2 ** 20, 'M') + 'M'
  if (mode === 'GB') return pick(2 ** 30, 'G') + 'G'
  if (v >= 2 ** 30) return pick(2 ** 30, 'G') + 'G'
  if (v >= 2 ** 20) return pick(2 ** 20, 'M') + 'M'
  return pick(2 ** 10, 'K') + 'K'
}

// ---- 以下为与单位模式无关的通用格式化 ----

export function fmtPct(v: number, digits = 1): string {
  return v.toFixed(digits) + '%'
}

export function fmtTime(tsSec: number): string {
  const d = new Date(tsSec * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
