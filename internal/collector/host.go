package collector

import (
	"os"
	"runtime"
	"strings"

	"golang.org/x/sys/windows/registry"
)

// HostInfo 静态主机信息（收集一次，前端"主机"页展示）。
type HostInfo struct {
	Hostname   string `json:"hostname"`
	OS         string `json:"os"`
	OSVersion  string `json:"osVersion"`
	Arch       string `json:"arch"`
	CPUName    string `json:"cpuName"`
	CPUCores   int    `json:"cpuCores"`
	MemTotal   uint64 `json:"memTotal"`
	GPUName    string `json:"gpuName"`
	VramTotal  uint64 `json:"vramTotal"`
	GoVersion  string `json:"goVersion"`
	AppVersion string `json:"appVersion"`
}

// GetHostInfo 收集主机静态信息；显卡名/显存总量来自已缓存的 gpuInfo。
func GetHostInfo(gpuName string, vramTotal uint64) HostInfo {
	h := HostInfo{
		Arch:      runtime.GOARCH,
		CPUCores:  runtime.NumCPU(),
		GPUName:   gpuName,
		VramTotal: vramTotal,
		GoVersion: runtime.Version(),
	}
	if n, err := os.Hostname(); err == nil {
		h.Hostname = n
	}
	if k, err := registry.OpenKey(registry.LOCAL_MACHINE,
		`HARDWARE\DESCRIPTION\System\CentralProcessor\0`, registry.QUERY_VALUE); err == nil {
		name, _, _ := k.GetStringValue("ProcessorNameString")
		h.CPUName = strings.TrimSpace(name)
		k.Close()
	}
	if k, err := registry.OpenKey(registry.LOCAL_MACHINE,
		`SOFTWARE\Microsoft\Windows NT\CurrentVersion`, registry.QUERY_VALUE); err == nil {
		pn, _, _ := k.GetStringValue("ProductName")
		dv, _, _ := k.GetStringValue("DisplayVersion")
		cb, _, _ := k.GetStringValue("CurrentBuildNumber")
		h.OS = pn
		h.OSVersion = strings.TrimSpace(strings.TrimSpace(dv) + " · Build " + cb)
		k.Close()
	}
	var ms memoryStatusEx
	if globalMemoryStatusEx(&ms) == nil {
		h.MemTotal = ms.TotalPhys
	}
	return h
}
