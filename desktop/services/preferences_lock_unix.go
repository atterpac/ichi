//go:build !windows

package services

import (
	"fmt"
	"golang.org/x/sys/unix"
	"os"
)

// A stable lock file coordinates separate app instances. It must not be unlinked:
// a later opener must lock the same inode while another process holds it.
func lockPreferenceFile(path string) (func(), error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err = unix.Flock(int(file.Fd()), unix.LOCK_EX|unix.LOCK_NB); err != nil {
		file.Close()
		return nil, fmt.Errorf("preferences are being saved by another instance; retry: %w", err)
	}
	return func() { _ = unix.Flock(int(file.Fd()), unix.LOCK_UN); _ = file.Close() }, nil
}
