// Package config 处理设置持久化（JSON 文件，位于用户配置目录）。
package config

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Config 当前设置。IntervalMs 合法值：500/1000/2000/5000。
// StorageUnit: auto|MB|GB；NetUnit: auto|KB|MB|GB；MapTheme 见 MapThemes；UiTheme: dark|light；
// BgMode: solid|aurora|image；Blur: 卡片毛玻璃模糊半径 0-40px。
type Config struct {
	IntervalMs    int    `json:"intervalMs"`
	AlwaysOnTop   bool   `json:"alwaysOnTop"`
	StorageUnit   string `json:"storageUnit"`
	NetUnit       string `json:"netUnit"`
	MapTheme      string `json:"mapTheme"`
	UiTheme       string `json:"uiTheme"`
	BgMode        string `json:"bgMode"`
	WallpaperPath string `json:"wallpaperPath"`
	Blur          int    `json:"blur"`
}

// ValidIntervals 可选采集间隔（毫秒）。
var ValidIntervals = []int{500, 1000, 2000, 5000}

var (
	ValidStorageUnits = []string{"auto", "MB", "GB"}
	ValidNetUnits     = []string{"auto", "KB", "MB", "GB"}
	MapThemes         = []string{"aurora", "teal", "mono", "rainbow", "sunset", "candy"}
	ValidUiThemes     = []string{"dark", "light"}
	ValidBgModes      = []string{"solid", "aurora", "image"}
)

func inList(v string, list []string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}

// Valid 判断间隔毫秒值是否合法。
func Valid(ms int) bool {
	for _, v := range ValidIntervals {
		if v == ms {
			return true
		}
	}
	return false
}

// ValidStorage / ValidNet / ValidTheme / ValidUiTheme / ValidBgMode 合法性检查。
func ValidStorage(s string) bool { return inList(s, ValidStorageUnits) }
func ValidNet(s string) bool     { return inList(s, ValidNetUnits) }
func ValidTheme(s string) bool   { return inList(s, MapThemes) }
func ValidUiTheme(s string) bool { return inList(s, ValidUiThemes) }
func ValidBgMode(s string) bool  { return inList(s, ValidBgModes) }

// defaults 填充缺省值。
func (c *Config) defaults() {
	if c.StorageUnit == "" {
		c.StorageUnit = "auto"
	}
	if c.NetUnit == "" {
		c.NetUnit = "auto"
	}
	if c.MapTheme == "" {
		c.MapTheme = "aurora"
	}
	if c.UiTheme == "" {
		c.UiTheme = "dark"
	}
	if c.BgMode == "" {
		c.BgMode = "solid"
	}
	if c.Blur <= 0 || c.Blur > 40 {
		c.Blur = 30
	}
}

// path 返回配置文件路径：%APPDATA%/Moni/config.json。
func path() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "Moni", "config.json"), nil
}

// Load 读取配置；文件不存在或损坏时返回默认值。
func Load() *Config {
	c := &Config{IntervalMs: 1000, StorageUnit: "auto", NetUnit: "auto", MapTheme: "aurora", UiTheme: "dark", BgMode: "solid", Blur: 30}
	p, err := path()
	if err != nil {
		return c
	}
	data, err := os.ReadFile(p)
	if err != nil {
		return c
	}
	var disk Config
	if json.Unmarshal(data, &disk) == nil && Valid(disk.IntervalMs) {
		c.IntervalMs = disk.IntervalMs
		c.AlwaysOnTop = disk.AlwaysOnTop
		if ValidStorage(disk.StorageUnit) {
			c.StorageUnit = disk.StorageUnit
		}
		if ValidNet(disk.NetUnit) {
			c.NetUnit = disk.NetUnit
		}
		if ValidTheme(disk.MapTheme) {
			c.MapTheme = disk.MapTheme
		}
		if ValidUiTheme(disk.UiTheme) {
			c.UiTheme = disk.UiTheme
		}
		if ValidBgMode(disk.BgMode) {
			c.BgMode = disk.BgMode
		}
		c.WallpaperPath = disk.WallpaperPath
		if disk.Blur > 0 && disk.Blur <= 40 {
			c.Blur = disk.Blur
		}
	}
	c.defaults()
	return c
}

// Save 写入配置文件（失败静默，下次启动回落默认值）。
func (c *Config) Save() {
	p, err := path()
	if err != nil {
		return
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(p, data, 0o644)
}

// SaveWallpaper 把用户选择的壁纸复制到配置目录（避免源文件移动后失效），返回落地路径。
func SaveWallpaper(src string) (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir = filepath.Join(dir, "Moni")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	ext := strings.ToLower(filepath.Ext(src))
	if ext == "" {
		ext = ".png"
	}
	dst := filepath.Join(dir, "wallpaper"+ext)
	in, err := os.Open(src)
	if err != nil {
		return "", err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return "", err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return "", err
	}
	return dst, nil
}

// WallpaperData 读取壁纸文件并编码为 data URL（前端背景直接可用）；无壁纸返回空串。
func WallpaperData(p string) string {
	if p == "" {
		return ""
	}
	data, err := os.ReadFile(p)
	if err != nil {
		return ""
	}
	var mime string
	switch strings.ToLower(filepath.Ext(p)) {
	case ".png":
		mime = "image/png"
	case ".jpg", ".jpeg":
		mime = "image/jpeg"
	case ".webp":
		mime = "image/webp"
	case ".bmp":
		mime = "image/bmp"
	case ".gif":
		mime = "image/gif"
	default:
		return ""
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data)
}
