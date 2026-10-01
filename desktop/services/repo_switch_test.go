package services

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/atterpac/ichi/internal/git"
)

func TestOpenRepositorySwitch(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	root := filepath.Join(home, "project with spaces")
	if err := os.MkdirAll(filepath.Join(root, "nested"), 0755); err != nil {
		t.Fatal(err)
	}
	if output, err := exec.Command("git", "init", root).CombinedOutput(); err != nil {
		t.Fatalf("git init: %s %v", output, err)
	}
	service := &RepoService{state: NewState(nil, nil)}
	info, err := service.Open(context.Background(), "~/project with spaces/nested")
	if err != nil {
		t.Fatal(err)
	}
	if info.Path != root {
		t.Fatalf("expected root %q, got %q", root, info.Path)
	}
	original, _ := service.state.Repo()
	for _, path := range []string{"", filepath.Join(home, "missing"), home} {
		if _, err := service.Open(context.Background(), path); err == nil {
			t.Fatalf("opened invalid path %q", path)
		}
		current, _ := service.state.Repo()
		if current != original {
			t.Fatal("failed switch changed the active repository")
		}
	}
}

func TestOpenSnapshotFailureDoesNotPublishSwitch(t *testing.T) {
	profileTestEnv(t)
	oldPath, candidatePath := t.TempDir(), t.TempDir()
	for _, path := range []string{oldPath, candidatePath} {
		if out, err := exec.Command("git", "-C", path, "init").CombinedOutput(); err != nil {
			t.Fatalf("init: %s, %v", out, err)
		}
	}
	oldRepo, err := git.OpenRepository(oldPath)
	if err != nil {
		t.Fatal(err)
	}
	// Repository discovery succeeds; reading its worktree snapshot fails later.
	if err := os.WriteFile(filepath.Join(candidatePath, ".git", "index"), []byte("invalid index"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := git.OpenRepository(candidatePath); err != nil {
		t.Fatalf("candidate must pass repository validation: %v", err)
	}
	events := &batchEvents{}
	service := &RepoService{state: NewState(oldRepo, events)}
	rememberRepository(oldPath)
	session, err := sessionPath()
	if err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(session)
	if err != nil {
		t.Fatal(err)
	}
	if info, err := service.Open(context.Background(), candidatePath); err == nil || info != nil {
		t.Fatalf("failed snapshot returned %+v, %v", info, err)
	}
	current, err := service.state.Repo()
	if err != nil || current != oldRepo {
		t.Fatalf("failed switch changed backend identity: %v, %v", current, err)
	}
	info, err := service.Info(context.Background())
	if err != nil || info.Path != oldPath {
		t.Fatalf("frontend refresh identity = %+v, %v", info, err)
	}
	if len(events.names) != 0 {
		t.Fatalf("failed candidate emitted switch: %v", events.names)
	}
	after, err := os.ReadFile(session)
	if err != nil || string(after) != string(before) {
		t.Fatalf("failed switch changed remembered repository: %q, %v", after, err)
	}
	if err := os.Remove(filepath.Join(candidatePath, ".git", "index")); err != nil {
		t.Fatal(err)
	}
	info, err = service.Open(context.Background(), candidatePath)
	if err != nil || info.Path != candidatePath || len(events.names) != 1 || events.names[0] != EventRepoChanged {
		t.Fatalf("retry = %+v, %v, %v", info, err, events.names)
	}
}
