// 进程树构建：按 PPID 组树，子进程占用向上累加（与任务管理器分组口径一致）
import type { ProcessInfo } from './types'

export interface Agg { cpu: number; mem: number; gpu: number; vram: number; disk: number }
export interface ProcNode {
  p: ProcessInfo
  kids: ProcNode[]
  agg: Agg // 自身 + 全部子孙之和
}

// 钉选条目：按 pid 钉住单个进程；name 留作进程退出后幽灵行的显示
export interface Pin { pid: number; name: string }

export function aggOf(p: ProcessInfo): Agg {
  return { cpu: p.cpu, mem: p.memPrivate, gpu: p.gpu, vram: p.vramDedicated, disk: p.diskRead + p.diskWrite }
}

export interface Forest {
  roots: ProcNode[]
  detached: ProcNode[] // 被钉选摘出的节点（连同各自子树，聚合值已算好）
}

export function buildForest(processes: ProcessInfo[], pinned?: ReadonlySet<number>): Forest {
  const byId = new Map<number, ProcNode>()
  for (const p of processes) byId.set(p.pid, { p, kids: [], agg: aggOf(p) })
  const parentOf = new Map<ProcNode, ProcNode>()
  const roots: ProcNode[] = []
  const detached: ProcNode[] = []
  for (const node of byId.values()) {
    if (pinned?.has(node.p.pid)) {
      detached.push(node) // 钉选进程连同子树从主树摘出，父聚合不再计入它
      continue
    }
    const parent = node.p.ppid !== 0 ? byId.get(node.p.ppid) : undefined
    if (parent) {
      parent.kids.push(node)
      parentOf.set(node, parent)
    } else {
      roots.push(node)
    }
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
  const computed = new Set<ProcNode>()
  const addUp = (n: ProcNode): void => {
    if (computed.has(n)) return // 钉选子树可能嵌套钉选，防止同一节点累加两次
    computed.add(n)
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
  for (const d of detached) addUp(d) // 钉选行也要带上自己子树的聚合值

  // 兜底：后端会按创建时间剪掉 pid 复用形成的 PPID 环；这里再保证任何情况下
  // 进程都不会因组树不可达而消失——从根走不到的节点提升为根。
  const seen = new Set<number>()
  const mark = (list: ProcNode[]): void => {
    for (const n of list) {
      if (seen.has(n.p.pid)) continue
      seen.add(n.p.pid)
      mark(n.kids)
    }
  }
  mark(roots)
  for (const d of detached) mark([d]) // 钉选子树视为已安置，不参与提升
  if (seen.size < byId.size) {
    for (const node of byId.values()) {
      if (seen.has(node.p.pid) || pinned?.has(node.p.pid)) continue
      if (SHELL_PROCS.has(node.p.name.toLowerCase())) continue // shell 是被故意剪掉的，不算丢失
      const par = parentOf.get(node)
      if (par) par.kids = par.kids.filter(k => k !== node)
      roots.push(node)
      mark([node])
    }
  }
  return { roots, detached }
}

// 视为 shell 而直接提升子进程到顶层的进程名
const SHELL_PROCS = new Set(['explorer.exe'])

export type SortKey = 'cpu' | 'mem' | 'gpu' | 'vram' | 'disk'

export function nodeVal(n: ProcNode, key: SortKey): number {
  return n.agg[key]
}
