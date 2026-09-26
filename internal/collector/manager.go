package collector

import (
	"os"
	"runtime"
	"sync"
	"time"

	"Moni/internal/pdh"
)

// Manager 采集管理器：定时采样 + 回调推送，支持运行中调整间隔。
type Manager struct {
	mu       sync.Mutex
	interval time.Duration
	onChange chan time.Duration
	stop     chan struct{}
	stopped  chan struct{}
	onSample func(*Sample)

	q            *pdh.Query
	cGPUUtil     *pdh.Counter
	cVramDed     *pdh.Counter // GPU Adapter Memory: 全卡总量（本机无 pid 实例）
	cVramShr     *pdh.Counter
	cProcVramDed *pdh.Counter // GPU Process Memory: 每进程显存
	cProcVramShr *pdh.Counter
	cDiskR       *pdh.Counter
	cDiskW       *pdh.Counter
	cDiskIdle    *pdh.Counter
	cNetRecv     *pdh.Counter
	cNetSent     *pdh.Counter

	gpu *gpuInfo // 显存总量/适配器名（注册表缓存）

	procPrev map[int32]procPrevState
	cpuPrev  *[3]uint64        // GetSystemTimes 差分基准 (idle, kernel, user)
	pending  map[int32]*procPD // PDH 每进程数据暂存，单 tick 内合并
	ntBuf    []byte            // NtQuerySystemInformation 复用缓冲
	selfPid  int32             // 自身进程号（状态栏自监控）
	lastTick time.Time
}

type procPrevState struct {
	user, kernel float64
	read, write  uint64
}

// NewManager 创建并初始化 PDH 计数器集。
func NewManager(interval time.Duration, onSample func(*Sample)) (*Manager, error) {
	q, err := pdh.Open()
	if err != nil {
		return nil, err
	}
	m := &Manager{
		interval: interval,
		onChange: make(chan time.Duration, 1),
		stop:     make(chan struct{}),
		stopped:  make(chan struct{}),
		onSample: onSample,
		q:        q,
		procPrev: map[int32]procPrevState{},
		gpu:      &gpuInfo{},
		selfPid:  int32(os.Getpid()),
	}
	type add struct {
		path string
		dst  **pdh.Counter
	}
	for _, a := range []add{
		{`\GPU Engine(*)\Utilization Percentage`, &m.cGPUUtil},
		{`\GPU Adapter Memory(*)\Dedicated Usage`, &m.cVramDed},
		{`\GPU Adapter Memory(*)\Shared Usage`, &m.cVramShr},
		{`\GPU Process Memory(*)\Dedicated Usage`, &m.cProcVramDed},
		{`\GPU Process Memory(*)\Shared Usage`, &m.cProcVramShr},
		{`\PhysicalDisk(*)\Disk Read Bytes/sec`, &m.cDiskR},
		{`\PhysicalDisk(*)\Disk Write Bytes/sec`, &m.cDiskW},
		{`\PhysicalDisk(*)\% Idle Time`, &m.cDiskIdle},
		{`\Network Interface(*)\Bytes Received/Sec`, &m.cNetRecv},
		{`\Network Interface(*)\Bytes Sent/Sec`, &m.cNetSent},
	} {
		c, err := q.AddEnglishCounter(a.path)
		if err != nil {
			q.Close()
			return nil, err
		}
		*a.dst = c
	}
	m.gpu.loadAdapterInfo()
	return m, nil
}

// GPUInfo 返回缓存的显卡名与专用显存总量（供主机信息页）。
func (m *Manager) GPUInfo() (string, uint64) {
	return m.gpu.adapterName, m.gpu.vramDedTotal
}

// putPending 合并辅助：向暂存区写入某进程的 PDH 数据。
func (m *Manager) putPending(pid int32, fn func(*procPD)) {
	if m.pending == nil {
		m.pending = map[int32]*procPD{}
	}
	pd, ok := m.pending[pid]
	if !ok {
		pd = &procPD{}
		m.pending[pid] = pd
	}
	fn(pd)
}

// Start 启动采集循环。
func (m *Manager) Start() {
	go m.run()
}

// Stop 停止采集。
func (m *Manager) Stop() {
	close(m.stop)
	<-m.stopped
	m.q.Close()
}

// SetInterval 运行中调整采集间隔。
func (m *Manager) SetInterval(d time.Duration) {
	if d < 200*time.Millisecond {
		d = 200 * time.Millisecond
	}
	select {
	case m.onChange <- d:
	default:
	}
}

func (m *Manager) run() {
	defer close(m.stopped)
	timer := time.NewTimer(m.interval)
	for {
		select {
		case <-m.stop:
			timer.Stop()
			return
		case d := <-m.onChange:
			m.mu.Lock()
			m.interval = d
			m.mu.Unlock()
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			timer.Reset(d)
		case <-timer.C:
			s := m.sampleOnce()
			if s != nil && m.onSample != nil {
				m.onSample(s)
			}
			m.mu.Lock()
			interval := m.interval
			m.mu.Unlock()
			timer.Reset(interval)
		}
	}
}

// sampleOnce 采集一轮。返回 nil 表示跳过（首轮 warmup 不跳过，只做标记）。
func (m *Manager) sampleOnce() *Sample {
	start := time.Now()
	m.mu.Lock()
	interval := m.interval
	m.mu.Unlock()

	dt := time.Since(m.lastTick)
	if m.lastTick.IsZero() {
		dt = 0 // 首轮
	}
	warmup := m.lastTick.IsZero()

	s := &Sample{
		Ts:       start.UnixMilli(),
		Interval: interval.Seconds(),
		Warmup:   warmup,
		CPU:      CPUSys{Cores: runtime.NumCPU()},
		GPU:      GPUSys{ByEngine: map[string]float64{}, AdapterName: m.gpu.adapterName},
		Disks:    []DiskSys{}, // 必须非 nil：nil 会被序列化为 null，前端按数组消费
	}

	// ---- PDH：一次 Collect 同步所有计数器 ----
	if err := m.q.Collect(); err == nil {
		m.collectGPU(s)
		m.collectDisks(s)
		m.collectNet(s)
	}

	// ---- 内存 / 全局CPU ----
	m.collectMemory(s)
	m.collectCPU(s)

	// ---- 进程（单次 NtQuerySystemInformation） ----
	m.collectProcesses(s, dt)

	s.CostMs = float64(time.Since(start).Microseconds()) / 1000.0
	m.lastTick = start
	return s
}
