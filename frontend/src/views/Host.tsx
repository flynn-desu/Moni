// 主机视图：单卡片列表 + SVG 硬件图标（信息一次性拉取）
import { useEffect, useState } from 'react'
import type { HostInfo } from '../types'
import { fmtStorage } from '../format'
import { driver } from '../driver'
import { usePrefs } from '../prefs'
import { IconCpu, IconDevice, IconGpu, IconMemory, IconOS } from '../components/icons'

interface RowProps {
  icon: React.ReactNode
  variant: string
  label: string
  value: React.ReactNode
  metas?: { k: string; v: React.ReactNode }[]
}

function Row({ icon, variant, label, value, metas }: RowProps) {
  return (
    <div className="host-row">
      <div className={'host-ico ico-' + variant}>
        {icon}
      </div>
      <div className="host-main">
        <div className="host-label">{label}</div>
        <div className="host-value">{value}</div>
      </div>
      {metas && metas.length > 0 &&
        <div className="host-metas">
          {metas.map(m => (
            <div key={m.k} className="kv"><span>{m.k}</span><b>{m.v}</b></div>
          ))}
        </div>}
    </div>
  )
}

export function Host() {
  const prefs = usePrefs()
  const [info, setInfo] = useState<HostInfo | null>(null)

  useEffect(() => {
    let alive = true
    driver.getHostInfo().then(h => { if (alive) setInfo(h) })
    return () => { alive = false }
  }, [])

  if (!info) return <div className="empty">读取主机信息…</div>

  return (
    <div className="view host-panel glass">
      <Row icon={<IconCpu />} variant="cpu" label="处理器"
        value={info.cpuName || '未知'}
        metas={[{ k: '逻辑核心', v: info.cpuCores }]} />
      <div className="host-sep" />
      <Row icon={<IconGpu />} variant="gpu" label="显卡"
        value={info.gpuName || '未检测到'}
        metas={[{ k: '专用显存', v: fmtStorage(info.vramTotal, prefs.storage) }]} />
      <div className="host-sep" />
      <Row icon={<IconMemory />} variant="mem" label="内存"
        value={fmtStorage(info.memTotal, prefs.storage)}
        metas={[{ k: '物理内存总量', v: (info.memTotal / 2 ** 30).toFixed(2) + ' GiB' }]} />
      <div className="host-sep" />
      <Row icon={<IconOS />} variant="net" label="操作系统"
        value={info.os || 'Windows'}
        metas={[{ k: '版本', v: info.osVersion }, { k: '架构', v: info.arch }]} />
      <div className="host-sep" />
      <Row icon={<IconDevice />} variant="disk" label="设备"
        value={info.hostname || '—'}
        metas={[{ k: '运行时', v: info.goVersion }]} />
    </div>
  )
}
