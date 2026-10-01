package services

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/atterpac/ichi/internal/git"
)

func TestServiceWorkflowsUseEffectiveCommandConfiguration(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell command recorder")
	}
	path, run := conflictTestRepo(t)
	run("commit", "--allow-empty", "-m", "initial")
	if err := os.WriteFile(filepath.Join(path, "source"), []byte("tracked"), 0600); err != nil {
		t.Fatal(err)
	}
	run("add", "source")
	if err := os.WriteFile(filepath.Join(path, "source"), []byte("changed"), 0600); err != nil {
		t.Fatal(err)
	}
	repo, err := git.OpenRepository(path)
	if err != nil {
		t.Fatal(err)
	}
	effective := repo.WithConfig(map[string]string{"user.name": "Workspace User", "user.email": "workspace@example.test", "core.autocrlf": "false"})
	actualGit, err := exec.LookPath("git")
	if err != nil {
		t.Fatal(err)
	}
	bin := t.TempDir()
	log := filepath.Join(bin, "commands")
	// Record argument boundaries; the real Git still runs, so outputs and writes
	// exercise the workflows rather than a mocked command result.
	script := "#!/bin/sh\nprintf '%s\\0' \"$@\" >> \"$ICHI_TEST_COMMAND_LOG\"\nprintf '\\n' >> \"$ICHI_TEST_COMMAND_LOG\"\nexec \"$ICHI_TEST_REAL_GIT\" \"$@\"\n"
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ICHI_TEST_REAL_GIT", actualGit)
	t.Setenv("ICHI_TEST_COMMAND_LOG", log)
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	for _, tc := range []struct {
		name string
		call func() error
	}{
		{"branch", func() error { _, err := loadBranchGraph(context.Background(), effective, "HEAD", 80); return err }},
		{"conflict", func() error { _, err := workspaceFor(effective); return err }},
		{"discard", func() error { return discardWorktreeFile(context.Background(), effective, "source") }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := os.WriteFile(log, nil, 0600); err != nil {
				t.Fatal(err)
			}
			if err := tc.call(); err != nil {
				t.Fatal(err)
			}
			data, err := os.ReadFile(log)
			if err != nil {
				t.Fatal(err)
			}
			records := strings.Split(strings.TrimSuffix(string(data), "\n"), "\n")
			if len(records) == 0 || records[0] == "" {
				t.Fatal("workflow ran no Git commands")
			}
			for _, record := range records {
				if !strings.Contains(record, "-c\x00user.name=Workspace User\x00") || !strings.Contains(record, "-c\x00user.email=workspace@example.test\x00") {
					t.Fatalf("profile missing from command: %q", record)
				}
			}
		})
	}
	// Profile discovery reads a literal source file, never the current repository
	// or its WithConfig overrides; otherwise source/default identity is corrupted.
	configPath := filepath.Join(bin, "raw.gitconfig")
	if err := os.WriteFile(configPath, []byte("[user]\n name = Raw User\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(log, nil, 0600); err != nil {
		t.Fatal(err)
	}
	values, _, err := readProfileConfig("--file", configPath)
	if err != nil || values["user.name"] != "Raw User" {
		t.Fatalf("raw discovery = %v, %v", values, err)
	}
	data, err := os.ReadFile(log)
	if err != nil || strings.Contains(string(data), "Workspace User") || strings.Contains(string(data), "-C\x00") {
		t.Fatalf("raw discovery inherited effective context: %q, %v", data, err)
	}
}

func TestBranchGraphCancelsRunningGit(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell process fixture")
	}
	path, run := conflictTestRepo(t)
	run("commit", "--allow-empty", "-m", "initial")
	repo, err := git.OpenRepository(path)
	if err != nil {
		t.Fatal(err)
	}
	bin := t.TempDir()
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte("#!/bin/sh\nexec sleep 30\n"), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	if _, err := (&GraphService{state: &State{repo: repo}}).LoadBranchGraph(ctx, "HEAD", 80); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("canceled branch read = %v", err)
	}
}
