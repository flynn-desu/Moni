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

export type SortKey = 'cpu' | 'mem' | 'gpu' | 'vram' | 'disk'

export function nodeVal(n: ProcNode, key: SortKey): number {
  return n.agg[key]
}
