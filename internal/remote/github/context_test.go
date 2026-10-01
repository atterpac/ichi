package github

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"syscall"
	"testing"
	"time"
)

func TestProviderContextCloneIsIndependent(t *testing.T) {
	calls := 0
	provider := &GitHub{cli: func(...string) ([]byte, error) {
		calls++
		return []byte(`{"login":"person"}`), nil
	}}
	ctx, cancel := context.WithCancel(context.Background())
	bound := provider.WithContext(ctx)
	cancel()
	if _, err := bound.CurrentUser(); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled clone = %v", err)
	}
	if _, err := provider.CurrentUser(); err != nil || calls != 1 {
		t.Fatalf("original provider changed: calls %d, error %v", calls, err)
	}
}

func TestProviderCancellationReapsAuthenticationAndAPIProcesses(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX process fixture")
	}
	bin := t.TempDir()
	pidFile := filepath.Join(bin, "pid")
	if err := os.WriteFile(filepath.Join(bin, "gh"), []byte("#!/bin/sh\nprintf '%s' \"$$\" > \"$ICHI_TEST_GH_PID\"\nexec sleep 30\n"), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ICHI_TEST_GH_PID", pidFile)
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	for _, test := range []struct {
		name string
		call func(*GitHub) error
	}{
		{"authentication", func(g *GitHub) error { return g.Authenticate() }},
		{"API", func(g *GitHub) error { _, err := g.GetChecks("owner/repo", 1); return err }},
	} {
		t.Run(test.name, func(t *testing.T) {
			os.Remove(pidFile)
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			provider := (&GitHub{}).WithContext(ctx).(*GitHub)
			done := make(chan error, 1)
			go func() { done <- test.call(provider) }()
			var pid int
			deadline := time.Now().Add(2 * time.Second)
			for time.Now().Before(deadline) {
				data, err := os.ReadFile(pidFile)
				if err == nil {
					pid, _ = strconv.Atoi(string(data))
					if pid != 0 {
						break
					}
				}
				time.Sleep(time.Millisecond)
			}
			cancel()
			select {
			case err := <-done:
				if !errors.Is(err, context.Canceled) {
					t.Fatalf("cancellation = %v", err)
				}
			case <-time.After(2 * time.Second):
				t.Fatal("provider did not finish after cancellation")
			}
			if pid == 0 {
				t.Fatal("provider never started blocked subprocess")
			}
			process, err := os.FindProcess(pid)
			if err != nil {
				t.Fatal(err)
			}
			if err := process.Signal(syscall.Signal(0)); !errors.Is(err, syscall.ESRCH) && !errors.Is(err, os.ErrProcessDone) {
				t.Fatalf("canceled gh process %d still exists: %v", pid, err)
			}
		})
	}
}
