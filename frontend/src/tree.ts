// 进程树构建：按 PPID 组树，子进程占用向上累加（与任务管理器分组口径一致）
import type { ProcessInfo } from './types'

export interface Agg { cpu: number; mem: number; gpu: number; vram: number; disk: number }
export interface ProcNode {
  p: ProcessInfo
  kids: ProcNode[]
  agg: Agg // 自身 + 全部子孙之和
}

export function aggOf(p: ProcessInfo): Agg {
  return { cpu: p.cpu, mem: p.memPrivate, gpu: p.gpu, vram: p.vramDedicated, disk: p.diskRead + p.diskWrite }
}

export function buildForest(processes: ProcessInfo[]): ProcNode[] {
  const byId = new Map<number, ProcNode>()
  for (const p of processes) byId.set(p.pid, { p, kids: [], agg: aggOf(p) })
  const roots: ProcNode[] = []
  for (const node of byId.values()) {
    const parent = node.p.ppid !== 0 ? byId.get(node.p.ppid) : undefined
    if (parent) parent.kids.push(node)
    else roots.push(node)
  }
  // explorer.exe 是 shell：从任务栏/开始菜单启动的应用都挂在它下面，
  // 展示时把它剪掉，让应用进程直接出现在顶层（与任务管理器按应用浏览的习惯一致）
  const lifted: ProcNode[] = []
  const kept: ProcNode[] = []
  for (const r of roots) {
    if (SHELL_PROCS.has(r.p.name.toLowerCase())) lifted.push(...r.kids)
    else kept.push(r)
  }
  roots.length = 0
  roots.push(...kept, ...lifted)
  const addUp = (n: ProcNode): void => {
    for (const k of n.kids) {
      addUp(k)
      n.agg.cpu += k.agg.cpu
      n.agg.mem += k.agg.mem
      n.agg.gpu += k.agg.gpu
      n.agg.vram += k.agg.vram
      n.agg.disk += k.agg.disk
    }
  }
  for (const r of roots) addUp(r)
  return roots
}

// 视为 shell 而直接提升子进程到顶层的进程名
const SHELL_PROCS = new Set(['explorer.exe'])

export type SortKey = 'cpu' | 'mem' | 'gpu' | 'vram' | 'disk'

export function nodeVal(n: ProcNode, key: SortKey): number {
  return n.agg[key]
}
