import { useCallback, useEffect, useRef, useState } from 'react'
import type { Point, ProcessInfo, Sample, HostInfo } from './types'
import type { BgMode, MapTheme, NetUnit, StorageUnit, UiMode } from './format'
import { PrefsProvider, BG_LABELS, MODE_LABELS, NET_LABELS, STORAGE_LABELS, type Prefs } from './prefs'
import { fmtStorage } from './format'
import type { Pin } from './tree'
import { winClose, winIsMaximised, winMinimise, winToggleMaximise } from './win'
import { IconWinClose, IconWinMax, IconWinMin, IconWinRestore } from './components/icons'
import logoUrl from './assets/logo.jpg'
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
  const [setSearch, setSetSearch] = useState('') // 设置弹窗内的选项搜索
  // 进程钉选：放在 App 层，切换视图后仍保留（仅本次运行内有效）
  const [pins, setPins] = useState<Pin[]>([])
  // 无边框窗口：最大化状态跟踪（窗口 resize 时刷新，切换 □/还原 图标）
  const [isMax, setIsMax] = useState(false)
  const [closeAction, setCloseAction] = useState<'exit' | 'minimise'>('exit')
  const [glass3d, setGlass3d] = useState(false)
  const [showLogo, setShowLogo] = useState(true)
  const [host, setHost] = useState<HostInfo | null>(null)
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
      setCloseAction(c.closeAction)
      setGlass3d(c.glass3d)
      setShowLogo(c.showLogo)
      setPrefs({ mode: c.uiTheme, bgMode: c.bgMode, blur: c.blur, storage: c.storageUnit, net: c.netUnit, theme: c.mapTheme })
      if (c.alwaysOnTop) driver.setAlwaysOnTop(true)
    })
    driver.getWallpaperData().then(w => { if (!disposed) setWallpaper(w) })
    driver.getHostInfo().then(h => { if (!disposed) setHost(h) })
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
  const applyCloseAction = (a: 'exit' | 'minimise') => {
    setCloseAction(a)
    void driver.setCloseAction(a)
  }
  const applyGlass3D = (on: boolean) => {
    setGlass3d(on)
    void driver.setGlass3d(on)
  }
  const applyShowLogo = (on: boolean) => {
    setShowLogo(on)
    void driver.setShowLogo(on)
  }

  // 最大化/还原：点击切换后刷新图标（resize 防抖兜底）
  const refreshMax = useCallback(() => {
    void winIsMaximised().then(setIsMax)
  }, [])
  useEffect(() => {
    refreshMax()
    let t: number | undefined
    const onResize = () => {
      window.clearTimeout(t)
      t = window.setTimeout(refreshMax, 150)
    }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); window.clearTimeout(t) }
  }, [refreshMax])
  const toggleMax = () => {
    void winToggleMaximise().then(() => setTimeout(refreshMax, 80))
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

  // 玻璃卡片立体感：body 类驱动整套内阴影样式
  useEffect(() => {
    document.body.classList.toggle('glass3d', glass3d)
  }, [glass3d])

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

  // 设置弹窗：分组数据（搜索时按分组名/标签/说明过滤）
  const setSections = [
    {
      title: '外观', rows: [
        { key: 'theme', label: '主题', sub: '暗色 / 浅色界面', el: (<div className="chips">{MODE_LABELS.map(m =>
          <button key={m.key} className={'chip' + (prefs.mode === m.key ? ' on' : '')} onClick={() => applyMode(m.key)}>{m.label}</button>)}</div>) },
        { key: 'bg', label: '背景', sub: '纯色为默认；氛围光为动态光斑', el: (<div className="chips">{BG_LABELS.map(b =>
          <button key={b.key} className={'chip' + (prefs.bgMode === b.key ? ' on' : '')} onClick={() => applyBgMode(b.key)}>{b.label}</button>)}</div>) },
        ...(prefs.bgMode === 'image' ? [{ key: 'wallpaper', label: '壁纸图片', sub: '已启用自定义壁纸', el: (<div className="chips">
          <button className="chip" onClick={() => void pickWallpaper()}>更换图片…</button>
          <button className="chip" onClick={clearWallpaper}>清除</button></div>) }] : []),
        { key: 'blur', label: '磨砂程度', sub: `卡片玻璃模糊半径 ${prefs.blur}px · 纯色背景下差异不明显，氛围光/壁纸下显著`, el: (<div className="blur-ctl">
          <button className="stepbtn" title="减小 1px" onClick={() => applyBlur(Math.max(0, prefs.blur - 1))}>−</button>
          <input type="range" min={0} max={40} step={1} value={prefs.blur}
            onChange={e => applyBlur(+e.target.value)} className="slider" />
          <button className="stepbtn" title="增大 1px" onClick={() => applyBlur(Math.min(40, prefs.blur + 1))}>＋</button></div>) },
        { key: 'glass3d', label: '立体感', sub: '玻璃卡片的厚度与折射高光', el: (<button className={'switch' + (glass3d ? ' on' : '')} onClick={() => applyGlass3D(!glass3d)}><i /></button>) },
        { key: 'logo', label: '左上角 Logo', sub: '标题栏左侧的品牌图标', el: (<button className={'switch' + (showLogo ? ' on' : '')} onClick={() => applyShowLogo(!showLogo)}><i /></button>) },
      ],
    },
    {
      title: '采集', rows: [
        { key: 'interval', label: '采集频率', sub: '越快越流畅，占用略高', el: (<div className="chips">{[500, 1000, 2000, 5000].map(ms =>
          <button key={ms} className={'chip' + (intervalMs === ms ? ' on' : '')} onClick={() => applyInterval(ms)}>{ms >= 1000 ? ms / 1000 + 's' : ms + 'ms'}</button>)}</div>) },
        { key: 'throttle', label: '失焦降频', sub: '窗口失焦或最小化时自动降为 5s', el: (<span style={{ fontSize: 11.5, color: 'var(--txt-2)' }}>已启用</span>) },
      ],
    },
    {
      title: '单位', rows: [
        { key: 'storage', label: '存储单位', sub: '容量类数值（内存/显存）', el: (<div className="chips">{STORAGE_LABELS.map(u =>
          <button key={u.key} className={'chip' + (prefs.storage === u.key ? ' on' : '')} onClick={() => applyUnits(u.key, prefs.net)}>{u.label}</button>)}</div>) },
        { key: 'net', label: '网络单位', sub: '速率类数值（网络/磁盘）', el: (<div className="chips">{NET_LABELS.map(u =>
          <button key={u.key} className={'chip' + (prefs.net === u.key ? ' on' : '')} onClick={() => applyUnits(prefs.storage, u.key)}>{u.label}</button>)}</div>) },
      ],
    },
    {
      title: '窗口', rows: [
        { key: 'ontop', label: '窗口置顶', sub: '始终浮在其他窗口之上', el: (<button className={'switch' + (alwaysOnTop ? ' on' : '')} onClick={() => applyOnTop(!alwaysOnTop)}><i /></button>) },
        { key: 'close', label: '关闭按钮', sub: '点击右上角 ✕ 时的行为', el: (<div className="chips">
          <button className={'chip' + (closeAction === 'exit' ? ' on' : '')} onClick={() => applyCloseAction('exit')}>退出程序</button>
          <button className={'chip' + (closeAction === 'minimise' ? ' on' : '')} onClick={() => applyCloseAction('minimise')}>最小化到任务栏</button></div>) },
      ],
    },
  ]
  const sq = setSearch.trim().toLowerCase()
  const visibleSections = setSections
    .map(s => ({ ...s, rows: s.rows.filter(r =>
      !sq || s.title.toLowerCase().includes(sq) || r.label.toLowerCase().includes(sq) || (r.sub ?? '').toLowerCase().includes(sq)) }))
    .filter(s => s.rows.length > 0)

  return (
    <PrefsProvider value={prefs}>
      <div className="app">
        {prefs.bgMode === 'aurora' && <div className="aurora"><i /><i /><i /></div>}
      {prefs.bgMode === 'image' && wallpaper && <div className="wallpaper" style={{ backgroundImage: `url(${wallpaper})` }} />}
        <header className="topbar">
          {showLogo && <img className="brand-logo" src={logoUrl} alt="Moni" title="Moni" draggable={false} />}
          <span className="spacer" />
          <nav className="seg">
            {VIEWS.map(v =>
              <button key={v.key} className={view === v.key ? 'on' : ''} onClick={() => setView(v.key)}>{v.label}</button>)}
          </nav>
          <span className="spacer" />
          <button className="iconbtn" title="设置" onClick={() => setSettingsOpen(true)}>⚙</button>
          <div className="win-controls">
            <button className="winbtn min" title="最小化" onClick={() => void winMinimise()}><IconWinMin /></button>
            <button className="winbtn max" title={isMax ? '向下还原' : '最大化'} onClick={toggleMax}>
              {isMax ? <IconWinRestore /> : <IconWinMax />}
            </button>
            <button className="winbtn close" title={closeAction === 'exit' ? '关闭程序' : '关闭（最小化到任务栏）'}
              onClick={() => void winClose(closeAction)}><IconWinClose /></button>
          </div>
        </header>

        <main className="main">
          <div key={view} className="view-anim">
            {view === 'dash' && <Dashboard s={sample} history={history} />}
            {view === 'charts' && <Charts history={history} />}
            {view === 'tree' && <ProcessTree processes={procs} pins={pins} onPins={setPins} />}
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
          {host?.appVersion && <span title={`Moni ${host.appVersion}`}><b>{host.appVersion}</b></span>}
          {sample && sample.warmup && <span style={{ color: '#fbbf24' }}>首轮预热中…</span>}
        </footer>

        {settingsOpen && (
          <div className="modal-mask" onClick={() => { setSettingsOpen(false); setSetSearch('') }}>
            <div className="modal glass" onClick={e => e.stopPropagation()}>
              <h3>设置</h3>
              <div className="sub">配置保存于 %APPDATA%\Moni\config.json</div>
              <div className="tsearch set-search">
                <svg className="tsearch-ico" width={12} height={12} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-4-4" />
                </svg>
                <input value={setSearch} onChange={e => setSetSearch(e.target.value)}
                  placeholder="搜索设置（如：主题 / 壁纸 / 单位）" spellCheck={false} />
                {setSearch && <button className="tclear" title="清除" onClick={() => setSetSearch('')}>✕</button>}
              </div>
              {visibleSections.length === 0 && <div className="set-none">没有匹配的设置项</div>}
              {visibleSections.map(s => (
                <div className="set-group" key={s.title}>
                  <div className="set-sec">{s.title}</div>
                  {s.rows.map(r => (
                    <div className="set-row" key={r.key}>
                      <div className="lab">{r.label}{r.sub && <small>{r.sub}</small>}</div>
                      {r.el}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PrefsProvider>
  )
}
