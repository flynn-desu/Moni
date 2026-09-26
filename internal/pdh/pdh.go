// Package pdh 是 PDH (Performance Data Helper) 的最小封装。
//
// 走 PdhAddEnglishCounterW（英文计数器路径），任何系统语言下行为一致；
// 通配符路径 + PdhGetFormattedCounterArrayW 一次拿到全部实例值，
// 速率类计数器（x/sec、%）由 PDH 在两次 Collect 之间自动差分。
package pdh

import (
	"fmt"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	pdhDLL                      = windows.NewLazySystemDLL("pdh.dll")
	procPdhOpenQuery            = pdhDLL.NewProc("PdhOpenQueryW")
	procPdhAddEnglishCounterW   = pdhDLL.NewProc("PdhAddEnglishCounterW")
	procPdhCollectQueryData     = pdhDLL.NewProc("PdhCollectQueryData")
	procPdhGetFormattedCounterW = pdhDLL.NewProc("PdhGetFormattedCounterArrayW")
	procPdhCloseQuery           = pdhDLL.NewProc("PdhCloseQuery")
)

const (
	fmtDouble = 0x00000200 // PDH_FMT_DOUBLE
	moreData  = 0x800007D2 // PDH_MORE_DATA

	// PDH_CSTATUS 有效性
	cstatusValidData uint32 = 0x0
	cstatusNewData   uint32 = 0x1
)

// Query 是一个 PDH 查询句柄，可挂多个计数器，一次 Collect 同步采集。
type Query struct{ h syscall.Handle }

// Open 创建查询。
func Open() (*Query, error) {
	var h syscall.Handle
	r, _, _ := procPdhOpenQuery.Call(0, 0, uintptr(unsafe.Pointer(&h)))
	if r != 0 {
		return nil, fmt.Errorf("pdh: PdhOpenQuery failed: 0x%x", r)
	}
	return &Query{h: h}, nil
}

// Close 释放查询及其全部计数器。
func (q *Query) Close() {
	procPdhCloseQuery.Call(uintptr(q.h))
}

// AddEnglishCounter 添加计数器（支持通配符 * 实例）。
func (q *Query) AddEnglishCounter(path string) (*Counter, error) {
	p, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return nil, err
	}
	var h syscall.Handle
	r, _, _ := procPdhAddEnglishCounterW.Call(
		uintptr(q.h), uintptr(unsafe.Pointer(p)), 0, uintptr(unsafe.Pointer(&h)))
	if r != 0 {
		return nil, fmt.Errorf("pdh: PdhAddEnglishCounter(%q) failed: 0x%x", path, r)
	}
	return &Counter{h: h}, nil
}

// Collect 采集一次快照。速率计数器的值 = 相邻两次 Collect 之间的差分。
func (q *Query) Collect() error {
	r, _, _ := procPdhCollectQueryData.Call(uintptr(q.h))
	if r != 0 {
		return fmt.Errorf("pdh: PdhCollectQueryData failed: 0x%x", r)
	}
	return nil
}

// Counter 指向查询内的一个计数器。
type Counter struct{ h syscall.Handle }

// Item 是通配符计数器的一个实例值。
type Item struct {
	Name  string
	Value float64
}

// ReadAll 读取该计数器（通配符路径）下全部实例的 double 值。
// 注意：PdhGetFormattedCounterArrayW 的 3/4 参均为指针（in/out），不能按值传。
func (c *Counter) ReadAll() ([]Item, error) {
	var buf []byte
	var count uint32
	for i := 0; i < 4; i++ {
		var ptr uintptr
		sz := uint32(len(buf))
		if sz > 0 {
			ptr = uintptr(unsafe.Pointer(&buf[0]))
		}
		r, _, _ := procPdhGetFormattedCounterW.Call(
			uintptr(c.h), fmtDouble,
			uintptr(unsafe.Pointer(&sz)), uintptr(unsafe.Pointer(&count)), ptr,
		)
		if r == 0 {
			return parseItems(buf, count)
		}
		if r == moreData {
			buf = make([]byte, sz) // 调用已把需要的长度回写到 sz
			continue
		}
		return nil, fmt.Errorf("pdh: PdhGetFormattedCounterArray failed: 0x%x", r)
	}
	return nil, fmt.Errorf("pdh: counter array did not converge")
}

// 与 C 端 PDH_FMT_COUNTERVALUE_ITEM_W 布局一致 (x64):
// { LPWSTR szName; DWORD CStatus; pad; double value } = 8+4+4+8 = 24 字节
type pdhFmtCounterValueItem struct {
	Name    *uint16
	CStatus uint32
	_       uint32
	Value   float64
}

func parseItems(buf []byte, count uint32) ([]Item, error) {
	elem := unsafe.Sizeof(pdhFmtCounterValueItem{})
	items := make([]Item, 0, count)
	for i := uint32(0); i < count; i++ {
		if uintptr(i)*elem+elem > uintptr(len(buf)) {
			break
		}
		it := (*pdhFmtCounterValueItem)(unsafe.Pointer(&buf[uintptr(i)*elem]))
		if it.CStatus != cstatusValidData && it.CStatus != cstatusNewData {
			continue
		}
		items = append(items, Item{
			Name:  windows.UTF16PtrToString(it.Name),
			Value: it.Value,
		})
	}
	return items, nil
}
