// Package collector 实现 Moni 的数据采集内核。
//
// 设计：全部采集在后台单线程内完成，通过回调推送快照，前端只消费不轮询。
// 数据源：
//   - gopsutil: 进程枚举/父子关系/每进程 CPU 时间/IO 计数
//   - PDH: GPU 利用率/显存/每进程私有内存/物理磁盘速率/网卡速率 (与任务管理器同源)
//   - GlobalMemoryStatusEx: 物理内存与提交内存
package collector

// Sample 是一次完整采集快照，JSON 直接推给前端。
type Sample struct {
	Ts        int64         `json:"ts"` // Unix 毫秒
	Interval  float64       `json:"intervalSec"`
	CostMs    float64       `json:"collectMs"` // 本轮采集耗时（自监控）
	Warmup    bool          `json:"warmup"`    // 首轮：速率类数据未就绪
	CPU       CPUSys        `json:"cpu"`
	Memory    MemSys        `json:"mem"`
	Net       NetSys        `json:"net"`
	GPU       GPUSys        `json:"gpu"`
	Disks     []DiskSys     `json:"disks"`
	Processes []ProcessInfo `json:"processes"`
	Self      SelfInfo      `json:"self"` // Moni 自身占用（状态栏展示）
}

// SelfInfo 采集进程自身的资源占用。
type SelfInfo struct {
	PID     int32   `json:"pid"`
	CPUNorm float64 `json:"cpuNorm"` // 归一化 CPU 占用 (0-100)
	MemWS   uint64  `json:"memWs"`   // 工作集字节
}

type CPUSys struct {
	UsedPercent float64 `json:"usedPercent"` // 全机 CPU 占用 %
	Cores       int     `json:"cores"`
}

type MemSys struct {
	Total       uint64  `json:"total"`
	Used        uint64  `json:"used"`
	UsedPercent float64 `json:"usedPercent"`
	CommitTotal uint64  `json:"commitTotal"`
	CommitLimit uint64  `json:"commitLimit"`
}

type NetSys struct {
	RecvBps float64 `json:"recvBps"`
	SentBps float64 `json:"sentBps"`
}

type GPUSys struct {
	UsedPercent        float64            `json:"usedPercent"` // 全卡利用率 (取各引擎类型峰值，与任务管理器口径一致)
	ByEngine           map[string]float64 `json:"byEngine"`    // 引擎类型(小写, 如 3d/copy/videodecode) -> %
	AdapterName        string             `json:"adapterName"`
	VramDedicatedUsed  uint64             `json:"vramDedicatedUsed"`
	VramDedicatedTotal uint64             `json:"vramDedicatedTotal"`
	VramSharedUsed     uint64             `json:"vramSharedUsed"`
	VramSharedTotal    uint64             `json:"vramSharedTotal"`
}

type DiskSys struct {
	Name          string  `json:"name"` // 如 "0 C:"
	ReadBps       float64 `json:"readBps"`
	WriteBps      float64 `json:"writeBps"`
	ActivePercent float64 `json:"activePercent"`
}

// ProcessInfo 单个进程快照（平铺，前端按 PPID 组树）。
type ProcessInfo struct {
	PID           int32   `json:"pid"`
	PPID          int32   `json:"ppid"`
	Name          string  `json:"name"`
	CPUPercent    float64 `json:"cpu"`        // 占全机 CPU 的百分比（所有核心合计 0-100*n，窗口与全局一致）
	CPUNorm       float64 `json:"cpuNorm"`    // 归一化后占比（0-100，任务管理器"进程"列口径）
	MemWS         uint64  `json:"memWs"`      // 工作集 (bytes)
	MemPrivate    uint64  `json:"memPrivate"` // 私有工作集 (任务管理器"内存"列口径)
	MemCommit     uint64  `json:"memCommit"`  // 提交大小
	GPUPercent    float64 `json:"gpu"`
	VramDedicated uint64  `json:"vramDedicated"`
	VramShared    uint64  `json:"vramShared"`
	DiskReadBps   float64 `json:"diskRead"`
	DiskWriteBps  float64 `json:"diskWrite"`
}
