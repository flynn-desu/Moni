import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProcessInfo } from '../types'
import { aggOf, buildForest, type Agg, type Pin, type ProcNode, type SortKey } from '../tree'
import { fmtNet, fmtStorage } from '../format'
import { usePrefs } from '../prefs'
import { IconPin } from '../components/icons'

interface Row { p: ProcessInfo; a: Agg; depth: number; kidCount: number; search?: boolean }

const ROW_H = 34
const COLS: { key: SortKey; label: string; title?: string }[] = [
  { key: 'cpu', label: 'CPU %' },
  { key: 'mem', label: '内存', title: '私有工作集（任务管理器"内存"列口径）。全机"已用物理内存"还包含各进程共享的内存与内核占用，所以全部进程相加会小于仪表盘数值' },
  { key: 'gpu', label: 'GPU %' },
  { key: 'vram', label: '显存' },
  { key: 'disk', label: 'I/O', title: '读写 I/O 字节速率（进程 IO 计数口径，含共享内存/管道等非磁盘写入，浏览器类进程会明显偏高）' },
]

function hashColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return `hsl(${Math.abs(h) % 360} 65% 62%)`
}

export function ProcessTree({ processes, pins, onPins }: {
  processes: ProcessInfo[]
  pins: Pin[]
  onPins: (pins: Pin[]) => void
}) {
  const prefs = usePrefs()
  const [sortKey, setSortKey] = useState<SortKey>('cpu')
  const [sortAsc, setSortAsc] = useState(false)
  // 钉选卡独立排序：null = 手动顺序（▲▼），点钉选卡列头则按该列排
  const [pinSort, setPinSort] = useState<{ key: SortKey; asc: boolean } | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [scrollTop, setScrollTop] = useState(0)
  const [viewH, setViewH] = useState(400)
  const [paused, setPaused] = useState(false)
  const [query, setQuery] = useState('')
  const frozenRef = useRef<ProcessInfo[] | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const togglePause = () => {
    if (!paused) frozenRef.current = processes // 冻结当前快照
    setPaused(p => !p)
  }
  const dataSource = paused && frozenRef.current ? frozenRef.current : processes
  const q = query.trim().toLowerCase()
  const pinnedSet = useMemo(() => new Set(pins.map(x => x.pid)), [pins])

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewH(el.clientHeight))
    ro.observe(el)
    setViewH(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const forest = useMemo(() => buildForest(dataSource, pinnedSet), [dataSource, pinnedSet])

  const rows = useMemo(() => {
    const rows: Row[] = []
    if (q) {
      // 搜索模式：与树形展示同口径——只显示最上层的命中节点（祖先已命中时子进程
      // 收起，与树里折叠一致），值用聚合口径（自身 + 全部子孙）；PID 搜索可直达深层。
      // 钉选行本身不重复列出，其子树仍可被搜到。
      const hit: ProcNode[] = []
      const collect = (list: ProcNode[], underMatch: boolean) => {
        for (const n of list) {
          const self = !pinnedSet.has(n.p.pid) &&
            (n.p.name.toLowerCase().includes(q) || String(n.p.pid).includes(q))
          if (self && !underMatch) hit.push(n)
          collect(n.kids, underMatch || self)
        }
      }
      collect(forest.roots, false)
      collect(forest.detached, false)
      hit.sort((x, y) => sortAsc ? x.agg[sortKey] - y.agg[sortKey] : y.agg[sortKey] - x.agg[sortKey])
      for (const n of hit) rows.push({ p: n.p, a: n.agg, depth: 0, kidCount: n.kids.length, search: true })
    } else {
      const walk = (list: ProcNode[], depth: number) => {
        const sorted = [...list].sort((x, y) =>
          sortAsc ? x.agg[sortKey] - y.agg[sortKey] : y.agg[sortKey] - x.agg[sortKey])
        for (const n of sorted) {
          rows.push({ p: n.p, a: n.agg, depth, kidCount: n.kids.length })
          if (expanded.has(n.p.pid)) walk(n.kids, depth + 1)
        }
      }
      walk(forest.roots, 0)
    }
    return rows
  }, [forest, q, sortKey, sortAsc, expanded, pinnedSet])

  // 钉选行：手动模式下按用户钉选顺序；排序模式下按钉选卡自己的排序，幽灵行沉底
  const pinnedRows = useMemo(() => {
    const list = pins.map(pin => ({ pin, node: forest.detached.find(n => n.p.pid === pin.pid) ?? null }))
    if (pinSort) {
      const { key, asc } = pinSort
      list.sort((a, b) => {
        const nx = a.node
        const ny = b.node
        if (!nx || !ny) return nx ? -1 : ny ? 1 : 0 // 幽灵行沉底
        return asc ? nx.agg[key] - ny.agg[key] : ny.agg[key] - nx.agg[key]
      })
    }
    return list
  }, [pins, forest, pinSort])

  // 各列最大值（进度条基准，主列表 + 钉选行一起算）
  const maxes = useMemo(() => {
    const m: Record<SortKey, number> = { cpu: 1e-9, mem: 1e-9, gpu: 1e-9, vram: 1e-9, disk: 1e-9 }
    const acc = (a: Agg) => {
      m.cpu = Math.max(m.cpu, a.cpu / 12)
      m.mem = Math.max(m.mem, a.mem)
      m.gpu = Math.max(m.gpu, a.gpu)
      m.vram = Math.max(m.vram, a.vram)
      m.disk = Math.max(m.disk, a.disk)
    }
    for (const r of rows) acc(r.a)
    for (const pr of pinnedRows) if (pr.node) acc(pr.node.agg)
    return m
  }, [rows, pinnedRows])

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

  const doPin = (p: ProcessInfo) => onPins([...pins, { pid: p.pid, name: p.name }])
  const unpin = (pid: number) => onPins(pins.filter(x => x.pid !== pid))
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= pins.length) return
    setPinSort(null) // 手动拖动顺序后退出排序模式
    const next = [...pins]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    onPins(next)
  }

  // 数值五列（sk 决定进度条画在哪一列；null 表示不画）
  const vals = (a: Agg, sk: SortKey | null) => {
    const rowVal = sk === null ? 0 : sk === 'cpu' ? a.cpu / 12 : a[sk]
    const barW = Math.min(100, rowVal / maxes[sk ?? 'cpu'] * 100) + '%'
    const bar = (on: boolean) => on ? <span className="bar"><i style={{ width: barW }} /></span> : null
    return (
      <>
        <div className="num">{(a.cpu / 12).toFixed(1)}%{bar(sk === 'cpu')}</div>
        <div className="num">{fmtStorage(a.mem, prefs.storage)}{bar(sk === 'mem')}</div>
        <div className="num">{a.gpu > 0.05 ? a.gpu.toFixed(1) + '%' : '—'}{bar(sk === 'gpu')}</div>
        <div className="num">{a.vram > 0 ? fmtStorage(a.vram, prefs.storage) : '—'}{bar(sk === 'vram')}</div>
        <div className="num">{a.disk > 1 ? fmtNet(a.disk, prefs.net) : '—'}{bar(sk === 'disk')}</div>
      </>
    )
  }

  // 表头（主卡与钉选卡各自一套排序状态，互不影响）
  const head = (cur: SortKey | null, asc: boolean, onCol: (k: SortKey) => void) => (
    <div className="tree-head">
      <div className="h on">名称</div>
      {COLS.map(c =>
        <div key={c.key}
          className={'h' + (cur === c.key ? ' on' : '')}
          title={c.title}
          onClick={() => onCol(c.key)}>
          {c.label}{cur === c.key ? (asc ? ' ↑' : ' ↓') : ''}
        </div>)}
      <div className="h" />
    </div>
  )
  const mainHead = head(sortKey, sortAsc, k => {
    if (sortKey === k) setSortAsc(v => !v)
    else { setSortKey(k); setSortAsc(false) }
  })
  // 钉选卡：同列三态 降序 → 升序 → 恢复手动顺序
  const pinHead = head(pinSort?.key ?? null, pinSort?.asc ?? false, k => {
    if (pinSort?.key !== k) { setPinSort({ key: k, asc: false }); return }
    if (pinSort.asc) setPinSort(null)
    else setPinSort({ key: k, asc: true })
  })

  return (
    <div className="view tree-panel">
      <div className="tree-toolbar glass">
        <span className="tt-title">进程</span>
        <span className="tt-sub">{dataSource.length} 个进程 · {q ? `匹配 ${rows.length}` : `显示 ${rows.length} 行`}</span>
        {paused && <span className="tt-warn">⏸ 已暂停 · 数据已冻结</span>}
        <span className="spacer" />
        <div className="tsearch">
          <svg className="tsearch-ico" width={12} height={12} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索进程名 / PID"
            spellCheck={false} />
          {query && <button className="tclear" title="清除" onClick={() => setQuery('')}>✕</button>}
        </div>
        <span className="tt-hint">点击 ▸ 展开子进程 · 悬停行图钉可置顶</span>
        <button className={'chip' + (paused ? ' on' : '')} onClick={togglePause} title="冻结当前列表，方便查看某个进程">
          {paused ? '▶ 继续' : '⏸ 暂停'}
        </button>
      </div>

      {pins.length > 0 && (
        <div className="tree-card pinned glass">
          <div className="pin-cap">
            <IconPin size={13} />
            <span>钉选 {pins.length} · 置顶显示</span>
            <span className="spacer" />
            <span className="hint">
              {pinSort ? '已按列排序，▲▼ 可恢复手动顺序 · 点图钉取消' : '▲▼ 调整顺序 · 点列头可排序'}
            </span>
          </div>
          {pinHead}
          <div className="pin-body">
            {pinnedRows.map((pr, i) => pr.node ? (
              <div key={pr.pin.pid} className="trow" style={{ height: ROW_H }}>
                <div className="name">
                  <span className="pdot" style={{ background: hashColor(pr.node.p.name) }} />
                  <span className="nm" title={`${pr.node.p.name} (${pr.node.p.pid})`}>{pr.node.p.name}</span>
                  {pr.node.kids.length > 0 && <span className="cnt">({pr.node.kids.length})</span>}
                  <span className="pid">{pr.node.p.pid}</span>
                </div>
                {vals(pr.node.agg, pinSort?.key ?? null)}
                <div className="acts show">
                  {!pinSort && <>
                    <button className="pbtn" title="上移" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                    <button className="pbtn" title="下移" disabled={i === pins.length - 1} onClick={() => move(i, 1)}>▼</button>
                  </>}
                  <button className="pbtn on" title="取消钉选" onClick={() => unpin(pr.pin.pid)}><IconPin size={13} /></button>
                </div>
              </div>
            ) : (
              <div key={pr.pin.pid} className="trow ghost" style={{ height: ROW_H }}>
                <div className="name">
                  <span className="pdot" style={{ background: hashColor(pr.pin.name) }} />
                  <span className="nm" title={`${pr.pin.name} (${pr.pin.pid})`}>{pr.pin.name}</span>
                  <span className="pid">{pr.pin.pid}</span>
                  <span className="cnt">已退出</span>
                </div>
                <div className="num">—</div>
                <div className="num">—</div>
                <div className="num">—</div>
                <div className="num">—</div>
                <div className="num">—</div>
                <div className="acts show">
                  <button className="pbtn on" title="取消钉选" onClick={() => unpin(pr.pin.pid)}><IconPin size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="tree-card glass">
        {mainHead}
        <div className="tree-body" ref={bodyRef} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
          <div style={{ height: rows.length * ROW_H, position: 'relative' }}>
            {rows.length === 0 && <div className="t-none">{q ? '无匹配进程' : '暂无进程数据'}</div>}
            {slice.map((r, i) => {
              const top = (start + i) * ROW_H
              const hasKids = r.kidCount > 0
              return (
                <div key={r.p.pid} className="trow" style={{ top, height: ROW_H, position: 'absolute', right: 0, left: 0 }}
                  onDoubleClick={() => hasKids && !q && toggle(r.p.pid)}>
                  <div className="name" style={{ paddingLeft: r.depth * 18 }}>
                    <span className={'twisty' + (r.search ? ' leaf' : expanded.has(r.p.pid) ? ' open' : '') + (hasKids && !r.search ? '' : ' leaf')}
                      onClick={() => hasKids && !r.search && toggle(r.p.pid)}>▶</span>
                    <span className="pdot" style={{ background: hashColor(r.p.name) }} />
                    <span className="nm" title={`${r.p.name} (${r.p.pid})`}>{r.p.name}</span>
                    {hasKids && <span className="cnt">({r.kidCount})</span>}
                    <span className="pid">{r.p.pid}</span>
                  </div>
                  {vals(r.a, sortKey)}
                  <div className="acts">
                    <button className="pbtn" title="钉选置顶" onClick={() => doPin(r.p)}><IconPin size={13} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
