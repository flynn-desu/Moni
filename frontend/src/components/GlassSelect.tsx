// 自绘玻璃风格下拉框（带色板色块），替代原生 select
import { useEffect, useRef, useState } from 'react'

export interface SelectOpt { key: string; label: string; swatch?: string }

export function GlassSelect({ value, options, onChange }: {
  value: string
  options: SelectOpt[]
  onChange: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const cur = options.find(o => o.key === value)
  return (
    <div className={'gsel' + (open ? ' open' : '')} ref={ref}>
      <button className="glass-select" onClick={() => setOpen(v => !v)} type="button">
        {cur?.swatch && <i className="sw" style={{ background: cur.swatch }} />}
        <span>{cur?.label ?? value}</span>
        <svg width="9" height="6" viewBox="0 0 9 6" className="caret">
          <path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="gsel-pop glass">
          {options.map(o => (
            <button key={o.key} type="button"
              className={'gsel-item' + (o.key === value ? ' on' : '')}
              onClick={() => { onChange(o.key); setOpen(false) }}>
              {o.swatch && <i className="sw" style={{ background: o.swatch }} />}
              <span>{o.label}</span>
              {o.key === value && <svg width="11" height="9" viewBox="0 0 11 9" className="check">
                <path d="M1 4.5L4 7.5L10 1" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
