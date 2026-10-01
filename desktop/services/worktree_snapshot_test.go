package services

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/atterpac/ichi/internal/git"
)

func TestWorktreeSnapshotIncludesMatchingInfoAndFreshExternalChanges(t *testing.T) {
	root := t.TempDir()
	run := func(args ...string) {
		t.Helper()
		out, err := exec.Command("git", append([]string{"-C", root}, args...)...).CombinedOutput()
		if err != nil {
			t.Fatalf("git: %s %v", out, err)
		}
	}
	run("init")
	run("-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "initial")
	repo, err := git.OpenRepository(root)
	if err != nil {
		t.Fatal(err)
	}
	service := &WorktreeService{state: &State{repo: repo}}
	snapshot, err := service.Summary(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Info.HasUncommitted || snapshot.Info.Unstaged.Untracked != 0 {
		t.Fatalf("clean: %+v", snapshot.Info)
	}
	if err := os.WriteFile(filepath.Join(root, "new file"), []byte("body\n"), 0600); err != nil {
		t.Fatal(err)
	}
	snapshot, err = service.Summary(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !snapshot.Info.HasUncommitted || snapshot.Info.Unstaged.Untracked != 1 || len(snapshot.Summary.Entries) != 1 {
		t.Fatalf("external change missing: %+v", snapshot)
	}
	run("add", "new file")
	snapshot, err = service.Summary(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Info.Staged.Files != 1 || snapshot.Info.Staged.Insertions != 1 || snapshot.Info.Unstaged.Untracked != 0 || len(snapshot.Summary.Staged) != 1 {
		t.Fatalf("mismatched totals: %+v", snapshot)
	}
	data, err := json.Marshal(snapshot.Info)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "new file") {
		t.Fatalf("Info serialized per-file data: %s", data)
	}
}
