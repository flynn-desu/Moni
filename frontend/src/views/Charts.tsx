import { useEffect, useMemo, useRef, useState } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { Point } from '../types'
import { fmtNet, fmtNetAxis, fmtStorage } from '../format'
import { usePrefs } from '../prefs'

export const ACC = {
  cpu: '#7cc4ff', mem: '#b3a4ff', gpu: '#5eead4',
  vram: '#f0abfc', disk: '#fcd34d', net: '#7dd3fc',
}

// 主题感知色板：深色主题用粉彩（与 CSS --acc-* 一致），
// 浅色主题换更深的同系色，避免曲线/数值在白玻璃上看不清
function themeAcc(light: boolean) {
  return light
    ? { cpu: '#3b82f6', mem: '#8b5cf6', gpu: '#14b8a6', vram: '#d946ef',
        disk: '#d97706', disk2: '#b45309', net: '#0284c7', net2: '#0369a1' }
    : { cpu: '#7cc4ff', mem: '#b3a4ff', gpu: '#5eead4', vram: '#f0abfc',
        disk: '#fcd34d', disk2: '#f59e0b', net: '#7dd3fc', net2: '#38bdf8' }
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

type Aligned = [number[], ...number[][]]

/** 渐变填充工厂：曲线下方半透明渐变 */
function gradFill(hex: string) {
  return (u: uPlot): string | CanvasGradient => {
    const g = u.ctx.createLinearGradient(0, u.bbox.top, 0, u.bbox.top + u.bbox.height)
    g.addColorStop(0, rgba(hex, 0.28))
    g.addColorStop(1, rgba(hex, 0.01))
    return g
  }
}

function baseOpts(w: number, h: number, series: uPlot.Series[], yFmt: (v: number) => string, fixedRange: boolean, light: boolean): uPlot.Options {
  const axisStroke = light ? 'rgba(15,23,42,0.5)' : 'rgba(255,255,255,0.3)'
  const gridStroke = light ? 'rgba(15,23,42,0.07)' : 'rgba(255,255,255,0.05)'
  return {
    width: w, height: h,
    legend: { show: false },
    cursor: { show: false },
    axes: [
      { show: false }, // x 轴（uPlot axes[0] = X）
      {
        show: true, stroke: axisStroke, size: 42,
        grid: { stroke: gridStroke }, ticks: { show: false },
        font: '9.5px "Segoe UI", sans-serif',
        values: (u: uPlot, splits: number[]) => splits.map(v => yFmt(v)),
        space: 34,
      },
    ],
    scales: { y: fixedRange ? { range: [0, 100] } : { range: [0, null] } },
    series,
  }
}

interface CardProps {
  title: string
  color: string
  color2?: string
  display: string
  data: Aligned
  yFmt: (v: number) => string
  fixedRange: boolean
}

function ChartCard({ title, color, color2, display, data, yFmt, fixedRange }: CardProps) {
  const prefs = usePrefs()
  const light = prefs.mode === 'light'
  const bodyRef = useRef<HTMLDivElement>(null)
  const upRef = useRef<uPlot | null>(null)

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const series: uPlot.Series[] = [
      {},
      { stroke: color, width: 1.6, fill: gradFill(color), points: { show: false } },
    ]
    if (color2) series.push({ stroke: color2, width: 1.3, fill: gradFill(color2), points: { show: false } })
    const u = new uPlot(baseOpts(el.clientWidth || 300, el.clientHeight || 120, series, yFmt, fixedRange, light), data, el)
    upRef.current = u
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) u.setSize({ width: el.clientWidth, height: el.clientHeight })
    })
    ro.observe(el)
    return () => { ro.disconnect(); u.destroy(); upRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, color2, fixedRange, light])

  useEffect(() => { upRef.current?.setData(data) }, [data])

  return (
    <div className="chart-card glass">
      <div className="chart-head">
        <span className="chart-title">{title}</span>
        <span className="spacer" />
        <span className="chart-val" style={{ color }}>{display}</span>
      </div>
      <div className="chart-body" ref={bodyRef} />
    </div>
  )
}

export function Charts({ history }: { history: Point[] }) {
  const prefs = usePrefs()
  const light = prefs.mode === 'light'
  const acc = useMemo(() => themeAcc(light), [light])
  const [win, setWin] = useState<60 | 300>(60)
  const [engine, setEngine] = useState<string>('__all')

  const pts = useMemo(() => history.slice(-win), [history, win])

  const engines = useMemo(() => {
    const set = new Set<string>()
    for (const p of history.slice(-300)) for (const k of Object.keys(p.byEngine)) set.add(k)
    return [...set].sort()
  }, [history])

  const xs = useMemo(() => pts.map(p => p.ts / 1000), [pts])

  const latest = pts[pts.length - 1]

  const cpuData = useMemo<Aligned>(() => [xs, pts.map(p => p.cpu)], [xs, pts])
  const memData = useMemo<Aligned>(() => [xs, pts.map(p => p.memPercent)], [xs, pts])
  const gpuData = useMemo<Aligned>(() => [xs, pts.map(p =>
    engine === '__all' ? p.gpu : (p.byEngine[engine] ?? 0))], [xs, pts, engine])
  const vramData = useMemo<Aligned>(() => [xs, pts.map(p => p.vramDedTotal > 0 ? p.vramDedUsed / p.vramDedTotal * 100 : 0)], [xs, pts])
  const diskData = useMemo<Aligned>(() => [xs, pts.map(p => p.diskReadBps), pts.map(p => p.diskWriteBps)], [xs, pts])
  const netData = useMemo<Aligned>(() => [xs, pts.map(p => p.netRecvBps), pts.map(p => p.netSentBps)], [xs, pts])

  const pctFmt = (v: number) => v.toFixed(0) + '%'

  return (
    <div className="view charts-col">
      <div className="charts-head">
        <div className="seg">
          <button className={win === 60 ? 'on' : ''} onClick={() => setWin(60)}>1 分钟</button>
          <button className={win === 300 ? 'on' : ''} onClick={() => setWin(300)}>5 分钟</button>
        </div>
        {engines.length > 0 &&
          <>
            <span style={{ fontSize: 11.5, color: 'var(--txt-2)', marginLeft: 6 }}>GPU</span>
            <EngineChips engines={engines} value={engine} onChange={setEngine} />
          </>}
        <span className="spacer" />
        {latest && <span style={{ fontSize: 11.5, color: 'var(--txt-2)' }}>采样 {pts.length} 点</span>}
      </div>
      <div className="charts-grid">
        <ChartCard title="CPU" color={acc.cpu} display={latest ? latest.cpu.toFixed(1) + '%' : '-'}
          data={cpuData} yFmt={pctFmt} fixedRange={true} />
        <ChartCard title="内存" color={acc.mem}
          display={latest ? latest.memPercent.toFixed(1) + '% · ' + fmtStorage(latest.memUsed, prefs.storage) + ' / ' + fmtStorage(latest.memTotal, prefs.storage) : '-'}
          data={memData} yFmt={pctFmt} fixedRange={true} />
        <ChartCard title="GPU" color={acc.gpu}
          display={latest ? (engine === '__all' ? latest.gpu.toFixed(1) : (latest.byEngine[engine] ?? 0).toFixed(1)) + '%' : '-'}
          data={gpuData} yFmt={pctFmt} fixedRange={true} />
        <ChartCard key={'vram-' + prefs.storage} title="显存（专用）" color={acc.vram}
          display={latest ? fmtStorage(latest.vramDedUsed, prefs.storage) + ' / ' + fmtStorage(latest.vramDedTotal, prefs.storage) : '-'}
          data={vramData} yFmt={pctFmt} fixedRange={true} />
        <ChartCard key={'disk-' + prefs.net} title="磁盘（读/写）" color={acc.disk} color2={acc.disk2}
          display={latest ? fmtNet(latest.diskReadBps + latest.diskWriteBps, prefs.net) : '-'}
          data={diskData} yFmt={(v: number) => fmtNetAxis(v, prefs.net)} fixedRange={false} />
        <ChartCard key={'net-' + prefs.net} title="网络（收/发）" color={acc.net} color2={acc.net2}
          display={latest ? fmtNet(latest.netRecvBps, prefs.net) : '-'}
          data={netData} yFmt={(v: number) => fmtNetAxis(v, prefs.net)} fixedRange={false} />
      </div>
    </div>
  )
}

// GPU 引擎芯片
export function EngineChips({ engines, value, onChange }: { engines: string[]; value: string; onChange: (v: string) => void }) {
  if (engines.length === 0) return null
  return (
    <div className="chips">
      <button className={'chip' + (value === '__all' ? ' on' : '')} onClick={() => onChange('__all')}>整体</button>
      {engines.map(e =>
        <button key={e} className={'chip' + (value === e ? ' on' : '')} onClick={() => onChange(e)}>{e}</button>)}
    </div>
  )
}
