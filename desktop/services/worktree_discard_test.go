package services

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/atterpac/ichi/internal/git"
)

func TestDiscardMixedGroup(t *testing.T) {
	root := t.TempDir()
	gitRun := func(args ...string) string {
		t.Helper()
		out, err := exec.Command("git", append([]string{"-C", root}, args...)...).CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %v %s", args, err, out)
		}
		return string(out)
	}
	write := func(path, content string) {
		t.Helper()
		full := filepath.Join(root, path)
		if err := os.MkdirAll(filepath.Dir(full), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}
	read := func(path string) string {
		t.Helper()
		data, err := os.ReadFile(filepath.Join(root, path))
		if err != nil {
			t.Fatal(err)
		}
		return string(data)
	}
	gitRun("init")
	write("backlog/tracked.json", "staged version")
	write("backlog/deleted.json", "restore me")
	gitRun("add", ".")
	write("backlog/tracked.json", "unstaged version")
	if err := os.Remove(filepath.Join(root, "backlog/deleted.json")); err != nil {
		t.Fatal(err)
	}
	write("backlog/_manifest.json", "untracked")
	write("backlog/nested/new file.json", "untracked")
	write("sibling.json", "keep")
	write(".gitignore", "backlog/ignored.json\n")
	write("backlog/ignored.json", "keep ignored")
	repo, err := git.OpenRepository(root)
	if err != nil {
		t.Fatal(err)
	}
	service := &WorktreeService{state: NewState(repo, nil)}
	paths := []string{"backlog/tracked.json", "backlog/_manifest.json", "backlog/nested/new file.json", "backlog/deleted.json"}
	result, err := service.DiscardFiles(context.Background(), paths)
	if err != nil || result.Error != "" || len(result.Completed) != len(paths) {
		t.Fatalf("discard result: %+v, %v", result, err)
	}

	if read("backlog/tracked.json") != "staged version" {
		t.Fatal("did not restore staged content")
	}
	if gitRun("show", ":backlog/tracked.json") != "staged version" {
		t.Fatal("changed the index")
	}
	if read("backlog/deleted.json") != "restore me" {
		t.Fatal("did not restore deletion")
	}
	for _, path := range []string{"backlog/_manifest.json", "backlog/nested/new file.json"} {
		if _, err := os.Lstat(filepath.Join(root, path)); !os.IsNotExist(err) {
			t.Fatalf("untracked file remains: %s", path)
		}
	}
	if read("sibling.json") != "keep" || read("backlog/ignored.json") != "keep ignored" {
		t.Fatal("changed files outside selected scope")
	}
	// A filename containing Git wildcard syntax must never select a sibling.
	write("backlog/[ab].txt", "literal")
	write("backlog/a.txt", "keep")
	if result, err := service.DiscardFiles(context.Background(), []string{"backlog/[ab].txt"}); err != nil || result.Error != "" {
		t.Fatal(err)
	}
	if read("backlog/a.txt") != "keep" {
		t.Fatal("expanded wildcard path")
	}
	for _, path := range []string{"backlog", ".", "../outside", root, ".git/config", "backlog/ignored.json", "bad\x00path"} {
		if result, err := service.DiscardFiles(context.Background(), []string{path}); err == nil && result.Error == "" {
			t.Fatalf("accepted unsafe or ignored target: %s", path)
		}
	}
}

func TestDiscardBatchStopsAtFailureAndEmitsOnce(t *testing.T) {
	root := t.TempDir()
	if out, err := exec.Command("git", "-C", root, "init").CombinedOutput(); err != nil {
		t.Fatalf("init: %s %v", out, err)
	}
	for _, path := range []string{"first", "later"} {
		if err := os.WriteFile(filepath.Join(root, path), []byte("keep until selected"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Mkdir(filepath.Join(root, "directory"), 0700); err != nil {
		t.Fatal(err)
	}
	repo, err := git.OpenRepository(root)
	if err != nil {
		t.Fatal(err)
	}
	events := &batchEvents{}
	service := &WorktreeService{state: &State{repo: repo, emitter: events}}
	result, err := service.DiscardFiles(context.Background(), []string{"first", "./first", "directory", "later"})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Completed) != 1 || result.Completed[0] != "first" || result.FailedPath != "directory" || result.Error == "" || len(result.Remaining) != 1 || result.Remaining[0] != "later" {
		t.Fatalf("partial result: %+v", result)
	}
	if _, err := os.Stat(filepath.Join(root, "first")); !os.IsNotExist(err) {
		t.Fatal("first was not removed")
	}
	if _, err := os.Stat(filepath.Join(root, "later")); err != nil {
		t.Fatal("continued after failure")
	}
	if len(events.names) != 2 || events.names[0] != EventStatusChanged || events.names[1] != EventRepoChanged {
		t.Fatalf("signals: %v", events.names)
	}
	events.names = nil
	result, err = service.DiscardFiles(context.Background(), nil)
	if err != nil || len(result.Completed) != 0 || len(events.names) != 0 {
		t.Fatalf("empty batch: %+v %v %v", result, err, events.names)
	}
}
