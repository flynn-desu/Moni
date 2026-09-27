package collector

import (
	"runtime"
	"sort"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// 进程采集：一次 NtQuerySystemInformation(SystemProcessInformation) 取回全部进程的
// 名称/PPID/CPU 时间/IO 计数/工作集/私有页数，替代 gopsutil 的逐进程句柄查询
// （约 370 进程时 gopsutil 一轮 ~30ms，本方案 <5ms，且受限进程也能拿到名称）。

var (
	ntdll                        = windows.NewLazySystemDLL("ntdll.dll")
	procNtQuerySystemInformation = ntdll.NewProc("NtQuerySystemInformation")
)

const (
	sysProcInfoClass         = 5 // SystemProcessInformation
	statusInfoLengthMismatch = 0xC0000004
)

// systemProcessInformation 与 Vista+ x64 内核布局一致（phnt 口径，总长 256 字节）。
type systemProcessInformation struct {
	NextEntryOffset              uint32
	NumberOfThreads              uint32
	WorkingSetPrivateSize        int64
	HardFaultCount               uint32
	NumberOfThreadsHighWatermark uint32
	CycleTime                    uint64
	CreateTime                   int64
	UserTime                     int64
	KernelTime                   int64
	ImageName                    struct {
		Length        uint16
		MaximumLength uint16
		_             uint32
		Buffer        *uint16
	}
	BasePriority                 int32
	_                            uint32
	UniqueProcessId              uintptr
	InheritedFromUniqueProcessId uintptr
	HandleCount                  uint32
	SessionId                    uint32
	UniqueProcessKey             uintptr
	PeakVirtualSize              uintptr
	VirtualSize                  uintptr
	PageFaultCount               uint32
	_                            uint32
	PeakWorkingSetSize           uintptr
	WorkingSetSize               uintptr
	QuotaPeakPagedPoolUsage      uintptr
	QuotaPagedPoolUsage          uintptr
	QuotaPeakNonPagedPoolUsage   uintptr
	QuotaNonPagedPoolUsage       uintptr
	PagefileUsage                uintptr
	PeakPagefileUsage            uintptr
	PrivatePageCount             uintptr
	ReadOperationCount           int64
	WriteOperationCount          int64
	OtherOperationCount          int64
	ReadTransferCount            int64
	WriteTransferCount           int64
	OtherTransferCount           int64
}

func init() {
	if unsafe.Sizeof(systemProcessInformation{}) != 256 {
		panic("collector: SYSTEM_PROCESS_INFORMATION 布局与预期 256 字节不符")
	}
}

// procPD 由 PDH 采集的每进程数据（GPU 部分），collectGPU 预填、collectProcesses 合并。
type procPD struct {
	gpu              float64
	vramDed, vramShr uint64
}

// collectProcesses 枚举进程并组装快照（CPU/IO 与上一轮差分）。
func (m *Manager) collectProcesses(s *Sample, dt time.Duration) {
	out := make([]ProcessInfo, 0, len(m.procPrev)+16)
	buf, ok := m.ntQuery()
	if !ok {
		s.Processes = out
		return // 本轮失败：保留上一轮基准，下轮差分自然衔接
	}
	dts := dt.Seconds()
	prev := m.procPrev
	next := make(map[int32]procPrevState, len(prev)+16)
	cores := float64(runtime.NumCPU())

	// 第一遍：解析原始条目并记录创建时间。
	// Windows 不清理死后父进程的 PPID，旧 pid 被复用后会形成
	// services→wininit→winlogon→svchost→services 这类环（本机实测存在），
	// 前端按 PPID 组树时整个环上的分量（全部 svchost、pycharm/python 等
	// 200+ 进程）会既不是根也挂不到根，直接从界面消失。
	type rawProc struct {
		pi     ProcessInfo
		ctime  int64   // Unix 微秒；父进程必然早于子进程，反之为无效边
		user   float64 // UserTime 秒
		kernel float64 // KernelTime 秒
		read   uint64  // IO 读字节累计
		write  uint64  // IO 写字节累计
	}
	raws := make([]rawProc, 0, 384)
	ctimes := make(map[int32]int64, 384)
	for off := 0; off+256 <= len(buf); {
		sp := (*systemProcessInformation)(unsafe.Pointer(&buf[off]))
		if sp.NextEntryOffset == 0 {
			break
		}
		off += int(sp.NextEntryOffset)

		pid := int32(sp.UniqueProcessId)
		if pid == 0 {
			continue // System Idle Process：不展示，避免污染 top 列表
		}
		pi := ProcessInfo{
			PID:  pid,
			PPID: int32(sp.InheritedFromUniqueProcessId),
		}
		if sp.ImageName.Length > 0 && sp.ImageName.Buffer != nil {
			pi.Name = windows.UTF16ToString(
				unsafe.Slice(sp.ImageName.Buffer, sp.ImageName.Length/2))
		}
		if pi.Name == "" {
			pi.Name = "<受限>"
		}
		pi.MemWS = uint64(sp.WorkingSetSize)
		pi.MemPrivate = uint64(sp.WorkingSetPrivateSize) // 任务管理器"内存"列口径
		pi.MemCommit = uint64(sp.PrivatePageCount)
		ct := int64(0)
		if sp.CreateTime > 0 {
			ct = (int64(sp.CreateTime) - 116444736000000000) / 10 // FILETIME 100ns → Unix µs
		}
		raws = append(raws, rawProc{
			pi:     pi,
			ctime:  ct,
			user:   float64(sp.UserTime) * 1e-7, // 100ns → 秒
			kernel: float64(sp.KernelTime) * 1e-7,
			read:   uint64(sp.ReadTransferCount),
			write:  uint64(sp.WriteTransferCount),
		})
		ctimes[pid] = ct
	}

	// 第二遍：剪掉"父进程比子进程晚创建"的不可能边（旧 PPID 指向被复用的 pid），
	// 再做 CPU/IO 差分与 GPU 合并。
	for _, raw := range raws {
		pi := raw.pi
		if pi.PPID == pi.PID {
			pi.PPID = 0
		} else if pi.PPID != 0 && raw.ctime > 0 {
			// 仅当子进程创建时间已知时才剪：Registry 等 kernel 伪进程 ctime=0，不能据此断边
			if pct, ok := ctimes[pi.PPID]; ok && pct > raw.ctime {
				pi.PPID = 0 // 父进程比子进程"年轻"：pid 已被复用，边无效 → 提升为根
			}
		}

		pid := pi.PID
		var cur procPrevState
		cur.user = raw.user
		cur.kernel = raw.kernel
		cur.read = raw.read
		cur.write = raw.write
		if pv, ok := prev[pid]; ok && dts > 0 {
			du := cur.user - pv.user
			if du < 0 {
				du = 0
			}
			dk := cur.kernel - pv.kernel
			if dk < 0 {
				dk = 0
			}
			pi.CPUPercent = (du + dk) / dts * 100.0
			pi.CPUNorm = pi.CPUPercent / cores // 任务管理器"进程"列口径 (0-100)
			if dr := int64(cur.read) - int64(pv.read); dr > 0 {
				pi.DiskReadBps = float64(dr) / dts
			}
			if dw := int64(cur.write) - int64(pv.write); dw > 0 {
				pi.DiskWriteBps = float64(dw) / dts
			}
		}
		next[pid] = cur

		if pd, ok := m.pending[pid]; ok {
			pi.GPUPercent = pd.gpu
			pi.VramDedicated = pd.vramDed
			pi.VramShared = pd.vramShr
		}
		if pid == m.selfPid {
			s.Self = SelfInfo{PID: pid, CPUNorm: pi.CPUNorm, MemWS: pi.MemWS}
		}
		out = append(out, pi)
	}
	m.procPrev = next
	m.pending = nil

	// CPU 占用降序，便于查看 top 进程
	sort.SliceStable(out, func(i, j int) bool { return out[i].CPUPercent > out[j].CPUPercent })
	s.Processes = out
}

// ntQuery 调 NtQuerySystemInformation，返回内部缓冲（跨轮复用，不足时扩容）。
func (m *Manager) ntQuery() ([]byte, bool) {
	if m.ntBuf == nil {
		m.ntBuf = make([]byte, 1<<20)
	}
	for i := 0; i < 3; i++ {
		var ret uint32
		st, _, _ := procNtQuerySystemInformation.Call(
			sysProcInfoClass,
			uintptr(unsafe.Pointer(&m.ntBuf[0])),
			uintptr(len(m.ntBuf)),
			uintptr(unsafe.Pointer(&ret)),
		)
		if st == 0 { // STATUS_SUCCESS
			return m.ntBuf, true
		}
		if uint32(st) == statusInfoLengthMismatch {
			want := ret
			if want <= uint32(len(m.ntBuf)) {
				want = uint32(len(m.ntBuf)) * 2
			}
			m.ntBuf = make([]byte, want+1<<16)
			continue
		}
		return nil, false
	}
	return nil, false
}
