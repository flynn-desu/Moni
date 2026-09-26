# Moni 开发交接文档

> 更新时间：2026-09-26 17:00 ｜ 状态：**功能全部完成，已具备分享条件**。`build/bin/Moni.exe`（~12MB 单文件，自定义图标 + 内嵌 WebView2 引导器 + 裁剪符号）为最新产物
> 配套阅读：[DESIGN.md](DESIGN.md)（需求与总体设计，必读）

## 1. 当前进度总览

| 里程碑 | 状态 |
|---|---|
| M0 环境与选型 | ✅ 完成 |
| M1 采集内核（Go） | ✅ 完成并经用户核对（采集耗时 5-8ms） |
| #5 数据推送+环形缓冲 | ✅ `internal/store`（300 点聚合缓冲，不含进程列表）+ `app.go` EventsEmit("sample") |
| #6 玻璃 UI 仪表盘 | ✅ Liquid Glass 设计系统 + 六仪表（SVG 硬件图标 + 大弧圈 + 明细居下方居中） |
| #7 曲线 + 进程树 | ✅ uPlot 六卡曲线（窗口 1/5min、GPU 引擎切换）+ 进程树（组树聚合/展开/虚拟滚动/列排序） |
| #8 树图 | ✅ canvas squarified + 点击下钻 + 面包屑 + 悬浮 tooltip + 6 套配色（自绘下拉选择） |
| #9 打磨打包 | ✅ 失焦降频、设置持久化、明暗主题、视图切换动画、主机页、自身占用监控、`wails build` 单 exe |

**设置项**（%APPDATA%\Moni\config.json）：采集间隔 500ms~5s、窗口置顶、存储单位(智能/MB/GB)、网络单位(智能/KB/MB/GB)、树图配色(极光蓝/晨雾青/极简灰/彩虹/日落/马卡龙)、界面主题(暗色默认/浅色)。全部经 `GetConfig/SetInterval/SetUnits/SetMapTheme/SetUiTheme` 绑定读写。状态栏里 Moni 自身内存固定用智能单位显示（小值在固定 GB 模式下会变成 0.04 GB 这类不可读形态）。

**重要修复记录（第二轮 UI 验收）**：
- exe 黑屏根因：warmup 轮 `Disks=nil` → JSON null → 前端 `s.disks.map` 抛错、React 整树卸载。修复：后端 Sample 初始化 `Disks: []DiskSys{}` + 前端 onSample 防御性归一化 + main.tsx 错误边界（渲染异常显示红字而非黑屏）
- 仪表盘改为**垂直布局**（明细在弧圈下方居中）：卡片宽度与文字长度彻底解耦，配合 `min-width:0` + 弧圈 `clamp()` 宽度，125% DPI / ~930px 窗口宽下不再溢出
- 浅色主题专用变量组：`--ico-*`（深色图标）、`--gauge-track`（16% 黑轨道）、`--acc-*`（加深主色），解决浅色下图标/进度条看不清
- `applyUnits/applyTheme/applyMode` 用 prefsRef 规避 React 闭包旧值覆盖

## 2. 环境信息（新会话直接可用）

- **Go 1.27.1**：`C:\Users\hfy\.workbuddy\binaries\go\go\bin\go.exe`（不在 PATH 里，命令前需 `export PATH="/c/Users/hfy/.workbuddy/binaries/go/go/bin:$PATH"`）
- **Wails CLI v2.16.0**：`C:\Users\hfy\go\bin\wails.exe`（已安装）
- **GOPROXY**：已 `go env -w` 持久化为 `https://goproxy.cn,direct`，无需代理
- **Node 22** 系统已有；**frontend 还没跑过 `npm install`**
- 网络注意：`go.dev`/`golang.google.cn` 不可直连，阿里云镜像 `https://mirrors.aliyun.com/golang/` 可直连；clash 代理 7890 对 github.com 可用；**curl 走代理访问 go.dev 报 TLS 错误(exit 35)，属正常，换镜像即可**
- 本机无 Rust / MSVC，不用 Tauri（已选 Go+Wails，勿更改）

## 3. 项目结构（D:\projects\agent\workbuddy\Moni）

```
├─ main.go / app.go / wails.json / build/            # Wails 壳；app.go 持有 Manager/Store/Config 并绑定 4 个方法
├─ cmd/harness/main.go      # M1 验证工具：每秒打印指标+top进程，供与任务管理器对照
├─ internal/
│  ├─ pdh/pdh.go            # PDH 最小封装（PdhAddEnglishCounterW + 通配符数组读取）
│  ├─ collector/            # 采集内核（types.go 的 JSON tag 即前后端契约）
│  │  ├─ types.go / manager.go / process.go / gpu.go / system.go
│  ├─ store/store.go        # 环形历史缓冲（300 点聚合 Point，不含进程列表）
│  └─ config/config.go      # 设置持久化（%APPDATA%\Moni\config.json）
├─ frontend/src/
│  ├─ styles/glass.css      # Liquid Glass 设计系统（环境光/毛玻璃/高光描边/药丸控件）
│  ├─ types.ts / format.ts  # 契约类型与格式化
│  ├─ driver.ts             # 驱动层：Wails 绑定 ↔ 浏览器 Mock（window.go 不存在时自动 Mock）
│  ├─ tree.ts               # PPID 组树 + 子孙聚合（进程树/树图共用）
│  ├─ components/Gauge.tsx  # SVG 环形仪表
│  └─ views/                # Dashboard / Charts(uPlot) / ProcessTree(虚拟滚动) / Treemap(canvas)
├─ docs/DESIGN.md           # 需求与设计
├─ README.md / LICENSE(MIT, 署名 hfy) / .gitignore
```

模块名：`Moni`（go.mod），内部包 import 路径形如 `Moni/internal/collector`。

## 3.5 前端调试与验收方式

- **纯浏览器调试 UI**：`cd frontend && npm run dev`，浏览器打开 vite 地址即可——`driver.ts` 检测不到 `window.go` 时自动切换 Mock 驱动（仿真数据+假进程树），四个视图全部可交互验证。
- **真机运行**：`wails build` 产物 `build/bin/Moni.exe`，走真实采集。设置持久化、失焦降频、窗口置顶（`WindowSetAlwaysOnTop`）均为 Wails 绑定路径，只能在真机验证。
- 前端契约同步：改 `internal/collector/types.go` 或 `internal/store/store.go` 的 JSON tag 后，跑 `wails generate module` 重新生成 `frontend/wailsjs/`，并同步 `frontend/src/types.ts`。

## 4. ⚠️ 关键技术发现（踩过的坑，新会话必读）

1. **perflib 库按"对象名"查询在本机全部返回空**（英文/中文名都不行），但 **"Global" 全量查询正常**。解决方案：**按对象索引号查询**（官方机制，跨语言一致）：
   - `6290`=GPU Engine, `6308`=GPU Adapter Memory, `6296`=GPU Process Memory, `6316`=GPU Local Adapter Memory, `230`=Process, `234`=PhysicalDisk, `510`=Network Interface
2. **最终技术路线已定**：不用 perflib 库，改为自己封装 **PDH API**（`internal/pdh/pdh.go`）：
   - `PdhAddEnglishCounterW`（英文路径，任何语言系统可用）+ 通配符实例 `(*)`
   - `PdhGetFormattedCounterArrayW` 一次取全部实例，**x64 结构体布局 24 字节/项**（代码里有注释）
   - 速率类计数器由 PDH 在两次 `Collect()` 之间自动差分 → 每轮只需 Collect 一次，首轮数据无效（代码里用 `Warmup` 标记跳过）
3. **GPU 口径**：任务管理器"GPU 整体利用率"= 各引擎类型利用率的**最大值**（代码按此实现）；引擎类型取 `engtype_` 后缀转小写（3d/copy/videodecode/videoencode...）
4. **GPU Engine 实例名**：`pid_<pid>_luid_..._eng_<n>_engtype_<type>`，按 pid 正则/字符串提取；GPU Adapter Memory 无 `pid_` 前缀的实例是全卡总量
5. **显存总量**：注册表 `HKLM\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0000` 的 `HardwareInformation.qwMemorySize`（已实现，缓存读取）
6. **gopsutil v4 在 Windows**：`p.Times()` 返回的字段是 `.User` 和 `.System`（没有 `.Kernel`）；`MemoryInfo().RSS`=工作集，`VMS`≈Pagefile（commit 口径待 harness 验证，另用 PDH `\Process(*)\Private Bytes` 作提交大小）
7. **x/sys/windows 没有 GlobalMemoryStatusEx**（已在 system.go 自封装，见 §5）；CPU 字段名等问题已修复
8. **⚠️ PDH 数组读取必须传指针**：`PdhGetFormattedCounterArrayW` 第 3/4 参数都是 `DWORD*`（in/out），按值传 size 会得到 NULL 指针→PDH 返回 invalid parameter→**所有通配符计数器静默返回空**（首轮验证踩中，症状：GPU/磁盘/网络/每进程内存全为 0）。已在 `pdh.ReadAll` 修复
9. **⚠️ 通配符数组同名实例不带 #N 后缀**：10 个 WorkBuddy 实例全叫 `WorkBuddy`，按"实例名→pid"建 map 会互相覆盖（症状：多实例同名进程内存为 0）。正确做法：`\Process` 对象各计数器与 `ID Process` 数组**按下标对齐**（同一次 Collect 内实例顺序一致），见 `collectProcessMem`（已随 NtQSI 重写移除，此机制对其他对象仍适用）
10. **⚠️ 每进程显存要用 `GPU Process Memory` 对象**：本机 `GPU Adapter Memory` 只有 2 个全卡 `luid_..._phys_0` 实例（无 `pid_` 实例），按进程拆显存必须走 `\GPU Process Memory(*)\Dedicated|Shared Usage`（实例名带 `pid_`）；Adapter Memory 仅用于全卡总量
11. **Process 对象的 `_Total` 实例 ID Process = 0**：不跳过会把全机总量挂到 pid 0（症状：System Idle Process 私有内存 16GB）
12. **进程采集已从 gopsutil 换成单次 `NtQuerySystemInformation(SystemProcessInformation=5)`**：gopsutil 逐进程开句柄，370 进程一轮 ~30ms（超 20ms 硬指标）；NtQSI 一次调用拿全 名称/PPID/CPU时间/IO计数/工作集/私有工作集/提交，**降到 5-8ms**，且受限进程也能拿到名称。结构体 `systemProcessInformation`（256 字节，Vista+ x64 布局，有 init 断言）。数据已与 PDH 口径交叉验证一致

## 5. 编译错误修复（已完成 2026-09-26）

当时 `go build ./...` 有 3 处错误，均已修复：

1. `system.go`：x/sys 无 `GlobalMemoryStatusEx`，已在文件内自封装 `memoryStatusEx` + `kernel32.NewProc` 调用
2. `process.go`：gopsutil v4 的 `cpu.TimesStat` 无 `.Kernel` 字段 → 用 `.System`（后整个文件已重写为 NtQSI 方案，见 §4.12）
3. 顺带补上缺失的全局 CPU 采集：`s.CPU.UsedPercent` 原本无人赋值，现用 `GetSystemTimes` 差分（kernel 含 idle，busy = user+kernel-idle），见 `system.go collectCPU`

## 6. M1 验证（任务 #2 收尾：待用户同屏核对）

构建与运行：

```bash
cd D:/projects/agent/workbuddy/Moni
export PATH="/c/Users/hfy/.workbuddy/binaries/go/go/bin:$PATH"
go build -o harness.exe ./cmd/harness && ./harness.exe -n 9999   # 持续输出，Ctrl+C 停止
```

对照任务管理器逐项核对（同屏对比）：
- [ ] CPU% 与 TM"性能"页一致（差分口径，允许±1%）
- [ ] 内存 使用/总量 一致；提交大小 与 TM"性能-内存-已提交"一致
- [ ] GPU% ：开个视频或游戏后对比；显存 专用/共享 与 TM 一致（共享总量=物理内存一半）
- [ ] 每进程 私有内存 与 TM"进程-内存"列一致；CPU 一致（harness 的"TM口径"列即归一化 0-100）
- [ ] 磁盘读写速率与资源监视器一致；网络 收/发 与 TM 一致
- [x] **采集自耗 `采集耗时` < 20ms/轮**（实测 5-8ms；gopsutil 时代为 30-35ms，已用 NtQSI 重写解决）

自测通过记录（2026-09-26，机器上有 python.exe 占 ~40% CPU / 10GB 显存的负载）：
- 全局 CPU 41-53% 波动合理；内存 24.78/47.82GB；提交 38.4/55.0GB
- GPU 引擎 `cuda=62-69%`，全卡利用率取峰值口径；专用显存 10.69/16.00GB；共享 91MB/23.91GB
- python.exe：WS 2.00GB、私有 1.77GB、提交 12.89GB、专用显存 10.08GB、GPU 62-69%——与 PDH 路径交叉验证一致
- 多实例同名进程（WorkBuddy/ZCode/QQ）逐 pid 内存各不相同且非零（下标对齐修复生效）
- 双物理盘 `0 C: D:`、`1 E:` 读写字节速率/活跃时间输出正常；网络收发 KB 级数值正常

已知注意点：进程首次出现的那一轮 CPU/磁盘为 0（无差分基准），属预期。

## 7. 已完成里程碑的落地说明（原 #5~#9）

1. **#5 推送+缓冲**：`app.go onSample` → `store.Push`（300 点聚合 Point）+ `runtime.EventsEmit(ctx, "sample", s)`；前端启动时 `GetHistory()` 拉全量，之后纯事件增量。前端在 `document.hidden` 时暂停 setState（采集照常入缓冲，恢复可见时补齐）
2. **#6 玻璃 UI**：参考 Apple Liquid Glass（WWDC 2025）——`backdrop-filter: blur+saturate` 玻璃面板、1px 内描边+顶部镜面高光、药丸分段导航、aurora 环境光动画（给玻璃提供折射内容）、tabular-nums 数字。六仪表 = SVG 270° 弧 + 渐变描边 + 中心大数值
3. **#7 曲线+进程树**：uPlot 六卡（X 轴隐藏、Y 轴极简、渐变填充），时间窗口 1/5min，GPU 引擎芯片切换（整体/3d/copy/cuda…，来自历史点 byEngine 并集）；进程树按 PPID 组树、子孙占用向上累加、逐级排序、展开/收起、固定行高虚拟滚动、列排序带迷你占用条
4. **#8 树图**：squarified（Bruls et al.，纯像素面积口径），指标可切（CPU/内存/GPU/显存/磁盘），面积∝占用、按占比着色，点击有子进程的矩形下钻、面包屑逐级返回、悬浮 tooltip；配色 6 套（极光蓝/晨雾青/极简灰 3 纯色 + 彩虹/日落/马卡龙 3 多彩），自绘玻璃下拉选择（带色板 swatch）
5. **#9 打磨**：blur/最小化 → `SetThrottled(true)` 降至 5s、恢复原速；设置全部持久化 JSON；明暗主题（CSS 变量整体切换，浅色下图标/轨道/主色有专属配色）；视图切换淡入动画；主机页（单卡片列表 + 手写 SVG 硬件图标，注册表读 CPU 型号/系统版本）；状态栏显示 Moni 自身 CPU/内存（NtQSI 自采）；`wails build` 出 `build/bin/Moni.exe`（12MB）

**分享分发**：单 exe 即可（前端已 embed、静态链接、配置写 %APPDATA%，无需安装器/管理员）。构建命令 `wails build -webview2 embed -ldflags "-s -w"`——`embed` 把微软 WebView2 引导器内嵌进 exe（目标机缺运行时则自动引导安装一次，需联网）；`-s -w` 裁剪符号减体积。图标源文件在 `logo.png`（仓库根目录，用户绘制）；背景模式/磨砂程度/壁纸见 config.json 的 bgMode/blur/wallpaperPath，栅格化命令见下方，改图标后覆盖 `build/appicon.png`（1024×1024）重新 build 即可：
```
logo.png 居中裁方缩放至 1024×1024 后覆盖 build/appicon.png
```
未签名 exe 分享时会遇到 SmartScreen"更多信息→仍要运行"，彻底消除需代码签名证书（可选）。

遗留可选项（v1.1 候选）：开机自启、`-nsis` 安装包、代码签名、README 截图后发布 GitHub。

## 8. 其他备忘

- 任务管理器截图（用户提供的需求参照）在 `C:\Users\hfy\.workbuddy\clipboard-images\` 下两张 clipboard-2026-09-26*.png
- `_tmp_probe/` 已删除（M1 验证完成；验证期间新建的探针用过即删）
- 前端契约即 `types.go` 的 JSON tag，改结构体记得同步前端；本轮新增 `cpuNorm` 字段（TM 口径 0-100）
- 每进程内存数据源已改为 NtQSI（WorkingSetSize/WorkingSetPrivateSize/PrivatePageCount），不再依赖 gopsutil；gopsutil 已从 go.mod 移除
- 用户偏好：文档交付用 Markdown；无必要不产出 HTML/可视化
