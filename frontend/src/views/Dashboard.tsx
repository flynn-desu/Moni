import { useMemo } from 'react'
import type { Sample } from '../types'
import { Gauge } from '../components/Gauge'
import { IconCpu, IconDisk, IconGpu, IconMemory, IconNet, IconVram } from '../components/icons'
import { fmtNet, fmtStorage, splitNet, splitStorage } from '../format'
import { usePrefs } from '../prefs'

export function Dashboard({ s, history }: { s: Sample | null; history: { netRecvBps: number; netSentBps: number }[] }) {
  const prefs = usePrefs()
  const netArc = useMemo(() => {
    if (!s) return 0
    const win = history.slice(-60)
    const peak = Math.max(2e6, ...win.map(p => p.netRecvBps), ...win.map(p => p.netSentBps))
    return Math.max(s.net.recvBps, s.net.sentBps) / peak * 100
  }, [history, s])

  if (!s) return <div className="empty">正在连接采集内核…</div>

  const top = s.processes[0]
  const engines = Object.entries(s.gpu.byEngine ?? {}).filter(([, v]) => v > 0.3)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
  const vramArc = s.gpu.vramDedicatedTotal > 0 ? s.gpu.vramDedicatedUsed / s.gpu.vramDedicatedTotal * 100 : 0
  const disks = s.disks ?? []
  const diskActive = Math.max(0, ...disks.map(d => d.activePercent))
  const vram = splitStorage(s.gpu.vramDedicatedUsed, prefs.storage)
  const recv = splitNet(s.net.recvBps, prefs.net)

  return (
    <div className="view dash-grid">
      <Gauge value={s.cpu.usedPercent} display={s.cpu.usedPercent.toFixed(1)} unit="CPU %"
        accent="var(--acc-cpu)" title="CPU" icon={<IconCpu />} variant="cpu"
        details={
          <>
            <div className="gauge-line">{s.cpu.cores} 逻辑核心</div>
            {top && top.cpu > 1 &&
              <div className="gauge-line">最高 <b>{top.name}</b> {top.cpuNorm.toFixed(1)}%</div>}
          </>
        } />
      <Gauge value={s.mem.usedPercent} display={s.mem.usedPercent.toFixed(1)} unit="MEM %"
        accent="var(--acc-mem)" title="内存" icon={<IconMemory />} variant="mem"
        details={
          <>
            <div className="gauge-line"><b>{fmtStorage(s.mem.used, prefs.storage)}</b> / {fmtStorage(s.mem.total, prefs.storage)}</div>
            <div className="gauge-line">提交 {fmtStorage(s.mem.commitTotal, prefs.storage)} / {fmtStorage(s.mem.commitLimit, prefs.storage)}</div>
          </>
        } />
      <Gauge value={s.gpu.usedPercent} display={s.gpu.usedPercent.toFixed(1)} unit="GPU %"
        accent="var(--acc-gpu)" title="GPU" icon={<IconGpu />} variant="gpu"
        details={
          <>
            <div className="gauge-line" title={s.gpu.adapterName}>{s.gpu.adapterName}</div>
            <div className="gauge-chips">
              {engines.length === 0 ? <span className="gauge-line">引擎空闲</span> :
                engines.map(([k, v]) => <span key={k} className="eng-chip">{k} {v.toFixed(0)}%</span>)}
            </div>
          </>
        } />
      <Gauge value={vramArc} display={vram.n} unit={vram.u}
        accent="var(--acc-vram)" title="专用显存" icon={<IconVram />} variant="vram"
        details={
          <>
            <div className="gauge-line">专用 <b>{fmtStorage(s.gpu.vramDedicatedUsed, prefs.storage)}</b> / {fmtStorage(s.gpu.vramDedicatedTotal, prefs.storage)}</div>
            <div className="gauge-line">共享 {fmtStorage(s.gpu.vramSharedUsed, prefs.storage)} / {fmtStorage(s.gpu.vramSharedTotal, prefs.storage)}</div>
          </>
        } />
      <Gauge value={diskActive} display={diskActive.toFixed(0)} unit="DISK %"
        accent="var(--acc-disk)" title="磁盘" icon={<IconDisk />} variant="disk"
        details={
          disks.length === 0 ? <div className="gauge-line">枚举中…</div> :
            disks.map(d =>
              <div key={d.name} className="gauge-line">
                <b>{d.name}</b> 读 {fmtNet(d.readBps, prefs.net)} · 写 {fmtNet(d.writeBps, prefs.net)}
              </div>)
        } />
      <Gauge value={netArc} display={recv.n} unit={recv.u}
        accent="var(--acc-net)" title="网络下行" icon={<IconNet />} variant="net"
        details={
          <>
            <div className="gauge-line">收 <b>{fmtNet(s.net.recvBps, prefs.net)}</b></div>
            <div className="gauge-line">发 <b>{fmtNet(s.net.sentBps, prefs.net)}</b></div>
          </>
        } />
    </div>
  )
}
