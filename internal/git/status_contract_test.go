package git

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

func TestStatusAndGraphDistinguishUnbornDetachedAndFailure(t *testing.T) {
	repo, run := diffTestRepo(t)
	status, err := repo.LoadRepositoryStatus()
	if err != nil || status.Head != "" || status.DetachedHead || status.Branch == "" || status.HasUpstream {
		t.Fatalf("unborn = %+v, %v", status, err)
	}
	graph, err := repo.LoadGraph(80)
	if err != nil || len(graph.Commits) != 0 || graph.CurrentBranch != status.Branch {
		t.Fatalf("unborn graph = %+v, %v", graph, err)
	}
	run("commit", "--allow-empty", "-m", "initial")
	run("checkout", "--detach")
	status, err = repo.LoadRepositoryStatus()
	if err != nil || !status.DetachedHead || status.Branch != "HEAD" || status.Head == "" {
		t.Fatalf("detached = %+v, %v", status, err)
	}
	graph, err = repo.LoadGraph(80)
	if err != nil || graph.CurrentBranch != "HEAD" || len(graph.Commits) != 1 {
		t.Fatalf("detached graph = %+v, %v", graph, err)
	}
	if err := os.WriteFile(filepath.Join(repo.path, ".git", "index"), []byte("corrupt index"), 0600); err != nil {
		t.Fatal(err)
	}
	if status, err := repo.LoadRepositoryStatus(); err == nil || status != nil {
		t.Fatalf("read failure reported status: %+v, %v", status, err)
	}
	if graph, err := repo.LoadGraph(80); err == nil || graph != nil {
		t.Fatalf("read failure reported graph: %+v, %v", graph, err)
	}
}

func TestUnavailableGitDoesNotBecomeEmptyMetadata(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell failure fixture")
	}
	repo, _ := diffTestRepo(t)
	bin := t.TempDir()
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte("#!/bin/sh\necho 'read failed' >&2\nexit 128\n"), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	for _, tc := range []struct {
		name string
		read func() error
	}{
		{"status", func() error { _, err := repo.LoadRepositoryStatus(); return err }},
		{"snapshot", func() error { _, err := repo.LoadRepositorySnapshot(); return err }},
		{"files", func() error { _, err := repo.ReadFiles(""); return err }},
		{"branch names", func() error { _, err := repo.ReadBranchNames(""); return err }},
		{"tag names", func() error { _, err := repo.ReadTagNames(""); return err }},
		{"stash entries", func() error { _, err := repo.ReadStashEntries(""); return err }},
		{"commit hashes", func() error { _, err := repo.ReadRecentCommitHashes("", 20); return err }},
		{"remote names", func() error { _, err := repo.ReadRemoteNames(); return err }},
		{"remote url", func() error { _, err := repo.ReadRemoteURL("origin"); return err }},
		{"pushed", func() error { _, err := repo.ReadCommitPushed("HEAD"); return err }},
		{"stashes", func() error { _, err := repo.LoadStashes(); return err }},
		{"search", func() error { _, err := repo.SearchCommits("needle", 10); return err }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := tc.read(); err == nil {
				t.Fatal("command failure was suppressed")
			}
		})
	}
}

func TestNilHunksRejectWithoutMutation(t *testing.T) {
	repo, _ := diffTestRepo(t)
	for _, call := range []func(string, *DiffHunk) error{repo.StageHunk, repo.UnstageHunk, repo.DiscardHunk} {
		if err := call("missing", nil); err == nil {
			t.Fatal("nil hunk accepted")
		}
	}
}

func TestExplicitMetadataReadsKeepLegitimateEmptyStates(t *testing.T) {
	repo, run := diffTestRepo(t)
	hashes, err := repo.ReadRecentCommitHashes("", 20)
	if err != nil || len(hashes) != 0 {
		t.Fatalf("unborn hashes = %v, %v", hashes, err)
	}
	names, err := repo.ReadRemoteNames()
	if err != nil || len(names) != 0 {
		t.Fatalf("empty remotes = %v, %v", names, err)
	}
	run("remote", "add", "origin", "https://example.invalid/repo.git")
	url, err := repo.ReadRemoteURL("origin")
	if err != nil || url != "https://example.invalid/repo.git" {
		t.Fatalf("remote URL = %q, %v", url, err)
	}
	literal := " leading [ab]\tname\n"
	if err := os.WriteFile(filepath.Join(repo.path, literal), []byte("tracked"), 0600); err != nil {
		t.Fatal(err)
	}
	run("add", "--", literal)
	files, err := repo.ReadFiles("")
	if err != nil || len(files) != 1 || files[0] != literal {
		t.Fatalf("literal completion files = %q, %v", files, err)
	}
}

func TestReadFailuresRetainExitErrorContract(t *testing.T) {
	repo, _ := diffTestRepo(t)
	_, err := repo.IndexFileContent("missing")
	var exitErr *exec.ExitError
	if !errors.As(err, &exitErr) || exitErr.ExitCode() == 0 {
		t.Fatalf("Git exit cause lost: %v", err)
	}
}
