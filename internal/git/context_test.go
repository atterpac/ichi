package git

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestRepositoryContextsAreIndependentAndRetainConfiguration(t *testing.T) {
	repo, run := diffTestRepo(t)
	run("config", "user.name", "Default")
	ctx, cancel := context.WithCancel(context.Background())
	configured := repo.WithConfig(map[string]string{"user.name": "Profile"})
	canceled := configured.WithContext(ctx)
	cancel()
	if _, err := canceled.ConfigValue("user.name"); !errors.Is(err, context.Canceled) {
		t.Fatalf("bound context ignored: %v", err)
	}
	for _, tc := range []struct {
		repo *Repository
		want string
	}{
		{repo, "Default"}, {configured, "Profile"},
		{configured.WithContext(context.Background()), "Profile"},
		{repo.WithContext(context.Background()).WithConfig(map[string]string{"user.name": "Other"}), "Other"},
	} {
		got, err := tc.repo.ConfigValue("user.name")
		if err != nil || got != tc.want {
			t.Fatalf("clone configuration = %q, %v, want %q", got, err, tc.want)
		}
	}
	// An explicit context takes precedence over the clone's default context.
	if out, err := canceled.CommandContext(context.Background(), "config", "--get", "user.name").Output(); err != nil || strings.TrimSpace(string(out)) != "Profile" {
		t.Fatalf("explicit context = %q, %v", out, err)
	}
	if _, err := canceled.WorkingFilePreview("missing"); !errors.Is(err, context.Canceled) {
		t.Fatalf("file read did not reject cancellation before filesystem work: %v", err)
	}
}

func TestDefaultGitWorkflowsCancelRunningProcesses(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell/process signal fixture")
	}
	repo, _ := diffTestRepo(t)
	bin := t.TempDir()
	pidFile := filepath.Join(bin, "pid")
	script := "#!/bin/sh\nprintf '%s' \"$$\" > \"$ICHI_TEST_GIT_PID\"\nexec sleep 30\n"
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ICHI_TEST_GIT_PID", pidFile)
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	for _, tc := range []struct {
		name string
		call func(*Repository) error
	}{
		{"fetch", func(r *Repository) error { return r.Fetch("origin") }},
		{"pull", func(r *Repository) error { return r.Pull() }},
		{"search", func(r *Repository) error { _, err := r.SearchCommits("needle", 20); return err }},
		{"graph", func(r *Repository) error { _, err := r.LoadGraph(20); return err }},
		{"diff", func(r *Repository) error { _, err := r.GetWorkingDiff(); return err }},
		{"stdin", func(r *Repository) error { return r.RunWithStdin("patch", "apply", "--cached", "-") }},
		{"batch index", func(r *Repository) error { return r.StageFiles([]string{"literal"}) }},
		{"history rewrite", func(r *Repository) error { return r.DropCommit("HEAD") }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			os.Remove(pidFile)
			ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
			defer cancel()
			if err := tc.call(repo.WithContext(ctx)); !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("cancellation = %v", err)
			}
			data, err := os.ReadFile(pidFile)
			if err != nil {
				t.Fatalf("command never reached blocked subprocess: %v", err)
			}
			pid, err := strconv.Atoi(string(data))
			if err != nil {
				t.Fatal(err)
			}
			process, err := os.FindProcess(pid)
			if err != nil {
				t.Fatal(err)
			}
			if err := process.Signal(syscall.Signal(0)); !errors.Is(err, syscall.ESRCH) && !errors.Is(err, os.ErrProcessDone) {
				t.Fatalf("canceled Git process %d still exists: %v", pid, err)
			}
		})
	}
}
