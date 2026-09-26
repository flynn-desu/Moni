# Moni — 轻量级 Windows 任务管理器（需求与设计文档）

> 版本：v1.0 ｜ 2026-09-26 ｜ 状态：待开发

## 1. 定位

一个**只读监控查看器**：实时查看 CPU / 内存 / GPU / 显存 / 磁盘 / 网络占用，不提供任何进程操作（不结束进程、不调优先级）。核心卖点：比 Windows 自带任务管理器**更轻、更流畅**，界面为苹果液态玻璃风格。

## 2. 已确认的选型

| 决策项 | 结论 | 理由 |
|---|---|---|
| 应用形态 | **Go + Wails v2 桌面应用** | 原生窗口 + 系统 WebView2 渲染；单 exe；运行内存约 40-60MB；Go 采集走系统调用，不派生 PowerShell 子进程 |
| UI 实现 | **手写玻璃拟态 CSS**（参考 liquid-glass-react 的视觉语言） | backdrop-filter 实现毛玻璃 + 高光描边，比第三方库更轻、无已知定位 bug、性能可控 |
| 网络粒度 | **v1 仅全局网速** | 按进程统计需 ETW，复杂度和开销大，留作后续版本 |
| 渲染引擎 | WebView2（Win11 系统自带，无需分发） | — |

前置环境：本机已有 Node 22；**需安装 Go 工具链（约 100MB，无需 MSVC）**；网络下载走 clash 代理 `127.0.0.1:7890`。

## 3. 系统架构

```
┌─────────────────────────────────────────────┐
│  Go 后端（单进程）                            │
│                                             │
│  采集线程（可配置间隔 500ms/1s/2s/5s）         │
│   ├─ gopsutil: 进程列表/CPU/内存/IO (syscall) │
│   ├─ PDH 计数器: GPU引擎利用率/显存/磁盘活跃时间 │
│   └─ 网卡计数器差分: 全局上下行速率              │
│          │                                  │
│   环形历史缓冲（每指标 300 点，约 5 分钟@1s）    │
│          │  Wails Event（推送，非轮询）        │
├──────────┼──────────────────────────────────┤
│  前端 (React + TS + Vite，WebView2 渲染)     │
│   ├─ uPlot (canvas)   → 百分比曲线           │
│   ├─ 自绘 canvas treemap → 进程矩形树图       │
│   ├─ 虚拟滚动表格      → 进程树（可展开子进程） │
│   └─ SVG 仪表         → 仪表盘              │
└─────────────────────────────────────────────┘
```

**性能三原则**（对症下药，避开自带任务管理器卡顿的根源）：

1. 采集全部在 Go 侧原生完成，前端只接收推送事件，不做任何轮询查询
2. 曲线与树图均用 **canvas** 绘制（uPlot / 自绘），每个采样周期只重绘一次；不用 SVG/DOM 密集渲染
3. 窗口最小化或失焦时暂停前端渲染，采集线程自动降频（如降至 5s）

## 4. 数据采集明细

| 指标 | 数据来源 | 说明 |
|---|---|---|
| CPU 总占用 | `GetSystemTimes` 差分 | 按所有逻辑核心归一化 |
| 每进程 CPU% | `NtQuerySystemInformation`（gopsutil 封装） | 全机占比 + 归一化后占比两种口径 |
| 内存总占用 | `GlobalMemoryStatusEx` | 物理内存 已用/总量 |
| 每进程内存 | Working Set + Commit | 与任务管理器"内存"列口径一致 |
| GPU 利用率 | PDH `GPU Engine(*)\Utilization Percentage` 按 PID 聚合 | Win10 1709+ / WDDM 2.4+，RTX 4060 Ti 完整支持；可分 3D / Copy / Video Encode / Decode 四路，复刻性能页 |
| 专用/共享显存 | PDH `GPU Adapter Memory / Dedicated|Shared Usage` | 总量从 `DXGI` 查询；每进程显存按 PID 聚合 |
| 磁盘 | 每进程 `IO_COUNTERS` 差分（读/写字节速率）；全盘 PDH `% Idle Time` 反推活跃时间 | 支持多块物理盘（C/D、E） |
| 网络 | 网卡字节数差分（`GetIfTable2`） | 全局上下行速率；按进程留 v2（ETW） |

进程树：按 PPID 构建父子关系，子进程汇总值向上累加（与自带任务管理器 PyCharm(5) 的分组逻辑一致）。

## 5. 界面设计

整体：深色底 + 液态玻璃面板（`backdrop-filter: blur + saturate`、1px 高光内描边、顶部微渐变高光、圆角 16-20px）。左/上为全局指标区，主区切换四个视图。

### 5.1 仪表盘（默认页）
六个玻璃仪表盘（CPU / 内存 / GPU / 显存 / 磁盘 / 网络）+ 中心大数值 + 简要明细（如 内存 21.1/47.8 GB、GPU 11.1/16.0 GB 专用显存）。

### 5.2 曲线视图
- 六项指标各一条历史曲线（uPlot），可切换时间窗口（1 分钟 / 5 分钟）
- GPU 部分提供 3D / Copy / Video Encode / Decode 多路切换
- 曲线下方半透明渐变填充，配合玻璃风格

### 5.3 进程树表格
- 可展开/收起子进程；按 CPU、内存、GPU、显存、磁盘、网速列排序
- 虚拟滚动（仅渲染可视区域），数千进程不掉帧
- 每行内嵌迷你占用条（玻璃风格进度条）

### 5.4 矩形树图（Treemap）
- squarified 布局，canvas 绘制；矩形面积 = 所选指标（CPU / 内存 / GPU / 显存 / 磁盘，可切换）
- **点击矩形下钻**：进入该进程，展示其子进程的 treemap，顶部面包屑返回上一级
- 矩形按占用深浅着色，悬浮显示进程名 + 明细 tooltip

### 5.5 设置
- 采集频率：500ms / 1s / 2s / 5s，默认 1s，持久化到本地配置文件
- 开机自启（可选）、窗口置顶开关

## 6. 工程结构

```
glassmon/
├─ main.go              # Wails 入口
├─ internal/
│  ├─ collector/        # 采集器（cpu/mem/gpu/disk/net/process）
│  ├─ store/            # 环形历史缓冲
│  └─ config/           # 设置持久化
├─ frontend/
│  ├─ src/
│  │  ├─ views/         # Dashboard / Charts / ProcessTree / Treemap
│  │  ├─ components/    # GlassPanel / Gauge / Sparkline ...
│  │  └─ styles/glass.css
│  └─ package.json      # React + TS + Vite + uPlot
└─ wails.json
```

构建产物：单个 `Moni.exe`（约 10-20MB），无运行时依赖。

## 7. 开发里程碑

1. **M1 采集内核**：Go 采集器 + 推送事件，命令行验证数据正确性（与任务管理器对照）
2. **M2 骨架界面**：Wails 集成 + 玻璃风格基础组件 + 仪表盘
3. **M3 曲线 + 进程树**：uPlot 曲线、虚拟滚动进程表格
4. **M4 Treemap**：canvas 树图 + 点击下钻
5. **M5 打磨**：设置持久化、降频策略、打包单 exe

## 8. 已知边界

- 不支持进程操作（产品定位即查看器）
- v1 网络仅全局；按进程网络需 ETW，留 v2
- 需要管理员权限的场景：部分系统进程（如 Secure System）的详情读取受限，显示为"<受限>"即可，不影响整体
