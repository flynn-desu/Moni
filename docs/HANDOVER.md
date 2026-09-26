# Moni 开发交接文档

> 更新时间：2026-09-26 18:00 ｜ 状态：**v1.0.2 已发布**（GitHub Release），`main` 分支与远程同步，本地工作区干净
> 仓库：https://github.com/flynn-desu/Moni ｜ 配套阅读：[DESIGN.md](DESIGN.md)（需求与总体设计）

## 1. 项目概览

**Moni**：轻量级 Windows 系统监视器，液态玻璃风格（参考 Apple Liquid Glass，WWDC 2025）。Go + Wails v2 + React/TS + WebView2，单文件 ~12MB 无运行时依赖。只读监控（不做进程操作）。

| 模块 | 说明 |
|---|---|
| 采集内核 `internal/collector` | NtQuerySystemInformation（进程）+ 自封装 PDH（GPU/磁盘/网卡）+ GetSystemTimes/GlobalMemoryStatusEx（CPU/内存），单轮 5-8ms |
| 历史缓冲 `internal/store` | 300 点聚合环形缓冲（不含进程列表），前端启动拉全量 + 事件增量 |
| 设置 `internal/config` | %APPDATA%\Moni\config.json，字段见 §5 |
| 前端 `frontend/src` | React+TS；`driver.ts` 检测 `window.go` 缺失时自动切 Mock（纯浏览器可调试全部视图）；`tree.ts` 组树聚合；视图：Dashboard/Charts/ProcessTree/Treemap/Host |

当前进度：v1.0.0 首发 → v1.0.1（explorer 提升 / I/O 口径改名 / 暂停按钮）→ v1.0.2（背景三选 / 自定义壁纸 / 磨砂程度滑杆 / 内存数值显示 / 主机页版本号）。全部已发布。

## 2. 环境与常用命令

- **Go 1.27.1**：`C:\Users\hfy\.workbuddy\binaries\go\go\bin\go.exe`（不在 PATH，需 `export PATH="/c/Users/hfy/.workbuddy/binaries/go/go/bin:$PATH"`）
- **Wails CLI v2.16.0**：`C:\Users\hfy\go\bin\wails.exe`
- **NSIS**：`C:\Program Files (x86)\NSIS\`（winget 装的；重装系统后 `winget install NSIS.NSIS`）
- **Node 22** 系统已有；GOPROXY 已持久化 goproxy.cn；clash 代理 7890（github release 下载直连会被干扰，走代理或 API）
- ⚠️ **wails dev 后台运行时不要接 `| head`**（管道破裂会连带杀掉内部 vite，曾踩过）

```bash
# 开发调试（真实后端）：浏览器开 http://localhost:34115，可交互验证全部视图
wails dev -browser -nocolour
# 纯前端调试（自动切 Mock 驱动）
cd frontend && npm run dev
# 构建单 exe / 安装包
wails build -webview2 embed -ldflags "-s -w"
wails build -nsis -installscope user -webview2 embed -ldflags "-s -w"   # 需 NSIS 在 PATH
# 改了 Go 绑定签名后
wails generate module   # 重新生成 frontend/wailsjs，并同步 frontend/src/types.ts
```

## 3. 项目结构

```
├─ main.go / app.go            # Wails 壳；app.go 持有 Manager/Store/Config，绑定 15 个方法；AppVersion 常量（发版时更新）
├─ cmd/harness/main.go         # CLI 验证工具（对照任务管理器核对数据）
├─ internal/
│  ├─ pdh/pdh.go               # PDH 封装（英文路径 + 通配符数组，指针传参！）
│  ├─ collector/               # 采集内核（types.go JSON tag = 前后端契约；host.go 主机信息）
│  ├─ store/store.go           # 300 点环形缓冲
│  └─ config/config.go         # 设置持久化 + SaveWallpaper/WallpaperData
├─ frontend/src/
│  ├─ styles/glass.css         # Liquid Glass 设计系统（全 CSS 变量，明暗主题；--blur 卡片磨砂半径）
│  ├─ types.ts / format.ts / prefs.ts / driver.ts / tree.ts
│  ├─ components/              # Gauge(仪表) / GlassSelect(自绘下拉) / icons(手写 SVG)
│  └─ views/                   # Dashboard / Charts / ProcessTree / Treemap / Host
├─ docs/DESIGN.md、HANDOVER.md
├─ logo.png                    # 应用图标源（用户绘制）；build/appicon.png = 1024 裁方版
└─ build/windows/icon.ico      # ⚠️ 已 gitignore：由 wails 从 appicon.png 生成
```

## 4. ⚠️ 关键踩坑（新会话必读）

1. **PDH**：不用 perflib 库（本机按对象名查询全空）；自封装 API 走 `PdhAddEnglishCounterW` + 通配符 `(*)` + `PdhGetFormattedCounterArrayW`（x64 项布局 24 字节）。**第 3/4 参数必须传指针**，按值传 → 所有通配符计数器静默返回空
2. **通配符数组同名实例不带 #N 后缀**：多实例同名进程（WorkBuddy×10）会互相覆盖，必须与 `ID Process` 数组**按下标对齐**（进程数据现走 NtQSI，此机制对其他 PDH 对象仍适用）
3. **每进程显存用 `\GPU Process Memory(*)\Dedicated|Shared Usage`**：`GPU Adapter Memory` 本机只有全卡 `luid_` 实例（无 pid），仅用于全卡总量；全卡利用率 = 各引擎峰值口径
4. **Process 对象 `_Total` 实例 ID=0**：不跳过会把全机总量挂到 pid 0
5. **⚠️ nil 切片 JSON 序列化为 null**：warmup 轮 `Disks=nil` 曾导致前端 `s.disks.map` 抛错、React 整树卸载（黑屏）。已三重防御：后端初始化空切片 + 前端 onSample 归一化 + main.tsx 错误边界（渲染异常显示红字而非黑屏）
6. **进程采集走 `NtQuerySystemInformation(5)`**：一次拿全 名称/PPID/CPU时间/IO计数/工作集/私有工作集/提交，370 进程 5-8ms（gopsutil 要 30ms）。x64 结构体 256 字节（host 断言），见 process.go
7. **进程"磁盘"列实为 IO 计数口径**：`IO_COUNTERS` 的写入字节含共享内存/管道等非磁盘写入（浏览器/GPU 进程严重虚高，曾让用户误以为每秒写盘 5MB）。普通权限拿不到 ETW 真磁盘口径 → UI 列名用「I/O」并注明。表头 tooltip 必须保留
8. **进程树已剪掉 explorer.exe**（Windows shell，任务栏启动的应用都挂它下面）：其子进程提升到顶层展示，`tree.ts SHELL_PROCS` 可扩展
9. **图标**：wails 只在 `build/windows/icon.ico` 缺失时从 `build/appicon.png` 重新生成 → **换图标必须先删 icon.ico**（已 gitignore）。图标源 = 根目录 `logo.png`（用户绘制），处理：居中裁方 → 1024×1024 → `build/appicon.png`
10. **长跑的 vite dev server 内存会持续增长**（HMR 状态累积，曾达 17GB 拖垮系统）——wails dev 用完记得关
11. **WebView2 数据目录**在 `%APPDATA%\Moni.exe\EBWebView`（NSIS 卸载会删它）；应用配置在 `%APPDATA%\Moni\config.json`（升级/卸载均保留）
12. **NSIS 安装器不自动关闭运行中的应用**：覆盖安装前需先退出 Moni，否则报"文件被占用"

## 5. 发布流程（GitHub）

1. 更新 `app.go` 的 `AppVersion` 常量（主机页会显示）
2. `wails build -nsis -installscope user -webview2 embed -ldflags "-s -w"` → `build/bin/Moni-amd64-installer.exe` + `Moni.exe`
3. 便携包：PowerShell `Compress-Archive Moni.exe → Moni-vX.Y.Z-windows-portable.zip`
4. `git push` + `git tag vX.Y.Z && git push origin vX.Y.Z`
5. Release 用 REST API（gh CLI 未装；凭据用 `git credential fill` 从 Windows 凭据管理器取 GitHub Desktop 存的 token）：POST `/repos/flynn-desu/Moni/releases` 创建（body 用 **JSON 文件** 传，`-d @file`），再 POST `uploads.github.com/.../assets?name=...` 传两个资产。参考上一次发布的命令模式

⚠️ **用户明确要求：push 前必须先跟用户确认**

## 6. 设置项参考（config.json）

| 字段 | 取值 |
|---|---|
| intervalMs | 500/1000/2000/5000 |
| alwaysOnTop | 窗口置顶 |
| storageUnit / netUnit | auto/MB/GB、auto/KB/MB/GB（状态栏自身内存固定智能单位） |
| mapTheme | aurora/teal/mono/rainbow/sunset/candy |
| uiTheme | dark（默认）/light |
| bgMode | solid（默认，纯黑灰）/aurora/image |
| wallpaperPath | 自定义壁纸落地路径（%APPDATA%\Moni\wallpaper.*） |
| blur | 卡片毛玻璃半径 0-40px（CSS 变量 --blur） |

绑定方法（app.go）：GetConfig/SetInterval/SetThrottled/SetUnits/SetMapTheme/SetUiTheme/SetBgMode/SetBlur/SelectWallpaper/ClearWallpaper/GetWallpaperData/GetHistory/GetHostInfo。

## 7. 验证方式

- **wails dev -browser** → IAB 打开 localhost:34115（真实后端桥接），逐视图截图验收；注意浏览器失焦会触发降频（采集变 5s/2s），等数据时多等几秒
- 原生对话框（如壁纸文件选择）无法自动化，真机手动验证
- 数据准确性基准：v1.0.0 发布前已与任务管理器逐项同屏核对通过（CPU/内存/GPU/显存/磁盘/网络/进程树）

## 8. 已知边界与待办候选

- 只读监控，无进程操作；网络仅全局速率（按进程需 ETW，要管理员权限）
- 待办候选：开机自启、代码签名（消除 SmartScreen）、自动更新、README 截图、默认图标在文件管理器的缓存偶发不刷新（ ie4uinit -show / 重启 explorer）
- 用户偏好：文档用 Markdown；无必要不产出 HTML/可视化；**push 前确认**
