//go:build !windows

package services

import (
	"os"
	"os/exec"
	"syscall"
)

// npm/pnpm launchers can leave a native Codex child behind if only the wrapper
// is killed. Keep each review in its own process group and cancel the group.
func configureReviewProcess(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return os.ErrProcessDone
		}
		err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		if err == syscall.ESRCH {
			return os.ErrProcessDone
		}
		return err
	}
}
