package app

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/atterpac/dado/layout"
	"github.com/atterpac/dado/theme"
	"github.com/atterpac/ichi/internal/git"
)

func busyTestRepo(t *testing.T) (*git.Repository, string) {
	t.Helper()
	dir := t.TempDir()
	cmd := exec.Command("git", "init", "-q", dir)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("init: %s %v", out, err)
	}
	repo, err := git.OpenRepository(dir)
	if err != nil {
		t.Fatal(err)
	}
	return repo, dir
}

func TestRunBusyCancelsSubprocessAndRefreshesAfterFailure(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix process fixture")
	}
	repo, dir := busyTestRepo(t)
	realGit, err := exec.LookPath("git")
	if err != nil {
		t.Fatal(err)
	}
	bin := t.TempDir()
	pidFile := filepath.Join(bin, "pid")
	script := "#!/bin/sh\nfor arg do\n if [ \"$arg\" = fetch ]; then printf '%s' \"$$\" > \"$ICHI_BUSY_PID\"; exec sleep 30; fi\ndone\nexec " + strconv.Quote(realGit) + " \"$@\"\n"
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ICHI_BUSY_PID", pidFile)
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	queue := make(chan func(), 32)
	theme.SetQueue(func(fn func()) { queue <- fn })
	t.Cleanup(func() { theme.SetQueue(nil) })
	sb := layout.NewStatusBar()
	loader := RunBusy(sb, repo, "Blocked fetch", "Fetched", func(operation *git.Repository) error {
		// Simulate state changing before a failing mutation finishes.
		if err := os.WriteFile(filepath.Join(dir, "changed"), []byte("external"), 0600); err != nil {
			return err
		}
		return operation.Fetch("origin")
	})
	(<-queue)()
	if sb.GetSection(0).Text != "Blocked fetch" {
		t.Fatal("busy feedback never shown")
	}
	deadline := time.Now().Add(3 * time.Second)
	for {
		if _, err := os.Stat(pidFile); err == nil {
			break
		}
		if time.Now().After(deadline) {
			loader.Cancel()
			t.Fatal("subprocess did not start")
		}
		time.Sleep(time.Millisecond)
	}
	loader.Cancel()
	for loader.IsRunning() {
		select {
		case fn := <-queue:
			fn()
		case <-time.After(3 * time.Second):
			t.Fatal("cancellation did not complete")
		}
	}
	data, err := os.ReadFile(pidFile)
	if err != nil {
		t.Fatal(err)
	}
	pid, err := strconv.Atoi(string(data))
	if err != nil {
		t.Fatal(err)
	}
	process, err := os.FindProcess(pid)
	if err != nil {
		t.Fatal(err)
	}
	if err := process.Signal(syscall.Signal(0)); err != syscall.ESRCH && err != os.ErrProcessDone {
		t.Fatalf("Git process survived cancellation: %v", err)
	}
	fresh := false
	for i := 0; i < sb.SectionCount(); i++ {
		section := sb.GetSection(i)
		if section.Text == "Blocked fetch" {
			t.Fatal("busy section survived cancellation")
		}
		if strings.Contains(section.Text, "]1[-]") {
			fresh = true
		}
	}
	if !fresh {
		t.Fatal("outcome did not read newly created untracked file")
	}
	if _, err := repo.LoadRepositoryStatus(); err != nil {
		t.Fatalf("work context poisoned original repo: %v", err)
	}
}

func TestStatusBarDoesNotPresentFailedReadsAsClean(t *testing.T) {
	repo, dir := busyTestRepo(t)
	if err := os.RemoveAll(filepath.Join(dir, ".git")); err != nil {
		t.Fatal(err)
	}
	sb := layout.NewStatusBar()
	if err := UpdateStatusBar(sb, repo); err == nil {
		t.Fatal("failed status read hidden")
	}
	if sb.GetSection(sb.SectionCount()-1).Text != "Repository status unavailable" {
		t.Fatal("status failure not displayed")
	}
}

func TestLoadingToastUsesRenderedManagerAndLeavesOutcomeFeedbackToOwner(t *testing.T) {
	previous := toastManager
	InitToasts()
	t.Cleanup(func() { toastManager = previous })
	indicator := loadingToast("Loading visible data")
	indicator.Show()
	active := GetToastManager().GetActive()
	if len(active) != 1 {
		t.Fatal("loading feedback is absent from rendered manager")
	}
	indicator.Error(context.Canceled)
	indicator.Success()
	if len(GetToastManager().GetActive()) != 1 {
		t.Fatal("indicator emitted independent outcome feedback")
	}
	indicator.Hide()
	if GetToastManager().HasActive() {
		t.Fatal("loading feedback survived completion")
	}
}
