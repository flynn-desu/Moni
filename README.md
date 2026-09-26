# Moni

<p align="center">
  <img src="build/appicon.png" width="128" alt="Moni"/>
</p>

**Moni** 是一个轻量级的 Windows 系统监视器——液态玻璃风格的"任务管理器替代品"。
只读查看，不做任何进程操作；比系统自带任务管理器更轻、更流畅。

## 特性

- **六维实时监控**：CPU / 内存 / GPU / 显存 / 磁盘 / 网络，数据与任务管理器同源（PDH / NtQuerySystemInformation），采集自耗 < 10ms
- **进程树**：按父子关系聚合占用（子进程向上累加，与任务管理器分组口径一致），可展开、虚拟滚动、列排序
- **矩形树图**：squarified 布局，面积 ∝ 占用，支持 CPU/内存/GPU/显存/磁盘五种指标切换与点击下钻
- **历史曲线**：300 点环形缓冲（1s 间隔约 5 分钟），1/5 分钟窗口切换，GPU 引擎分路（3D/Copy/CUDA/编解码）
- **液态玻璃 UI**：暗色 / 浅色主题，树图六套配色，存储/网络单位自定义（智能 / 固定），采集间隔 500ms~5s 可调
- **轻量**：单文件 ~12MB 无运行时依赖，自身内存 ~50MB；窗口失焦自动降频至 5s

## 下载

从 [Releases](https://github.com/flynn-desu/Moni/releases) 获取 `Moni.exe`（单文件绿色版，无需安装）。
目标系统需要 WebView2 运行时（Windows 11 自带；Windows 10 一般随 Edge 更新自带，缺失时首次启动会自动引导安装）。

## 从源码构建

依赖：Go 1.25+、Node 20+、[Wails v2 CLI](https://wails.io)（`go install github.com/wailsapp/wails/v2/cmd/wails@latest`）

```bash
wails build -webview2 embed -ldflags "-s -w"
# 产物：build/bin/Moni.exe
```

开发调试：

```bash
wails dev          # 热重载；浏览器打开 http://localhost:34115 可用真实后端联调
cd frontend && npm run dev   # 纯前端调试（自动切换 Mock 数据驱动）
```

## 技术要点

- 采集全部在 Go 原生完成，不派生子进程：`NtQuerySystemInformation` 一次取回全部进程信息，PDH 直读取 GPU 引擎/显存/磁盘/网卡计数器，`GetSystemTimes`/`GlobalMemoryStatusEx` 取全局 CPU/内存
- 前端只消费事件推送，不做轮询；曲线用 uPlot（canvas），树图手写 squarified（canvas），进程表虚拟滚动
- Wails v2 + React + TypeScript，WebView2 渲染

## 已知边界

- 只读监控，不提供结束进程/调优先级等操作
- v1 网络仅全局速率；按进程统计网络需 ETW，留作后续版本
- 部分受系统保护进程显示为 `<受限>`

## License

[MIT](LICENSE) © flynn-desu
