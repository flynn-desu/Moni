// 原生窗口控制（无边框窗口的自绘标题栏用）。
// 纯浏览器调试（wails dev -browser / vite dev）没有 wails runtime，静默降级为空操作。

const hasRuntime = () =>
  typeof (window as { runtime?: unknown }).runtime !== 'undefined'

const rt = async () => await import('../wailsjs/runtime/runtime')

/** 最小化窗口 */
export async function winMinimise(): Promise<void> {
  if (hasRuntime()) await (await rt()).WindowMinimise()
}

/** 切换最大化/还原 */
export async function winToggleMaximise(): Promise<void> {
  if (hasRuntime()) await (await rt()).WindowToggleMaximise()
}

/** 当前是否最大化 */
export async function winIsMaximised(): Promise<boolean> {
  if (!hasRuntime()) return false
  return await (await rt()).WindowIsMaximised()
}

/** 按用户设置的关闭行为执行：exit → 退出程序；minimise → 最小化 */
export async function winClose(action: 'exit' | 'minimise'): Promise<void> {
  if (!hasRuntime()) return
  if (action === 'minimise') await (await rt()).WindowMinimise()
  else await (await rt()).Quit()
}
