package collector

import (
	"strconv"
	"strings"

	"golang.org/x/sys/windows/registry"
)

// gpuInfo 缓存显卡静态信息（总量/名称，注册表读取一次）。
type gpuInfo struct {
	adapterName  string
	vramDedTotal uint64
	physTotal    uint64
}

// loadAdapterInfo 从注册表读取显卡名称与专用显存总量（读不到不影响运行）。
func (g *gpuInfo) loadAdapterInfo() {
	const classKey = `SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}`
	for _, sub := range []string{"0000", "0001", "0002", "0003"} {
		k, err := registry.OpenKey(registry.LOCAL_MACHINE, classKey+`\`+sub, registry.QUERY_VALUE)
		if err != nil {
			continue
		}
		size, _, err := k.GetIntegerValue("HardwareInformation.qwMemorySize")
		if err == nil && size > 0 && g.vramDedTotal == 0 {
			g.vramDedTotal = size
		}
		if name, _, err := k.GetStringValue("DriverDesc"); err == nil && g.adapterName == "" {
			g.adapterName = name
		}
		k.Close()
	}
}

// collectGPU 解析 GPU Engine / GPU Adapter Memory 并按 PID 聚合。
func (m *Manager) collectGPU(s *Sample) {
	if s.Warmup {
		return // 速率类首轮无有效差分
	}

	perEngine := map[string]float64{}
	var sysDed, sysShr uint64

	// GPU 利用率：实例 pid_<pid>_luid_.._eng_<n>_engtype_<type>
	if items, err := m.cGPUUtil.ReadAll(); err == nil {
		for _, it := range items {
			pid, eng := parseEngineInstance(it.Name)
			if eng == "" || it.Value <= 0 {
				continue
			}
			perEngine[eng] += it.Value
			if pid > 0 {
				m.putPending(pid, func(pd *procPD) { pd.gpu += it.Value })
			}
		}
	}

	// 全卡利用率：任务管理器取各引擎类型的峰值
	var maxEng float64
	for _, v := range perEngine {
		if v > maxEng {
			maxEng = v
		}
	}

	// 每进程显存：GPU Process Memory（实例带 pid_ 前缀）。
	// 注意本机 GPU Adapter Memory 无 pid 实例（只有全卡 luid_ 实例），不能用于按进程拆分。
	if items, err := m.cProcVramDed.ReadAll(); err == nil {
		for _, it := range items {
			if pid, ok := instancePid(it.Name); ok {
				m.putPending(pid, func(pd *procPD) { pd.vramDed += uint64(it.Value) })
			}
		}
	}
	if items, err := m.cProcVramShr.ReadAll(); err == nil {
		for _, it := range items {
			if pid, ok := instancePid(it.Name); ok {
				m.putPending(pid, func(pd *procPD) { pd.vramShr += uint64(it.Value) })
			}
		}
	}

	// 全卡显存用量：GPU Adapter Memory 的 luid_（无 pid）实例
	if items, err := m.cVramDed.ReadAll(); err == nil {
		for _, it := range items {
			if _, ok := instancePid(it.Name); !ok && strings.Contains(it.Name, "phys_") {
				sysDed += uint64(it.Value)
			}
		}
	}
	if items, err := m.cVramShr.ReadAll(); err == nil {
		for _, it := range items {
			if _, ok := instancePid(it.Name); !ok && strings.Contains(it.Name, "phys_") {
				sysShr += uint64(it.Value)
			}
		}
	}

	s.GPU.UsedPercent = maxEng
	s.GPU.ByEngine = perEngine
	s.GPU.VramDedicatedUsed = sysDed
	s.GPU.VramSharedUsed = sysShr
	s.GPU.VramDedicatedTotal = m.gpu.vramDedTotal
	s.GPU.VramSharedTotal = m.gpu.vramSharedTotal()
}

// parseEngineInstance 解析 GPU Engine 实例名 → (pid, 引擎类型小写)
func parseEngineInstance(name string) (pid int32, eng string) {
	pid, _ = instancePid(name)
	if k := strings.Index(name, "engtype_"); k >= 0 {
		eng = strings.ToLower(name[k+len("engtype_"):])
	}
	return
}

// instancePid 从 "pid_1234_..." 提取 pid
func instancePid(name string) (int32, bool) {
	if !strings.HasPrefix(name, "pid_") {
		return 0, false
	}
	rest := name[len("pid_"):]
	if j := strings.IndexByte(rest, '_'); j > 0 {
		if v, err := strconv.Atoi(rest[:j]); err == nil {
			return int32(v), true
		}
	}
	return 0, false
}

// vramSharedTotal 共享显存上限 ≈ 物理内存一半（任务管理器同口径）
func (g *gpuInfo) vramSharedTotal() uint64 {
	return g.physTotal / 2
}
