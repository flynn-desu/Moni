package collector

import (
	"errors"
	"sort"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

// x/sys/windows 未封装 MEMORYSTATUSEX，这里自行声明（与 Win32 布局一致）。
var (
	kernel32                 = windows.NewLazySystemDLL("kernel32.dll")
	procGlobalMemoryStatusEx = kernel32.NewProc("GlobalMemoryStatusEx")
	procGetSystemTimes       = kernel32.NewProc("GetSystemTimes")
)

type memoryStatusEx struct {
	Length               uint32
	MemoryLoad           uint32
	TotalPhys            uint64
	AvailPhys            uint64
	TotalPageFile        uint64
	AvailPageFile        uint64
	TotalVirtual         uint64
	AvailVirtual         uint64
	AvailExtendedVirtual uint64
}

func globalMemoryStatusEx(ms *memoryStatusEx) error {
	ms.Length = uint32(unsafe.Sizeof(*ms))
	r, _, _ := procGlobalMemoryStatusEx.Call(uintptr(unsafe.Pointer(ms)))
	if r == 0 {
		return errors.New("GlobalMemoryStatusEx failed")
	}
	return nil
}

// collectMemory 物理内存 + 提交内存（GlobalMemoryStatusEx）。
func (m *Manager) collectMemory(s *Sample) {
	var ms memoryStatusEx
	if err := globalMemoryStatusEx(&ms); err != nil {
		return
	}
	s.Memory.Total = ms.TotalPhys
	s.Memory.Used = ms.TotalPhys - ms.AvailPhys
	if ms.TotalPhys > 0 {
		s.Memory.UsedPercent = float64(s.Memory.Used) / float64(ms.TotalPhys) * 100
	}
	s.Memory.CommitTotal = ms.TotalPageFile - ms.AvailPageFile
	s.Memory.CommitLimit = ms.TotalPageFile
	m.gpu.physTotal = ms.TotalPhys
}

// collectDisks 物理磁盘读写字节速率 + 活跃时间。
func (m *Manager) collectDisks(s *Sample) {
	if s.Warmup {
		return
	}
	reads, err1 := m.cDiskR.ReadAll()
	writes, err2 := m.cDiskW.ReadAll()
	idles, err3 := m.cDiskIdle.ReadAll()
	if err1 != nil || err2 != nil || err3 != nil {
		return
	}
	byName := map[string]*DiskSys{}
	get := func(name string) *DiskSys {
		d, ok := byName[name]
		if !ok {
			d = &DiskSys{Name: name}
			byName[name] = d
		}
		return d
	}
	for _, it := range reads {
		if skipDiskInstance(it.Name) {
			continue
		}
		get(it.Name).ReadBps = it.Value
	}
	for _, it := range writes {
		if skipDiskInstance(it.Name) {
			continue
		}
		get(it.Name).WriteBps = it.Value
	}
	for _, it := range idles {
		if skipDiskInstance(it.Name) {
			continue
		}
		get(it.Name).ActivePercent = clampPct(100 - it.Value)
	}
	// 稳定排序：map 遍历无序，按名称（盘符）排序保证展示顺序稳定
	disks := make([]DiskSys, 0, len(byName))
	for _, d := range byName {
		disks = append(disks, *d)
	}
	sort.Slice(disks, func(i, j int) bool { return disks[i].Name < disks[j].Name })
	s.Disks = append(s.Disks, disks...)
}

// collectNet 全局上下行速率（排除回环/隧道虚拟接口）。
func (m *Manager) collectNet(s *Sample) {
	if s.Warmup {
		return
	}
	recv, err1 := m.cNetRecv.ReadAll()
	sent, err2 := m.cNetSent.ReadAll()
	if err1 != nil || err2 != nil {
		return
	}
	for _, it := range recv {
		if skipNetInstance(it.Name) {
			continue
		}
		s.Net.RecvBps += it.Value
	}
	for _, it := range sent {
		if skipNetInstance(it.Name) {
			continue
		}
		s.Net.SentBps += it.Value
	}
}

// collectCPU 全局 CPU 占用：GetSystemTimes 相邻两轮差分。
// Windows 下 kernel 时间含 idle，busy = user + kernel - idle，total = user + kernel，
// 结果即"按所有逻辑核心归一化"的全机占用（0-100），与任务管理器口径一致。
func (m *Manager) collectCPU(s *Sample) {
	var idle, kernel, user windows.Filetime
	r, _, _ := procGetSystemTimes.Call(
		uintptr(unsafe.Pointer(&idle)),
		uintptr(unsafe.Pointer(&kernel)),
		uintptr(unsafe.Pointer(&user)))
	if r == 0 {
		return
	}
	cur := [3]uint64{
		uint64(idle.HighDateTime)<<32 | uint64(idle.LowDateTime),
		uint64(kernel.HighDateTime)<<32 | uint64(kernel.LowDateTime),
		uint64(user.HighDateTime)<<32 | uint64(user.LowDateTime),
	}
	if p := m.cpuPrev; p != nil {
		total := float64(cur[1]-p[1]) + float64(cur[2]-p[2])
		if total > 0 {
			busy := total - float64(cur[0]-p[0])
			s.CPU.UsedPercent = clampPct(busy / total * 100)
		}
	}
	m.cpuPrev = &cur
}

func skipDiskInstance(name string) bool { return name == "_Total" }

func skipNetInstance(name string) bool {
	n := strings.ToLower(name)
	return strings.Contains(n, "loopback") ||
		strings.Contains(n, "isatap") ||
		strings.Contains(n, "teredo") ||
		strings.Contains(n, "local area connection*") ||
		strings.Contains(n, "bluetooth")
}

func clampPct(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}
