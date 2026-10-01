package git

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestRepositorySnapshotCommandsAndCounts(t *testing.T) {
	repo, run := diffTestRepo(t)
	write := func(name, body string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(repo.path, name), []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
	}
	write("tracked", "original\n")
	run("add", ".")
	run("commit", "-m", "initial")
	run("branch", "upstream")
	run("branch", "--set-upstream-to=upstream")
	write("stashed", "stash\n")
	run("add", ".")
	run("stash", "push", "-m", "saved")
	write("tracked", "staged\n")
	run("add", "tracked")
	write("tracked", "working\nextra\n")
	untracked := "untracked\nname"
	if runtime.GOOS == "windows" {
		untracked = "untracked name"
	}
	write(untracked, "unknown\n")
	run("remote", "add", "one", "https://example.invalid/one")
	run("remote", "add", "two", "alias:two")
	run("config", "url.https://example.invalid/.insteadOf", "alias:")
	run("config", "core.abbrev", "10")
	run("config", "status.aheadBehind", "false")
	trace := filepath.Join(t.TempDir(), "trace")
	t.Setenv("GIT_TRACE", trace)
	snapshot, err := repo.LoadRepositorySnapshot()
	if err != nil {
		t.Fatal(err)
	}
	log, _ := os.ReadFile(trace)
	if strings.Count(string(log), "built-in: git") != 5 {
		t.Fatalf("want five commands: %s", log)
	}
	if snapshot.Head == "" || len(snapshot.ShortHead) != 10 || !snapshot.HasUpstream || snapshot.DetachedHead || snapshot.StashCount != 1 {
		t.Fatalf("metadata: %+v", snapshot)
	}
	staged, working := snapshot.Worktree.ChangeCounts()
	if staged.Files != 1 || staged.Insertions != 1 || staged.Deletions != 1 || working.Files != 1 || working.Insertions != 2 || working.Deletions != 1 || working.Untracked != 1 {
		t.Fatalf("counts: %+v %+v", staged, working)
	}
	if len(snapshot.Remotes) != 2 || snapshot.Remotes[1].URL != "https://example.invalid/two" {
		t.Fatalf("remotes: %+v", snapshot.Remotes)
	}
	run("add", ".")
	run("commit", "-m", "ahead")
	snapshot, err = repo.LoadRepositorySnapshot()
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Ahead != 1 || snapshot.Behind != 0 || len(snapshot.Worktree.Entries) != 0 {
		t.Fatalf("fresh counts: %+v", snapshot)
	}
	run("checkout", "--detach")
	snapshot, err = repo.LoadRepositorySnapshot()
	if err != nil {
		t.Fatal(err)
	}
	if !snapshot.DetachedHead || snapshot.Branch != "HEAD" || snapshot.HasUpstream {
		t.Fatalf("detached: %+v", snapshot)
	}
}

func TestRepositorySnapshotUnbornAndMissingUpstream(t *testing.T) {
	repo, run := diffTestRepo(t)
	snapshot, err := repo.LoadRepositorySnapshot()
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Head != "" || snapshot.ShortHead != "" || snapshot.DetachedHead || snapshot.Branch == "" || snapshot.HasUpstream || len(snapshot.Remotes) != 0 {
		t.Fatalf("unborn: %+v", snapshot)
	}
	run("commit", "--allow-empty", "-m", "initial")
	branch := strings.TrimSpace(run("branch", "--show-current"))
	run("config", "branch."+branch+".remote", ".")
	run("config", "branch."+branch+".merge", "refs/heads/missing")
	snapshot, err = repo.LoadRepositorySnapshot()
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.HasUpstream {
		t.Fatal("nonexistent upstream marked present")
	}
	repo.path = filepath.Join(t.TempDir(), "missing")
	if _, err := repo.LoadRepositorySnapshot(); err == nil {
		t.Fatal("failed read reported a clean repository")
	}
}
