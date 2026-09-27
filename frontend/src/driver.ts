// 驱动层：有 Wails 后端时走绑定与事件；纯浏览器（vite dev 调试）时用 Mock 数据。
import type { Sample, Point, AppConfig, HostInfo, NetUnit, StorageUnit, UiMode, BgMode } from './types'

export interface Driver {
  getHistory(): Promise<Point[]>
  getConfig(): Promise<AppConfig>
  setInterval(ms: number): Promise<void>
  setThrottled(on: boolean): Promise<void>
  setUnits(storage: StorageUnit, net: NetUnit): Promise<void>
  setMapTheme(theme: string): Promise<void>
  setUiTheme(mode: UiMode): Promise<void>
  setBgMode(mode: BgMode): Promise<void>
  setBlur(px: number): Promise<void>
  setCloseAction(action: 'exit' | 'minimise'): Promise<void>
  setGlass3d(on: boolean): Promise<void>
  setShowLogo(on: boolean): Promise<void>
  selectWallpaper(): Promise<string>
  clearWallpaper(): Promise<void>
  getWallpaperData(): Promise<string>
  getHostInfo(): Promise<HostInfo>
  setAlwaysOnTop(on: boolean): void
  onSample(cb: (s: Sample) => void): () => void
}

export const hasBackend = typeof (window as { go?: unknown }).go !== 'undefined'

// ---------------- Wails 驱动 ----------------
function wailsDriver(): Driver {
  const runtime = async () => await import('../wailsjs/runtime/runtime')
  const bindings = async () => await import('../wailsjs/go/main/App')
  return {
    async getHistory() { return (await bindings()).GetHistory() },
    async getConfig() { return (await bindings()).GetConfig() as unknown as AppConfig },
    async setInterval(ms) { await (await bindings()).SetInterval(ms) },
    async setThrottled(on) { await (await bindings()).SetThrottled(on) },
    async setUnits(storage, net) { await (await bindings()).SetUnits(storage, net) },
    async setMapTheme(theme) { await (await bindings()).SetMapTheme(theme) },
    async setUiTheme(mode) { await (await bindings()).SetUiTheme(mode) },
    async setBgMode(mode) { await (await bindings()).SetBgMode(mode) },
    async setBlur(px) { await (await bindings()).SetBlur(px) },
    async setCloseAction(action) { await (await bindings()).SetCloseAction(action) },
    async setGlass3d(on) { await (await bindings()).SetGlass3D(on) },
    async setShowLogo(on) { await (await bindings()).SetShowLogo(on) },
    async selectWallpaper() { return (await bindings()).SelectWallpaper() },
    async clearWallpaper() { await (await bindings()).ClearWallpaper() },
    async getWallpaperData() { return (await bindings()).GetWallpaperData() },
    async getHostInfo() { return (await bindings()).GetHostInfo() },
    setAlwaysOnTop(on) { runtime().then(r => r.WindowSetAlwaysOnTop(on)) },
    onSample(cb) {
      runtime().then(r => r.EventsOn('sample', cb as unknown as (...data: unknown[]) => void))
      return () => { runtime().then(r => r.EventsOff('sample')) }
    },
  }
}

// ---------------- 浏览器 Mock 驱动（仅开发调试） ----------------
interface MockProc {
  name: string; ppid: number; pid: number
  cpu: number; mem: number; commit: number; gpu: number; vram: number; disk: number
}
const MOCK_TREE: MockProc[] = (() => {
  const list: MockProc[] = []
  let pid = 1000
  const add = (name: string, ppid: number, v: Partial<MockProc>) => {
    const p: MockProc = { pid: ++pid, ppid, name, cpu: 0, mem: 0, commit: 0, gpu: 0, vram: 0, disk: 0, ...v }
    list.push(p)
    return p.pid
  }
  add('System Idle Process', 0, {})
  add('System', 0, { cpu: 2, mem: 0.1e9 })
  add('explorer.exe', 300, { cpu: 6, mem: 0.3e9, commit: 0.4e9, disk: 0.2e6 })
  const wx = add('Weixin.exe', 0, { cpu: 8, mem: 0.5e9, commit: 0.6e9 })
  add('WeChatAppEx.exe', wx, { cpu: 4, mem: 0.25e9 })
  add('WeChatAppEx.exe', wx, { cpu: 2, mem: 0.18e9 })
  const pc = add('pycharm64.exe', 0, { cpu: 14, mem: 2.4e9, commit: 2.6e9, disk: 1e6 })
  add('java.exe', pc, { cpu: 30, mem: 1.2e9, commit: 1.8e9 })
  add('java.exe', pc, { cpu: 18, mem: 0.9e9, commit: 1.3e9 })
  add('fsnotifier.exe', pc, { cpu: 1, mem: 0.05e9 })
  const chr = add('chrome.exe', 0, { cpu: 10, mem: 0.8e9, commit: 1.0e9 })
  for (let i = 0; i < 8; i++) add('chrome.exe', chr, { cpu: 2 + Math.random() * 4, mem: 0.15e9 + Math.random() * 0.2e9, commit: 0.25e9 })
  const py = add('python.exe', 0, { cpu: 470, mem: 2.0e9, commit: 12.9e9, gpu: 66, vram: 10.4e9, disk: 0.4e6 })
  add('python.exe', py, { cpu: 12, mem: 0.3e9, commit: 0.5e9 })
  add('vmmem', 0, { cpu: 20, mem: 1.9e9, commit: 2.0e9 })
  add('mysqld.exe', 0, { cpu: 4, mem: 0.4e9, commit: 0.6e9, disk: 0.3e6 })
  add('svchost.exe', 0, { cpu: 2, mem: 0.05e9 })
  add('svchost.exe', 0, { cpu: 1, mem: 0.03e9 })
  add('msedgewebview2.exe', 0, { cpu: 3, mem: 0.2e9 })
  add('ZCode.exe', 0, { cpu: 9, mem: 0.4e9, commit: 0.5e9 })
  add('WorkBuddy.exe', 0, { cpu: 7, mem: 0.9e9, commit: 0.95e9 })
  add('wetype_renderer.exe', 0, { cpu: 1, mem: 0.1e9 })
  add('Clash for Windows.exe', 0, { cpu: 2, mem: 0.15e9 })
  add('QQ.exe', 0, { cpu: 2, mem: 0.25e9 })
  add('Registry', 0, { mem: 0.1e9 })
  add('Secure System', 0, { mem: 0.02e9 })
  return list
})()

function mockDriver(): Driver {
  let interval = 1000
  let throttled = false
  const cfg: AppConfig = { intervalMs: 1000, alwaysOnTop: false, storageUnit: 'auto', netUnit: 'auto', mapTheme: 'aurora', uiTheme: 'dark', bgMode: 'solid', blur: 30, closeAction: 'exit', glass3d: false, showLogo: true }
  const ring: Point[] = []
  let subs: ((s: Sample) => void)[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let phase = 0

  const walk = (v: number, amp: number, min: number, max: number) =>
    Math.min(max, Math.max(min, v + (Math.random() - 0.5) * amp))

  function tick() {
    phase++
    const cpuTotal = walk(46, 8, 5, 98)
    const gpu = walk(64, 6, 0, 100)
    const memUsed = walk(24.8e9, 0.15e9, 1e9, 47e9)
    const memTotal = 47.82e9
    const recv = Math.max(0, walk(60e3, 90e3, 0, 5e6)) * (Math.random() < 0.08 ? 40 : 1)
    const sent = Math.max(0, walk(30e3, 40e3, 0, 2e6))
    const dw = Math.max(0, walk(0.6e6, 0.8e6, 0, 60e6))
    const dr = Math.max(0, walk(0.2e6, 0.3e6, 0, 200e6))
    const procs = MOCK_TREE.map(t => {
      const jitter = 0.6 + Math.random() * 0.8
      return {
        pid: t.pid, ppid: t.ppid, name: t.name,
        cpu: t.cpu * jitter, cpuNorm: 0,
        memWs: t.mem, memPrivate: t.mem * 0.88, memCommit: t.commit || t.mem * 1.1,
        gpu: t.gpu * jitter, vramDedicated: t.vram, vramShared: 0,
        diskRead: t.disk * jitter * 0.4, diskWrite: t.disk * jitter * 0.6,
      }
    })
    for (const p of procs) p.cpuNorm = p.cpu / 12
    procs.sort((a, b) => b.cpu - a.cpu)
    const s: Sample = {
      ts: Date.now(), intervalSec: (throttled ? 5000 : interval) / 1000, collectMs: 4 + Math.random() * 4,
      warmup: phase === 1,
      cpu: { usedPercent: cpuTotal, cores: 12 },
      mem: { total: memTotal, used: memUsed, usedPercent: memUsed / memTotal * 100, commitTotal: 38.4e9, commitLimit: 55e9 },
      net: { recvBps: recv, sentBps: sent },
      gpu: {
        usedPercent: gpu, byEngine: { cuda: gpu, '3d': walk(8, 4, 0, 100), copy: walk(1, 1, 0, 100) },
        adapterName: 'NVIDIA GeForce RTX 4060 Ti',
        vramDedicatedUsed: 10.4e9 * (gpu / 64), vramDedicatedTotal: 16e9,
        vramSharedUsed: 91e6, vramSharedTotal: 23.91e9,
      },
      disks: [
        { name: '0 C: D:', readBps: dr * 0.7, writeBps: dw, activePercent: Math.min(100, (dw / 2e7) * 100) },
        { name: '1 E:', readBps: dr * 0.3, writeBps: 0, activePercent: Math.min(100, (dr / 5e7) * 100) },
      ],
      processes: procs,
      self: { pid: 99999, cpuNorm: 0.3 + Math.random() * 0.5, memWs: 46e6 + Math.random() * 12e6 },
    }
    const p: Point = {
      ts: s.ts, cpu: cpuTotal, cores: 12, warmup: s.warmup,
      memUsed: memUsed, memTotal: memTotal, memPercent: s.mem.usedPercent,
      commitUsed: s.mem.commitTotal, commitLim: s.mem.commitLimit,
      gpu, byEngine: s.gpu.byEngine, adapterName: s.gpu.adapterName,
      vramDedUsed: s.gpu.vramDedicatedUsed, vramDedTotal: 16e9,
      vramShrUsed: 91e6, vramShrTotal: 23.91e9,
      netRecvBps: recv, netSentBps: sent,
      diskReadBps: dr, diskWriteBps: dw,
      diskActive: Math.max(s.disks[0].activePercent, s.disks[1].activePercent),
    }
    ring.push(p)
    if (ring.length > 300) ring.shift()
    for (const cb of subs) cb(s)
  }

  function loop() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { tick(); loop() }, throttled ? 5000 : interval)
  }
  // 预填历史
  for (let i = 0; i < 120; i++) tick()
  subs = []
  loop()

  const MOCK_HOST: HostInfo = {
    hostname: 'DESKTOP-MOCK',
    os: 'Windows 11 专业版',
    osVersion: '24H2 · Build 26100',
    arch: 'amd64',
    cpuName: 'Mock CPU (R) Core(TM) Ultra 9 @ 3.20GHz',
    cpuCores: 12,
    memTotal: 47.82e9,
    gpuName: 'NVIDIA GeForce RTX 4060 Ti (Mock)',
    vramTotal: 16e9,
    goVersion: 'go1.27.1',
    appVersion: 'v1.0.2',
  }

  return {
    async getHistory() { return [...ring] },
    async getConfig() { return cfg },
    async setInterval(ms) { cfg.intervalMs = ms; interval = ms },
    async setThrottled(on) { throttled = on },
    async setUnits(storage, net) { cfg.storageUnit = storage; cfg.netUnit = net },
    async setMapTheme(theme) { cfg.mapTheme = theme as AppConfig['mapTheme'] },
    async setUiTheme(mode) { cfg.uiTheme = mode },
    async setBgMode(mode) { cfg.bgMode = mode },
    async setBlur(px) { cfg.blur = px },
    async setCloseAction(a) { cfg.closeAction = a },
    async setGlass3d(on) { cfg.glass3d = on },
    async setShowLogo(on) { cfg.showLogo = on },
    async selectWallpaper() { return '' },
    async clearWallpaper() { cfg.bgMode = 'solid' },
    async getWallpaperData() { return '' },
    async getHostInfo() { return MOCK_HOST },
    setAlwaysOnTop() {},
    onSample(cb) {
      subs.push(cb)
      return () => { subs = subs.filter(f => f !== cb) }
    },
  }
}

export const driver: Driver = hasBackend ? wailsDriver() : mockDriver()
