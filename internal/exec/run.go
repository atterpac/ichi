// Package exec runs user-defined shell commands for context-aware commands.
package exec

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"time"
)

// MaxCapturedOutputBytes bounds each stream retained by a noninteractive command.
const MaxCapturedOutputBytes = 1 << 20

const truncationNotice = "\n[output truncated after 1 MiB]\n"

type boundedOutput struct {
	buffer    bytes.Buffer
	truncated bool
}

func (b *boundedOutput) Write(data []byte) (int, error) {
	n := len(data)
	remaining := MaxCapturedOutputBytes - b.buffer.Len()
	if len(data) > remaining {
		data = data[:remaining]
		b.truncated = true
	}
	_, err := b.buffer.Write(data)
	return n, err
}
func (b *boundedOutput) String() string {
	result := b.buffer.String()
	if b.truncated {
		result += truncationNotice
	}
	return result
}

// RunShell runs command via "sh -c" with cwd set to repoRoot and returns its
// captured stdout and stderr. POSIX sh must be available, including on Windows;
// the helper does not translate configured commands into a different shell.
// Each stream is capped at MaxCapturedOutputBytes with a visible notice, while
// the process continues writing normally. Process errors are always preserved.
// The process inherits the current environment so
// $EDITOR and friends resolve as expected.
func RunShell(ctx context.Context, repoRoot, command string) (stdout, stderr string, err error) {
	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	cmd.Dir = repoRoot
	cmd.WaitDelay = time.Second
	cmd.Env = os.Environ()

	var outBuf, errBuf boundedOutput
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf
	err = cmd.Run()
	if errors.Is(err, exec.ErrNotFound) {
		err = fmt.Errorf("custom commands require POSIX sh: %w", err)
	}
	return outBuf.String(), errBuf.String(), err
}

// RunShellInteractive runs command via "sh -c" wired directly to the real
// terminal (with no output capture or truncation) so interactive programs (e.g. $EDITOR) take over the screen. It
// MUST be called from inside app.Suspend so the TUI releases the terminal.
func RunShellInteractive(repoRoot, command string) error {
	cmd := exec.Command("sh", "-c", command)
	cmd.Dir = repoRoot
	cmd.Env = os.Environ()
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
