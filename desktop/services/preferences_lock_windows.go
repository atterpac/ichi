package services

import (
	"fmt"
	"golang.org/x/sys/windows"
	"os"
)

func lockPreferenceFile(path string) (func(), error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	overlap := &windows.Overlapped{}
	handle := windows.Handle(file.Fd())
	if err = windows.LockFileEx(handle, windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, overlap); err != nil {
		file.Close()
		return nil, fmt.Errorf("preferences are being saved by another instance; retry: %w", err)
	}
	return func() { _ = windows.UnlockFileEx(handle, 0, 1, 0, overlap); _ = file.Close() }, nil
}
