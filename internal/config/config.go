// Package config 处理设置持久化（JSON 文件，位于用户配置目录）。
package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Config 当前设置。IntervalMs 合法值：500/1000/2000/5000。
// StorageUnit: auto|MB|GB；NetUnit: auto|KB|MB|GB；MapTheme 见 MapThemes；UiTheme: dark|light。
type Config struct {
	IntervalMs  int    `json:"intervalMs"`
	AlwaysOnTop bool   `json:"alwaysOnTop"`
	StorageUnit string `json:"storageUnit"`
	NetUnit     string `json:"netUnit"`
	MapTheme    string `json:"mapTheme"`
	UiTheme     string `json:"uiTheme"`
}

// ValidIntervals 可选采集间隔（毫秒）。
var ValidIntervals = []int{500, 1000, 2000, 5000}

var (
	ValidStorageUnits = []string{"auto", "MB", "GB"}
	ValidNetUnits     = []string{"auto", "KB", "MB", "GB"}
	MapThemes         = []string{"aurora", "teal", "mono", "rainbow", "sunset", "candy"}
	ValidUiThemes     = []string{"dark", "light"}
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

// ValidStorage / ValidNet / ValidTheme / ValidUiTheme 合法性检查。
func ValidStorage(s string) bool { return inList(s, ValidStorageUnits) }
func ValidNet(s string) bool     { return inList(s, ValidNetUnits) }
func ValidTheme(s string) bool   { return inList(s, MapThemes) }
func ValidUiTheme(s string) bool { return inList(s, ValidUiThemes) }

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
	c := &Config{IntervalMs: 1000, StorageUnit: "auto", NetUnit: "auto", MapTheme: "aurora", UiTheme: "dark"}
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
