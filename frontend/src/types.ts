// 与后端 types.go / store.go 的 JSON 契约保持一致
import type { MapTheme, NetUnit, StorageUnit, UiMode } from './format'
export type { MapTheme, NetUnit, StorageUnit, UiMode }

export interface CPUSys { usedPercent: number; cores: number }
export interface MemSys { total: number; used: number; usedPercent: number; commitTotal: number; commitLimit: number }
export interface NetSys { recvBps: number; sentBps: number }
export interface GPUSys {
  usedPercent: number
  byEngine: Record<string, number>
  adapterName: string
  vramDedicatedUsed: number
  vramDedicatedTotal: number
  vramSharedUsed: number
  vramSharedTotal: number
}
export interface DiskSys { name: string; readBps: number; writeBps: number; activePercent: number }
export interface ProcessInfo {
  pid: number
  ppid: number
  name: string
  cpu: number      // 全机口径 0-100*cores
  cpuNorm: number  // 任务管理器口径 0-100
  memWs: number
  memPrivate: number
  memCommit: number
  gpu: number
  vramDedicated: number
  vramShared: number
  diskRead: number
  diskWrite: number
}
export interface Sample {
  ts: number
  intervalSec: number
  collectMs: number
  warmup: boolean
  cpu: CPUSys
  mem: MemSys
  net: NetSys
  gpu: GPUSys
  disks: DiskSys[]
  processes: ProcessInfo[]
  self: SelfInfo
}

export interface SelfInfo { pid: number; cpuNorm: number; memWs: number }

export interface HostInfo {
  hostname: string
  os: string
  osVersion: string
  arch: string
  cpuName: string
  cpuCores: number
  memTotal: number
  gpuName: string
  vramTotal: number
  goVersion: string
}

export interface AppConfig {
  intervalMs: number
  alwaysOnTop: boolean
  storageUnit: StorageUnit
  netUnit: NetUnit
  mapTheme: MapTheme
  uiTheme: UiMode
}

// store.Point 历史聚合点
export interface Point {
  ts: number
  cpu: number
  cores: number
  warmup: boolean
  memUsed: number
  memTotal: number
  memPercent: number
  commitUsed: number
  commitLim: number
  gpu: number
  byEngine: Record<string, number>
  adapterName: string
  vramDedUsed: number
  vramDedTotal: number
  vramShrUsed: number
  vramShrTotal: number
  netRecvBps: number
  netSentBps: number
  diskReadBps: number
  diskWriteBps: number
  diskActive: number
}

export interface AppConfig { intervalMs: number; alwaysOnTop: boolean }
