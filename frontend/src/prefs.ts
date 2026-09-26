// 显示偏好上下文：明暗主题、单位模式与树图配色，全应用共享
import { createContext, useContext } from 'react'
import type { MapTheme, NetUnit, StorageUnit, UiMode } from './format'

export interface Prefs {
  mode: UiMode
  storage: StorageUnit
  net: NetUnit
  theme: MapTheme
}

const Ctx = createContext<Prefs>({ mode: 'dark', storage: 'auto', net: 'auto', theme: 'aurora' })

export const PrefsProvider = Ctx.Provider
export const usePrefs = (): Prefs => useContext(Ctx)

export const STORAGE_LABELS: { key: StorageUnit; label: string }[] = [
  { key: 'auto', label: '智能' },
  { key: 'MB', label: 'MB' },
  { key: 'GB', label: 'GB' },
]

export const NET_LABELS: { key: NetUnit; label: string }[] = [
  { key: 'auto', label: '智能' },
  { key: 'KB', label: 'KB/s' },
  { key: 'MB', label: 'MB/s' },
  { key: 'GB', label: 'GB/s' },
]

export const MODE_LABELS: { key: UiMode; label: string }[] = [
  { key: 'dark', label: '暗色' },
  { key: 'light', label: '浅色' },
]

export interface ThemeOpt { key: MapTheme; label: string; swatch: string }

// 树图配色：3 个纯色 + 3 个多彩
export const THEME_LABELS: ThemeOpt[] = [
  { key: 'aurora', label: '极光蓝', swatch: 'linear-gradient(135deg,#7cc4ff,#3b82f6)' },
  { key: 'teal', label: '晨雾青', swatch: 'linear-gradient(135deg,#5eead4,#14b8a6)' },
  { key: 'mono', label: '极简灰', swatch: 'linear-gradient(135deg,#cbd5e1,#64748b)' },
  { key: 'rainbow', label: '彩虹', swatch: 'linear-gradient(135deg,#f87171,#fbbf24,#34d399,#60a5fa,#c084fc)' },
  { key: 'sunset', label: '日落', swatch: 'linear-gradient(135deg,#c084fc,#f472b6,#fb923c,#ef4444)' },
  { key: 'candy', label: '马卡龙', swatch: 'linear-gradient(135deg,#93c5fd,#86efac,#fde68a,#f9a8d4)' },
]
