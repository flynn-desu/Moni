import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProcessInfo } from '../types'
import { buildForest, nodeVal, type Agg, type ProcNode, type SortKey } from '../tree'
import { fmtNet, fmtStorage } from '../format'
import { usePrefs } from '../prefs'

interface Row { p: ProcessInfo; a: Agg; depth: number; kidCount: number }

const ROW_H = 34
const COLS: { key: SortKey; label: string; title?: string }[] = [
  { key: 'cpu', label: 'CPU %' },
  { key: 'mem', label: '内存' },
  { key: 'gpu', label: 'GPU %' },
  { key: 'vram', label: '显存' },
  { key: 'disk', label: 'I/O', title: '读写 I/O 字节速率（进程 IO 计数口径，含共享内存/管道等非磁盘写入，浏览器类进程会明显偏高）' },
]

function hashColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return `hsl(${Math.abs(h) % 360} 65% 62%)`
}

export function ProcessTree({ processes }: { processes: ProcessInfo[] }) {
  const prefs = usePrefs()
  const [sortKey, setSortKey] = useState<SortKey>('cpu')
  const [sortAsc, setSortAsc] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [scrollTop, setScrollTop] = useState(0)
  const [viewH, setViewH] = useState(400)
  const [paused, setPaused] = useState(false)
  const frozenRef = useRef<ProcessInfo[] | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const togglePause = () => {
    if (!paused) frozenRef.current = processes // 冻结当前快照
    setPaused(p => !p)
  }
  const dataSource = paused && frozenRef.current ? frozenRef.current : processes

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewH(el.clientHeight))
    ro.observe(el)
    setViewH(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const rows = useMemo(() => {
    const forest = buildForest(processes)
    const rows: Row[] = []
    const walk = (list: ProcNode[], depth: number) => {
      const sorted = [...list].sort((x, y) =>
        sortAsc ? nodeVal(x, sortKey) - nodeVal(y, sortKey) : nodeVal(y, sortKey) - nodeVal(x, sortKey))
      for (const n of sorted) {
        rows.push({ p: n.p, a: n.agg, depth, kidCount: n.kids.length })
        if (expanded.has(n.p.pid)) walk(n.kids, depth + 1)
      }
    }
    walk(forest, 0)
    return rows
  }, [dataSource, sortKey, sortAsc, expanded])

  // 各列最大值（进度条基准）
  const maxes = useMemo(() => {
    const m: Record<SortKey, number> = { cpu: 1e-9, mem: 1e-9, gpu: 1e-9, vram: 1e-9, disk: 1e-9 }
    for (const r of rows) {
      m.cpu = Math.max(m.cpu, r.a.cpu / 12)
      m.mem = Math.max(m.mem, r.a.mem)
      m.gpu = Math.max(m.gpu, r.a.gpu)
      m.vram = Math.max(m.vram, r.a.vram)
      m.disk = Math.max(m.disk, r.a.disk)
    }
    return m
  }, [rows])

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 5)
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW_H) + 5)
  const slice = rows.slice(start, end)

  const toggle = (pid: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid)
      else next.add(pid)
      return next
    })
  }

  return (
    <div className="view tree-panel glass">
      <div className="tree-toolbar">
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--txt-1)' }}>进程</span>
        <span style={{ fontSize: 11, color: 'var(--txt-2)' }}>{dataSource.length} 个进程 · 显示 {rows.length} 行</span>
        {paused && <span style={{ fontSize: 11, color: '#fbbf24' }}>⏸ 已暂停 · 数据已冻结</span>}
        <span className="spacer" />
        <span style={{ fontSize: 11, color: 'var(--txt-2)' }}>点击 ▸ 展开子进程 · 列头排序 · 双击行展开</span>
        <button className={'chip' + (paused ? ' on' : '')} onClick={togglePause} title="冻结当前列表，方便查看某个进程">
          {paused ? '▶ 继续' : '⏸ 暂停'}
        </button>
      </div>
      <div className="tree-head">
        <div className="h on">名称</div>
        {COLS.map(c =>
          <div key={c.key}
            className={'h' + (sortKey === c.key ? ' on' : '')}
            title={c.title}
            onClick={() => { if (sortKey === c.key) setSortAsc(v => !v); else { setSortKey(c.key); setSortAsc(false) } }}>
            {c.label}{sortKey === c.key ? (sortAsc ? ' ↑' : ' ↓') : ''}
          </div>)}
      </div>
      <div className="tree-body" ref={bodyRef} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
        <div style={{ height: rows.length * ROW_H, position: 'relative' }}>
          {slice.map((r, i) => {
            const top = (start + i) * ROW_H
            const hasKids = r.kidCount > 0
            const rowVal = sortKey === 'cpu' ? r.a.cpu / 12 : r.a[sortKey]
            const barW = rowVal / maxes[sortKey] * 100
            return (
              <div key={r.p.pid} className="trow" style={{ top, height: ROW_H, position: 'absolute', right: 0, left: 0 }}
                onDoubleClick={() => hasKids && toggle(r.p.pid)}>
                <div className="name" style={{ paddingLeft: r.depth * 18 }}>
                  <span className={'twisty' + (expanded.has(r.p.pid) ? ' open' : '') + (hasKids ? '' : ' leaf')}
                    onClick={() => hasKids && toggle(r.p.pid)}>▶</span>
                  <span className="pdot" style={{ background: hashColor(r.p.name) }} />
                  <span className="nm" title={`${r.p.name} (${r.p.pid})`}>{r.p.name}</span>
                  {hasKids && <span className="cnt">({r.kidCount})</span>}
                  <span className="pid">{r.p.pid}</span>
                </div>
                <div className="num">{(r.a.cpu / 12).toFixed(1)}%
                  {sortKey === 'cpu' && <span className="bar"><i style={{ width: Math.min(100, barW) + '%' }} /></span>}
                </div>
                <div className="num">{fmtStorage(r.a.mem, prefs.storage)}
                  {sortKey === 'mem' && <span className="bar"><i style={{ width: Math.min(100, barW) + '%' }} /></span>}
                </div>
                <div className="num">{r.a.gpu > 0.05 ? r.a.gpu.toFixed(1) + '%' : '—'}
                  {sortKey === 'gpu' && <span className="bar"><i style={{ width: Math.min(100, barW) + '%' }} /></span>}
                </div>
                <div className="num">{r.a.vram > 0 ? fmtStorage(r.a.vram, prefs.storage) : '—'}
                  {sortKey === 'vram' && <span className="bar"><i style={{ width: Math.min(100, barW) + '%' }} /></span>}
                </div>
                <div className="num">{r.a.disk > 1 ? fmtNet(r.a.disk, prefs.net) : '—'}
                  {sortKey === 'disk' && <span className="bar"><i style={{ width: Math.min(100, barW) + '%' }} /></span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
