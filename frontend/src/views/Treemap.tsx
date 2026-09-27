import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProcessInfo } from '../types'
import { buildForest, type ProcNode, type SortKey } from '../tree'
import { fmtNet, fmtStorage } from '../format'
import { THEME_LABELS, usePrefs } from '../prefs'
import type { MapTheme } from '../format'
import { GlassSelect } from '../components/GlassSelect'

const METRICS: { key: SortKey; label: string }[] = [
  { key: 'cpu', label: 'CPU' },
  { key: 'mem', label: '内存' },
  { key: 'gpu', label: 'GPU' },
  { key: 'vram', label: '显存' },
  { key: 'disk', label: 'I/O' },
]

// 纯色方案：固定色相；多彩方案：色相按面积排名展开，相邻矩形颜色区分明显
const SOLID: Partial<Record<MapTheme, { hue: number; sat: number }>> = {
  aurora: { hue: 222, sat: 62 },
  teal: { hue: 172, sat: 52 },
  mono: { hue: 220, sat: 8 },
}
const CANDY_HUES = [212, 165, 275, 25, 335, 55, 190, 305]

function hueSat(theme: MapTheme, idx: number): { hue: number; sat: number } {
  const solid = SOLID[theme]
  if (solid) return solid
  if (theme === 'rainbow') return { hue: (idx * 47 + 205) % 360, sat: 60 }
  if (theme === 'sunset') return { hue: (330 + ((idx * 37) % 60)) % 360, sat: 66 }
  return { hue: CANDY_HUES[idx % CANDY_HUES.length], sat: 55 } // candy 马卡龙
}

interface Rect { x: number; y: number; w: number; h: number }

/** squarified 树图布局（Bruls et al.）：面积 ∝ 数值，尽量接近正方形。
 *  统一用像素面积运算：a(v) = v * scale，scale = 区域面积/数值总和 */
function squarify(items: { v: number; node: ProcNode }[], rect: Rect, out: { rect: Rect; node: ProcNode }[]) {
  let rest = items
  let { x, y, w, h } = rect
  while (rest.length > 0 && w > 1 && h > 1) {
    const totalV = rest.reduce((s, it) => s + it.v, 0)
    if (totalV <= 0) return
    const scale = (w * h) / totalV
    const a = (v: number) => v * scale
    const shorter = Math.min(w, h)

    // 贪心组行：沿短边铺设，加入新项后最差长宽比不变差则继续
    const row: typeof rest = []
    let rowArea = 0
    let best = Infinity
    let consumed = 0
    for (let i = 0; i < rest.length; i++) {
      const it = rest[i]
      const newArea = rowArea + a(it.v)
      const t = newArea / shorter // 行带厚度
      let worst = 0
      for (const r of row.concat(it)) {
        const ai = a(r.v)
        const ratio = Math.max((t * t) / ai, ai / (t * t))
        if (ratio > worst) worst = ratio
      }
      if (row.length === 0 || worst <= best) {
        best = worst
        row.push(it)
        rowArea = newArea
        consumed = i + 1
      } else break
    }

    const t = rowArea / shorter
    if (w >= h) {
      // 短边是高度：行带贴左侧竖铺
      let ry = y
      for (const it of row) {
        const ih = a(it.v) / t
        out.push({ rect: { x, y: ry, w: t, h: ih }, node: it.node })
        ry += ih
      }
      x += t; w -= t
    } else {
      // 短边是宽度：行带贴顶部横铺
      let rx = x
      for (const it of row) {
        const iw = a(it.v) / t
        out.push({ rect: { x: rx, y, w: iw, h: t }, node: it.node })
        rx += iw
      }
      y += t; h -= t
    }
    rest = rest.slice(consumed)
  }
}

export function Treemap({ processes, onTheme }: { processes: ProcessInfo[]; onTheme: (t: MapTheme) => void }) {
  const prefs = usePrefs()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rectsRef = useRef<{ rect: Rect; node: ProcNode }[]>([])
  const [metric, setMetric] = useState<SortKey>('mem')
  const [path, setPath] = useState<ProcNode[]>([])
  const [hover, setHover] = useState<{ node: ProcNode; mx: number; my: number } | null>(null)
  const [, forceDraw] = useState(0)

  const forest = useMemo(() => buildForest(processes).roots, [processes])
  const current = path.length > 0 ? path[path.length - 1].kids : forest

  const layout = useMemo(() => {
    const items = current
      .map(n => ({ v: Math.max(0, n.agg[metric]), node: n }))
      .filter(it => it.v > 0)
      .sort((a, b) => b.v - a.v)
    const total = items.reduce((s, it) => s + it.v, 0)
    return { items, total }
  }, [current, metric])

  // 画布尺寸自适应
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ro = new ResizeObserver(() => forceDraw(v => v + 1))
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // 绘制（数据/交互变化时重绘一次）
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const dpr = window.devicePixelRatio || 1
    const W = wrap.clientWidth, H = wrap.clientHeight
    if (W < 10 || H < 10) return
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    const inset = 6
    const area: Rect = { x: 12, y: 46, w: W - 24, h: H - 58 }
    if (area.w < 10 || area.h < 10 || layout.items.length === 0) return

    const rects: { rect: Rect; node: ProcNode }[] = []
    squarify(layout.items, area, rects)
    rectsRef.current = rects

    for (let i = 0; i < rects.length; i++) {
      const { rect, node } = rects[i]
      const share = layout.total > 0 ? node.agg[metric] / layout.total : 0
      const light = 15 + 36 * Math.sqrt(Math.min(1, share * 3))
      const { hue, sat } = hueSat(prefs.theme, i)
      const isHover = hover?.node.p.pid === node.p.pid
      ctx.beginPath()
      const x = rect.x + inset / 2, y = rect.y + inset / 2
      const w = Math.max(0, rect.w - inset), h = Math.max(0, rect.h - inset)
      const rr = Math.min(8, w / 2, h / 2)
      ctx.roundRect(x, y, w, h, rr)
      ctx.fillStyle = `hsl(${hue} ${sat}% ${light}%)`
      ctx.fill()
      // 顶部高光线（玻璃质感）
      const gl = ctx.createLinearGradient(0, y, 0, y + Math.min(h, 18))
      gl.addColorStop(0, 'rgba(255,255,255,0.22)')
      gl.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = gl
      ctx.fill()
      ctx.strokeStyle = isHover ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.14)'
      ctx.lineWidth = isHover ? 1.4 : 0.8
      ctx.stroke()
      // 标签
      if (w > 64 && h > 24) {
        ctx.fillStyle = 'rgba(255,255,255,0.92)'
        ctx.font = '600 11px "Segoe UI", sans-serif'
        ctx.textBaseline = 'top'
        const name = node.p.name
        const nm = ctx.measureText(name).width > w - 12 ? name.slice(0, Math.max(1, Math.floor((w - 16) / 7))) + '…' : name
        ctx.fillText(nm, x + 7, y + 6)
        if (w > 86 && h > 42) {
          ctx.fillStyle = 'rgba(255,255,255,0.55)'
          ctx.font = '10px "Segoe UI", sans-serif'
          ctx.fillText(`${(share * 100).toFixed(1)}% · ${fmtVal(node, metric)}`, x + 7, y + 22)
        }
      }
    }
  }, [layout, metric, hover, processes, prefs.theme])

  const fmtVal = (n: ProcNode, key: SortKey): string => {
    switch (key) {
      case 'cpu': return (n.agg.cpu / 12).toFixed(1) + '%'
      case 'mem': return fmtStorage(n.agg.mem, prefs.storage)
      case 'gpu': return n.agg.gpu.toFixed(1) + '%'
      case 'vram': return fmtStorage(n.agg.vram, prefs.storage)
      case 'disk': return fmtNet(n.agg.disk, prefs.net)
    }
  }

  const hit = (mx: number, my: number) => {
    for (let i = rectsRef.current.length - 1; i >= 0; i--) {
      const r = rectsRef.current[i].rect
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return rectsRef.current[i].node
    }
    return null
  }

  return (
    <div className="view map-panel glass" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="map-canvas"
        onMouseMove={e => {
          const b = (e.target as HTMLCanvasElement).getBoundingClientRect()
          const mx = e.clientX - b.left, my = e.clientY - b.top
          const node = hit(mx, my)
          if (node) setHover({ node, mx, my })
          else setHover(null)
        }}
        onMouseLeave={() => setHover(null)}
        onClick={() => {
          if (hover && hover.node.kids.length > 0) {
            setPath(p => [...p, hover.node])
            setHover(null)
          }
        }}
      />
      <div className="map-overlay">
        <div className="chips">
          {METRICS.map(m =>
            <button key={m.key} className={'chip' + (metric === m.key ? ' on' : '')}
              onClick={() => setMetric(m.key)}>{m.label}</button>)}
        </div>
        <GlassSelect value={prefs.theme} options={THEME_LABELS}
          onChange={k => onTheme(k as MapTheme)} />
        <span className="spacer" />
        <div className="crumb">
          {path.length === 0
            ? <span className="cur">全部进程</span>
            : <>
              <button onClick={() => setPath([])}>全部进程</button>
              {path.map((n, i) =>
                <span key={n.p.pid} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <span className="sep">›</span>
                  {i === path.length - 1
                    ? <span className="cur">{n.p.name}</span>
                    : <button onClick={() => setPath(p => p.slice(0, i + 1))}>{n.p.name}</button>}
                </span>)}
            </>}
        </div>
      </div>
      {hover && (
        <div className="map-tip" style={{
          left: Math.min(hover.mx + 14, (wrapRef.current?.clientWidth ?? 300) - 190),
          top: Math.min(hover.my + 14, (wrapRef.current?.clientHeight ?? 300) - 120),
        }}>
          <b>{hover.node.p.name}</b> <span style={{ color: 'var(--txt-2)' }}>#{hover.node.p.pid}</span>
          {hover.node.kids.length > 0 && <span style={{ color: 'var(--txt-2)' }}>（{hover.node.kids.length} 个子进程，点击下钻）</span>}
          <br />
          CPU {(hover.node.agg.cpu / 12).toFixed(1)}% · GPU {hover.node.agg.gpu.toFixed(1)}%<br />
          内存 {fmtStorage(hover.node.agg.mem, prefs.storage)} · 显存 {fmtStorage(hover.node.agg.vram, prefs.storage)}<br />
          磁盘 {fmtNet(hover.node.agg.disk, prefs.net)}
        </div>
      )}
      {layout.items.length === 0 && <div className="empty">暂无数据</div>}
    </div>
  )
}
