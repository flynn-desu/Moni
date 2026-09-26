// harness 是 M1 阶段的命令行验证工具：
// 每秒打印系统指标与 top 进程，用于与任务管理器对照校验数据正确性。
package main

import (
	"flag"
	"fmt"
	"os"
	"sort"
	"time"

	"Moni/internal/collector"
)

func fmtBps(v float64) string {
	switch {
	case v >= 1024*1024:
		return fmt.Sprintf("%.1fMB/s", v/1024/1024)
	case v >= 1024:
		return fmt.Sprintf("%.1fKB/s", v/1024)
	default:
		return fmt.Sprintf("%.0fB/s", v)
	}
}

func fmtBytes(v uint64) string {
	gb := float64(v) / 1024 / 1024 / 1024
	if gb >= 1 {
		return fmt.Sprintf("%.2fGB", gb)
	}
	return fmt.Sprintf("%.0fMB", float64(v)/1024/1024)
}

func main() {
	interval := flag.Duration("i", time.Second, "采集间隔")
	n := flag.Int("n", 10, "采样轮数后退出")
	flag.Parse()

	tick := 0
	mgr, err := collector.NewManager(*interval, func(s *collector.Sample) {
		tick++
		fmt.Printf("\n=== tick %d  ts=%d  采集耗时 %.1fms (warmup=%v) ===\n",
			tick, s.Ts, s.CostMs, s.Warmup)
		fmt.Printf("CPU: %5.1f%% (%d核)   内存: %s/%s (%.1f%%)   提交: %s/%s\n",
			s.CPU.UsedPercent, s.CPU.Cores,
			fmtBytes(s.Memory.Used), fmtBytes(s.Memory.Total), s.Memory.UsedPercent,
			fmtBytes(s.Memory.CommitTotal), fmtBytes(s.Memory.CommitLimit))
		fmt.Printf("GPU: %5.1f%% [%s] 显存: %s/%s  共享: %s/%s\n",
			s.GPU.UsedPercent, s.GPU.AdapterName,
			fmtBytes(s.GPU.VramDedicatedUsed), fmtBytes(s.GPU.VramDedicatedTotal),
			fmtBytes(s.GPU.VramSharedUsed), fmtBytes(s.GPU.VramSharedTotal))
		engs := make([]string, 0, len(s.GPU.ByEngine))
		for k, v := range s.GPU.ByEngine {
			if v > 0.05 {
				engs = append(engs, fmt.Sprintf("%s=%.1f%%", k, v))
			}
		}
		sort.Strings(engs)
		fmt.Printf("  引擎: %v\n", engs)
		for _, d := range s.Disks {
			fmt.Printf("  磁盘 %-6s 读%-10s 写%-10s 活跃%.0f%%\n",
				d.Name, fmtBps(d.ReadBps), fmtBps(d.WriteBps), d.ActivePercent)
		}
		fmt.Printf("网络: 收%-12s 发%-12s  进程数: %d\n",
			fmtBps(s.Net.RecvBps), fmtBps(s.Net.SentBps), len(s.Processes))

		// top5 CPU / top5 内存
		top := 5
		if len(s.Processes) < top {
			top = len(s.Processes)
		}
		fmt.Println("  -- TOP CPU --")
		for i := 0; i < top; i++ {
			p := s.Processes[i]
			fmt.Printf("    %-28s pid=%-6d cpu=%6.1f%% (TM口径%5.1f%%) mem=%-9s priv=%-9s\n",
				p.Name, p.PID, p.CPUPercent, p.CPUNorm, fmtBytes(p.MemWS), fmtBytes(p.MemPrivate))
		}
		byMem := make([]collector.ProcessInfo, len(s.Processes))
		copy(byMem, s.Processes)
		sort.Slice(byMem, func(i, j int) bool { return byMem[i].MemPrivate > byMem[j].MemPrivate })
		fmt.Println("  -- TOP 内存(私有) --")
		for i := 0; i < top; i++ {
			p := byMem[i]
			fmt.Printf("    %-28s pid=%-6d priv=%-9s commit=%-9s gpu=%4.1f%% vram=%s\n",
				p.Name, p.PID, fmtBytes(p.MemPrivate), fmtBytes(p.MemCommit),
				p.GPUPercent, fmtBytes(p.VramDedicated))
		}
		if tick >= *n {
			os.Exit(0)
		}
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, "初始化失败:", err)
		os.Exit(1)
	}
	mgr.Start()
	defer mgr.Stop()
	select {} // 由回调内 os.Exit 退出
}
