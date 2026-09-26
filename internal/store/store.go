// Package store 维护聚合后的历史数据环形缓冲，供前端拉取曲线数据。
// 只存系统级聚合点（不含进程列表），300 点 @1s 约 5 分钟，内存占用几十 KB。
package store

import "Moni/internal/collector"

// Point 历史曲线数据点（JSON 字段即前端契约）。
type Point struct {
	Ts int64 `json:"ts"`

	CPU    float64 `json:"cpu"`
	Cores  int     `json:"cores"`
	Warmup bool    `json:"warmup"`

	MemUsed    uint64  `json:"memUsed"`
	MemTotal   uint64  `json:"memTotal"`
	MemPercent float64 `json:"memPercent"`
	CommitUsed uint64  `json:"commitUsed"`
	CommitLim  uint64  `json:"commitLim"`

	GPU         float64            `json:"gpu"`
	ByEngine    map[string]float64 `json:"byEngine"`
	AdapterName string             `json:"adapterName"`

	VramDedUsed  uint64 `json:"vramDedUsed"`
	VramDedTotal uint64 `json:"vramDedTotal"`
	VramShrUsed  uint64 `json:"vramShrUsed"`
	VramShrTotal uint64 `json:"vramShrTotal"`

	NetRecvBps float64 `json:"netRecvBps"`
	NetSentBps float64 `json:"netSentBps"`

	DiskReadBps  float64 `json:"diskReadBps"`  // 全盘合计
	DiskWriteBps float64 `json:"diskWriteBps"` // 全盘合计
	DiskActive   float64 `json:"diskActive"`   // 各盘活跃度最大值
}

// Store 固定容量环形缓冲（写满覆盖最旧）。
type Store struct {
	buf  []Point
	cap  int
	head int // 下一写入位置
	full bool
}

// New 创建容量为 capacity 的环形缓冲。
func New(capacity int) *Store {
	if capacity < 2 {
		capacity = 2
	}
	return &Store{buf: make([]Point, capacity), cap: capacity}
}

// Push 从采样快照提取聚合点并写入。
func (st *Store) Push(s *collector.Sample) {
	p := Point{
		Ts:           s.Ts,
		CPU:          s.CPU.UsedPercent,
		Cores:        s.CPU.Cores,
		Warmup:       s.Warmup,
		MemUsed:      s.Memory.Used,
		MemTotal:     s.Memory.Total,
		MemPercent:   s.Memory.UsedPercent,
		CommitUsed:   s.Memory.CommitTotal,
		CommitLim:    s.Memory.CommitLimit,
		GPU:          s.GPU.UsedPercent,
		ByEngine:     s.GPU.ByEngine,
		AdapterName:  s.GPU.AdapterName,
		VramDedUsed:  s.GPU.VramDedicatedUsed,
		VramDedTotal: s.GPU.VramDedicatedTotal,
		VramShrUsed:  s.GPU.VramSharedUsed,
		VramShrTotal: s.GPU.VramSharedTotal,
		NetRecvBps:   s.Net.RecvBps,
		NetSentBps:   s.Net.SentBps,
	}
	for _, d := range s.Disks {
		p.DiskReadBps += d.ReadBps
		p.DiskWriteBps += d.WriteBps
		if d.ActivePercent > p.DiskActive {
			p.DiskActive = d.ActivePercent
		}
	}
	st.buf[st.head] = p
	st.head = (st.head + 1) % st.cap
	if st.head == 0 {
		st.full = true
	}
}

// All 按时间升序返回缓冲快照（旧→新）。
func (st *Store) All() []Point {
	if !st.full {
		out := make([]Point, st.head)
		copy(out, st.buf[:st.head])
		return out
	}
	out := make([]Point, st.cap)
	copy(out, st.buf[st.head:])
	copy(out[st.cap-st.head:], st.buf[:st.head])
	return out
}
