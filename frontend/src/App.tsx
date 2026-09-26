import { useCallback, useEffect, useRef, useState } from 'react'
import type { Point, ProcessInfo, Sample } from './types'
import type { BgMode, MapTheme, NetUnit, StorageUnit, UiMode } from './format'
import { PrefsProvider, BG_LABELS, MODE_LABELS, NET_LABELS, STORAGE_LABELS, type Prefs } from './prefs'
import { fmtStorage } from './format'
import { driver } from './driver'
import { Dashboard } from './views/Dashboard'
import { Charts } from './views/Charts'
import { ProcessTree } from './views/ProcessTree'
import { Treemap } from './views/Treemap'
import { Host } from './views/Host'

type ViewKey = 'dash' | 'charts' | 'tree' | 'map' | 'host'

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'dash', label: '仪表盘' },
  { key: 'charts', label: '曲线' },
  { key: 'tree', label: '进程' },
  { key: 'map', label: '树图' },
  { key: 'host', label: '主机' },
]

const MAX_POINTS = 300

export default function App() {
  const [view, setView] = useState<ViewKey>('dash')
  const [sample, setSample] = useState<Sample | null>(null)
  const [history, setHistory] = useState<Point[]>([])
  const [prefs, setPrefs] = useState<Prefs>({ mode: 'dark', bgMode: 'solid', blur: 30, storage: 'auto', net: 'auto', theme: 'aurora' })
  const [wallpaper, setWallpaper] = useState('')
  const [intervalMs, setIntervalMs] = useState(1000)
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const histRef = useRef<Point[]>([])
  const dirtyRef = useRef(false)
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  const flushHistory = useCallback(() => {
    setHistory([...histRef.current])
    dirtyRef.current = false
  }, [])

  // 初始化：拉设置 + 历史，订阅采样事件
  useEffect(() => {
    let unsub: (() => void) | undefined
    let disposed = false
    driver.getConfig().then(c => {
      if (disposed) return
      setIntervalMs(c.intervalMs)
      setAlwaysOnTop(c.alwaysOnTop)
      setPrefs({ mode: c.uiTheme, bgMode: c.bgMode, blur: c.blur, storage: c.storageUnit, net: c.netUnit, theme: c.mapTheme })
      if (c.alwaysOnTop) driver.setAlwaysOnTop(true)
    })
    driver.getWallpaperData().then(w => { if (!disposed) setWallpaper(w) })
    driver.getHistory().then(h => {
      if (disposed) return
      histRef.current = h
      flushHistory()
    })
    unsub = driver.onSample((s: Sample) => {
      // 防御性归一化：后端任何 nil 切片在 JSON 里是 null，不能让它进渲染层
      s.disks = s.disks ?? []
      s.processes = s.processes ?? []
      s.gpu.byEngine = s.gpu.byEngine ?? {}
      s.self = s.self ?? { pid: 0, cpuNorm: 0, memWs: 0 }
      if (!s.warmup) {
        histRef.current.push({
          ts: s.ts, cpu: s.cpu.usedPercent, cores: s.cpu.cores, warmup: s.warmup,
          memUsed: s.mem.used, memTotal: s.mem.total, memPercent: s.mem.usedPercent,
          commitUsed: s.mem.commitTotal, commitLim: s.mem.commitLimit,
          gpu: s.gpu.usedPercent, byEngine: s.gpu.byEngine, adapterName: s.gpu.adapterName,
          vramDedUsed: s.gpu.vramDedicatedUsed, vramDedTotal: s.gpu.vramDedicatedTotal,
          vramShrUsed: s.gpu.vramSharedUsed, vramShrTotal: s.gpu.vramSharedTotal,
          netRecvBps: s.net.recvBps, netSentBps: s.net.sentBps,
          diskReadBps: s.disks.reduce((a, d) => a + d.readBps, 0),
          diskWriteBps: s.disks.reduce((a, d) => a + d.writeBps, 0),
          diskActive: s.disks.reduce((a, d) => Math.max(a, d.activePercent), 0),
        })
        if (histRef.current.length > MAX_POINTS) histRef.current = histRef.current.slice(-MAX_POINTS)
        dirtyRef.current = true
      }
      if (document.hidden) return // 失焦/隐藏时暂停 UI 渲染
      setSample(s)
      if (dirtyRef.current) flushHistory()
    })
    return () => { disposed = true; unsub?.() }
  }, [flushHistory])

  // 失焦降频：隐藏 → 5s；恢复 → 用户间隔，并补齐历史
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) driver.setThrottled(true)
      else { driver.setThrottled(false); flushHistory() }
    }
    const onBlur = () => driver.setThrottled(true)
    const onFocus = () => { driver.setThrottled(false); flushHistory() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [flushHistory])

  const applyInterval = (ms: number) => {
    setIntervalMs(ms)
    driver.setInterval(ms)
  }
  const applyOnTop = (on: boolean) => {
    setAlwaysOnTop(on)
    driver.setAlwaysOnTop(on)
  }
  const applyUnits = (storage: StorageUnit, net: NetUnit) => {
    const next: Prefs = { ...prefsRef.current, storage, net }
    prefsRef.current = next
    setPrefs(next)
    driver.setUnits(storage, net)
  }
  const applyTheme = (theme: MapTheme) => {
    const next: Prefs = { ...prefsRef.current, theme }
    prefsRef.current = next
    setPrefs(next)
    driver.setMapTheme(theme)
  }
  const applyMode = (mode: UiMode) => {
    const next: Prefs = { ...prefsRef.current, mode }
    prefsRef.current = next
    setPrefs(next)
    driver.setUiTheme(mode)
  }

  // 明暗主题：同步到 body 类，CSS 变量整体切换
  useEffect(() => {
    document.body.classList.toggle('light', prefs.mode === 'light')
  }, [prefs.mode])

  // 卡片磨砂程度：写入全局 CSS 变量
  useEffect(() => {
    document.documentElement.style.setProperty('--blur', prefs.blur + 'px')
  }, [prefs.blur])

  const applyBgMode = (mode: BgMode) => {
    if (mode === 'image') { void pickWallpaper(); return }
    const next: Prefs = { ...prefsRef.current, bgMode: mode }
    prefsRef.current = next
    setPrefs(next)
    driver.setBgMode(mode)
  }
  const applyBlur = (px: number) => {
    const next: Prefs = { ...prefsRef.current, blur: px }
    prefsRef.current = next
    setPrefs(next)
    driver.setBlur(px)
  }
  const pickWallpaper = async () => {
    const data = await driver.selectWallpaper()
    if (!data) return
    const next: Prefs = { ...prefsRef.current, bgMode: 'image' }
    prefsRef.current = next
    setPrefs(next)
    setWallpaper(data)
  }
  const clearWallpaper = () => {
    const next: Prefs = { ...prefsRef.current, bgMode: 'solid' }
    prefsRef.current = next
    setPrefs(next)
    setWallpaper('')
    driver.clearWallpaper()
  }

  const procs: ProcessInfo[] = sample?.processes ?? []
  const intervalLabel = intervalMs >= 1000 ? `${intervalMs / 1000}s` : `${intervalMs}ms`

  return (
    <PrefsProvider value={prefs}>
      <div className="app">
        {prefs.bgMode === 'aurora' && <div className="aurora"><i /><i /><i /></div>}
      {prefs.bgMode === 'image' && wallpaper && <div className="wallpaper" style={{ backgroundImage: `url(${wallpaper})` }} />}
        <header className="topbar">
          <div className="brand">Moni <small>LIQUID MONITOR</small></div>
          <span className="spacer" />
          <nav className="seg">
            {VIEWS.map(v =>
              <button key={v.key} className={view === v.key ? 'on' : ''} onClick={() => setView(v.key)}>{v.label}</button>)}
          </nav>
          <span className="spacer" />
          <button className="iconbtn" title="设置" onClick={() => setSettingsOpen(true)}>⚙</button>
        </header>

        <main className="main">
          <div key={view} className="view-anim">
            {view === 'dash' && <Dashboard s={sample} history={history} />}
            {view === 'charts' && <Charts history={history} />}
            {view === 'tree' && <ProcessTree processes={procs} />}
            {view === 'map' && <Treemap processes={procs} onTheme={applyTheme} />}
            {view === 'host' && <Host />}
          </div>
        </main>

        <footer className="statusbar">
          <span className={'dot' + (sample?.warmup ? ' warm' : '')} />
          <span>采集 <b>{intervalLabel}</b></span>
          {sample && <span>自耗 <b>{sample.collectMs.toFixed(1)}ms</b></span>}
          {sample && <span><b>{sample.processes.length}</b> 进程</span>}
          {sample && sample.self.pid > 0 &&
            <span>Moni <b>{sample.self.cpuNorm.toFixed(1)}%</b> · <b>{fmtStorage(sample.self.memWs, 'auto')}</b></span>}
          {sample && <span>{sample.gpu.adapterName}</span>}
          {sample && sample.warmup && <span style={{ color: '#fbbf24' }}>首轮预热中…</span>}
        </footer>

        {settingsOpen && (
          <div className="modal-mask" onClick={() => setSettingsOpen(false)}>
            <div className="modal glass" onClick={e => e.stopPropagation()}>
              <h3>设置</h3>
              <div className="sub">配置保存于 %APPDATA%\Moni\config.json</div>
              <div className="set-row">
                <div className="lab">采集频率<small>越快越流畅，占用略高</small></div>
                <div className="chips">
                  {[500, 1000, 2000, 5000].map(ms =>
                    <button key={ms} className={'chip' + (intervalMs === ms ? ' on' : '')}
                      onClick={() => applyInterval(ms)}>{ms >= 1000 ? ms / 1000 + 's' : ms + 'ms'}</button>)}
                </div>
              </div>
              <div className="set-row">
                <div className="lab">主题<small>暗色 / 浅色界面</small></div>
                <div className="chips">
                  {MODE_LABELS.map(m =>
                    <button key={m.key} className={'chip' + (prefs.mode === m.key ? ' on' : '')}
                      onClick={() => applyMode(m.key)}>{m.label}</button>)}
                </div>
              </div>
              <div className="set-row">
                <div className="lab">背景<small>纯色为默认；氛围光为动态光斑</small></div>
                <div className="chips">
                  {BG_LABELS.map(b =>
                    <button key={b.key} className={'chip' + (prefs.bgMode === b.key ? ' on' : '')}
                      onClick={() => applyBgMode(b.key)}>{b.label}</button>)}
                </div>
              </div>
              {prefs.bgMode === 'image' &&
                <div className="set-row">
                  <div className="lab">壁纸图片<small>已启用自定义壁纸</small></div>
                  <div className="chips">
                    <button className="chip" onClick={() => void pickWallpaper()}>更换图片…</button>
                    <button className="chip" onClick={clearWallpaper}>清除</button>
                  </div>
                </div>}
              <div className="set-row">
                <div className="lab">磨砂程度<small>卡片玻璃模糊半径 {prefs.blur}px</small></div>
                <input type="range" min={0} max={40} step={2} value={prefs.blur}
                  onChange={e => applyBlur(+e.target.value)} className="slider" />
              </div>
              <div className="set-row">
                <div className="lab">存储单位<small>容量类数值（内存/显存）</small></div>
                <div className="chips">
                  {STORAGE_LABELS.map(u =>
                    <button key={u.key} className={'chip' + (prefs.storage === u.key ? ' on' : '')}
                      onClick={() => applyUnits(u.key, prefs.net)}>{u.label}</button>)}
                </div>
              </div>
              <div className="set-row">
                <div className="lab">网络单位<small>速率类数值（网络/磁盘）</small></div>
                <div className="chips">
                  {NET_LABELS.map(u =>
                    <button key={u.key} className={'chip' + (prefs.net === u.key ? ' on' : '')}
                      onClick={() => applyUnits(prefs.storage, u.key)}>{u.label}</button>)}
                </div>
              </div>
              <div className="set-row">
                <div className="lab">窗口置顶<small>始终浮在其他窗口之上</small></div>
                <button className={'switch' + (alwaysOnTop ? ' on' : '')} onClick={() => applyOnTop(!alwaysOnTop)}><i /></button>
              </div>
              <div className="set-row">
                <div className="lab">失焦降频<small>窗口失焦或最小化时自动降为 5s</small></div>
                <span style={{ fontSize: 11.5, color: 'var(--txt-2)' }}>已启用</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </PrefsProvider>
  )
}
