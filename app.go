package main

import (
	"context"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"Moni/internal/collector"
	"Moni/internal/config"
	"Moni/internal/store"
)

// App Wails 应用：持有采集管理器、历史缓冲与设置，绑定给前端调用。
type App struct {
	ctx   context.Context
	mgr   *collector.Manager
	store *store.Store
	cfg   *config.Config
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		store: store.New(300),
		cfg:   config.Load(),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	mgr, err := collector.NewManager(time.Duration(a.cfg.IntervalMs)*time.Millisecond, a.onSample)
	if err != nil {
		runtime.LogErrorf(ctx, "采集器初始化失败: %v", err)
		return
	}
	a.mgr = mgr
	mgr.Start()
}

// shutdown 停止采集线程。
func (a *App) shutdown(ctx context.Context) {
	if a.mgr != nil {
		a.mgr.Stop()
	}
}

// onSample 每轮采样：写入环形缓冲并推送给前端（推送，非轮询）。
func (a *App) onSample(s *collector.Sample) {
	a.store.Push(s)
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "sample", s)
	}
}

// GetHistory 返回全部历史点（旧→新），前端启动时拉取一次，之后靠事件增量。
func (a *App) GetHistory() []store.Point {
	return a.store.All()
}

// GetConfig 返回当前设置。
func (a *App) GetConfig() config.Config {
	return *a.cfg
}

// SetInterval 修改采集间隔并持久化（合法值 500/1000/2000/5000 毫秒）。
func (a *App) SetInterval(ms int) {
	if !config.Valid(ms) {
		return
	}
	a.cfg.IntervalMs = ms
	a.cfg.Save()
	if a.mgr != nil {
		a.mgr.SetInterval(time.Duration(ms) * time.Millisecond)
	}
}

// SetThrottled 失焦降频（运行时行为，不写入配置）：true 降到 5s，false 恢复用户间隔。
func (a *App) SetThrottled(on bool) {
	if a.mgr == nil {
		return
	}
	if on {
		a.mgr.SetInterval(5 * time.Second)
	} else {
		a.mgr.SetInterval(time.Duration(a.cfg.IntervalMs) * time.Millisecond)
	}
}

// SetUnits 设置数值单位显示（storage: auto|MB|GB，net: auto|KB|MB|GB）并持久化。
func (a *App) SetUnits(storage, net string) {
	if config.ValidStorage(storage) {
		a.cfg.StorageUnit = storage
	}
	if config.ValidNet(net) {
		a.cfg.NetUnit = net
	}
	a.cfg.Save()
}

// SetMapTheme 设置树图配色方案并持久化。
func (a *App) SetMapTheme(theme string) {
	if !config.ValidTheme(theme) {
		return
	}
	a.cfg.MapTheme = theme
	a.cfg.Save()
}

// SetUiTheme 设置界面明暗主题（dark|light）并持久化。
func (a *App) SetUiTheme(theme string) {
	if !config.ValidUiTheme(theme) {
		return
	}
	a.cfg.UiTheme = theme
	a.cfg.Save()
}

// GetHostInfo 返回主机静态信息（CPU/显卡/内存/系统，启动后固定）。
func (a *App) GetHostInfo() collector.HostInfo {
	gpuName, vram := "", uint64(0)
	if a.mgr != nil {
		gpuName, vram = a.mgr.GPUInfo()
	}
	return collector.GetHostInfo(gpuName, vram)
}
