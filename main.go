package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:     "Moni",
		Width:     1180,
		Height:    800,
		MinWidth:  960,
		MinHeight: 640,
		Frameless: true, // 去掉系统标题栏，由前端 topbar 提供拖拽区与窗口控制按钮
		// 单实例：第二次启动直接退出，并把已有窗口拉到前台
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId:               "Moni-flynn-desu-single-instance-7c3a92",
			OnSecondInstanceLaunch: app.onSecondInstance,
		},
		// 透明窗口方案（圆角）会导致边缘角状伪影且拖拽失效，已回退为不透明窗口
		BackgroundColour: &options.RGBA{R: 10, G: 12, B: 20, A: 1},
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
