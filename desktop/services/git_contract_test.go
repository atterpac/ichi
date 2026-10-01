package services

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/atterpac/ichi/internal/git"
	"github.com/atterpac/ichi/internal/remote"
)

func TestInspectionUsesExplicitIndexWorktreeAndBoundedPreview(t *testing.T) {
	path, run := conflictTestRepo(t)
	if err := os.WriteFile(filepath.Join(path, "document"), []byte("staged\r\nno final newline"), 0600); err != nil {
		t.Fatal(err)
	}
	run("add", "document")
	if err := os.WriteFile(filepath.Join(path, "document"), []byte("working\r\nno final newline"), 0600); err != nil {
		t.Fatal(err)
	}
	repo, err := git.OpenRepository(path)
	if err != nil {
		t.Fatal(err)
	}
	inspect := &InspectService{state: &State{repo: repo}}
	index, err := inspect.IndexFileContent(context.Background(), "document")
	if err != nil || index != "staged\r\nno final newline" {
		t.Fatalf("index = %q, %v", index, err)
	}
	working, err := inspect.WorkingFileContent(context.Background(), "document")
	if err != nil || working != "working\r\nno final newline" {
		t.Fatalf("worktree = %q, %v", working, err)
	}
	if err := os.WriteFile(filepath.Join(path, "large untracked"), []byte(strings.Repeat("line\n", 20000)), 0600); err != nil {
		t.Fatal(err)
	}
	preview, err := inspect.WorkingFilePreview(context.Background(), "large untracked")
	if err != nil || !preview.Truncated || preview.Binary || len(preview.Content) > git.WorktreePreviewMaxBytes || strings.Count(preview.Content, "\n") != git.WorktreePreviewMaxLines {
		t.Fatalf("bounded preview = %+v, %v", preview, err)
	}
	if err := os.WriteFile(filepath.Join(path, "binary"), []byte("blob\x00tail"), 0600); err != nil {
		t.Fatal(err)
	}
	preview, err = inspect.WorkingFilePreview(context.Background(), "binary")
	if err != nil || !preview.Binary || preview.Content != "" {
		t.Fatalf("binary preview = %+v, %v", preview, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := inspect.WorkingFilePreview(ctx, "document"); !errors.Is(err, context.Canceled) {
		t.Fatalf("inspection cancellation = %v", err)
	}
}

func TestBridgeGitReadsAndMutationsCancel(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell process fixture")
	}
	path, run := conflictTestRepo(t)
	run("commit", "--allow-empty", "-m", "initial")
	repo, err := git.OpenRepository(path)
	if err != nil {
		t.Fatal(err)
	}
	events := &batchEvents{}
	state := &State{repo: repo, emitter: events}
	bin := t.TempDir()
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte("#!/bin/sh\nexec sleep 30\n"), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	for _, tc := range []struct {
		name    string
		mutates bool
		call    func(context.Context) error
	}{
		{"remote", true, func(ctx context.Context) error { return (&RemoteService{state: state}).Fetch(ctx, "origin") }},
		{"search", false, func(ctx context.Context) error {
			_, err := (&GraphService{state: state}).SearchCommits(ctx, "needle", 20)
			return err
		}},
		{"graph", false, func(ctx context.Context) error {
			_, err := (&GraphService{state: state}).LoadGraphLayout(ctx, 80, false)
			return err
		}},
		{"diff", false, func(ctx context.Context) error {
			_, err := (&DiffService{state: state}).WorktreeFile(ctx, "document", "", false)
			return err
		}},
		{"index", true, func(ctx context.Context) error {
			return (&WorktreeService{state: state}).StageFiles(ctx, []string{"document"})
		}},
		{"ref", true, func(ctx context.Context) error { return (&RefService{state: state}).MergeBranch(ctx, "topic") }},
		{"stash", true, func(ctx context.Context) error { return (&StashService{state: state}).StashApplyIndex(ctx, 0) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			events.names = nil
			ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
			defer cancel()
			if err := tc.call(ctx); !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("bridge context was lost: %v", err)
			}
			refreshes := 0
			for _, name := range events.names {
				if name == EventStatusChanged || name == EventRepoChanged {
					refreshes++
				}
			}
			if tc.mutates && refreshes != 2 {
				t.Fatalf("canceled attempted mutation lost refresh: %v", events.names)
			}
			if !tc.mutates && len(events.names) != 0 {
				t.Fatalf("canceled read emitted mutation: %v", events.names)
			}
			if state.repo != repo {
				t.Fatal("per-call context replaced repository ownership")
			}
		})
	}
}

func TestDesktopStatusReadFailuresRemainErrors(t *testing.T) {
	path, run := conflictTestRepo(t)
	repo, err := git.OpenRepository(path)
	if err != nil {
		t.Fatal(err)
	}
	state := &State{repo: repo}
	graph, err := (&GraphService{state: state}).LoadGraphLayout(context.Background(), 80, false)
	if err != nil || len(graph.Rows) != 0 {
		t.Fatalf("unborn graph = %+v, %v", graph, err)
	}
	run("commit", "--allow-empty", "-m", "initial")
	run("checkout", "--detach")
	graph, err = (&GraphService{state: state}).LoadGraphLayout(context.Background(), 80, false)
	if err != nil || graph.CurrentBranch != "HEAD" || len(graph.Rows) != 1 {
		t.Fatalf("detached graph = %+v, %v", graph, err)
	}
	if err := os.WriteFile(filepath.Join(path, ".git", "index"), []byte("corrupt index"), 0600); err != nil {
		t.Fatal(err)
	}
	if graph, err := (&GraphService{state: state}).LoadGraphLayout(context.Background(), 80, false); err == nil || graph != nil {
		t.Fatalf("failed read became clean graph: %+v, %v", graph, err)
	}
	if upstream, err := (&RemoteService{state: state}).HasUpstream(context.Background()); err == nil || upstream {
		t.Fatalf("failed read became no upstream: %v, %v", upstream, err)
	}
}

func TestPRAuthenticationUsesBridgeContext(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell process fixture")
	}
	path, run := conflictTestRepo(t)
	run("remote", "add", "origin", "https://github.com/example/repository.git")
	repo, err := git.OpenRepository(path)
	if err != nil {
		t.Fatal(err)
	}
	bin := t.TempDir()
	if err := os.WriteFile(filepath.Join(bin, "gh"), []byte("#!/bin/sh\nexec sleep 30\n"), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	events := &batchEvents{}
	service := &PRService{state: &State{repo: repo, emitter: events}}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	if _, err := service.ListPRs(ctx, "origin", remote.ListPRsOpts{}); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("PR authentication lost cancellation: %v", err)
	}
	if len(events.names) != 0 {
		t.Fatalf("canceled authentication published PR mutation: %v", events.names)
	}
}

func TestCompletionCancellationAndExplicitReadErrors(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell process fixture")
	}
	path, run := conflictTestRepo(t)
	repo, err := git.OpenRepository(path)
	if err != nil {
		t.Fatal(err)
	}
	service := &CompletionService{state: &State{repo: repo}}
	if err := os.WriteFile(filepath.Join(path, "document"), []byte("tracked"), 0600); err != nil {
		t.Fatal(err)
	}
	run("add", "document")
	values, err := service.Complete(context.Background(), "blame doc")
	if err != nil || len(values) != 1 || values[0] != "document" {
		t.Fatalf("headless completion = %v, %v", values, err)
	}
	suggestion, err := service.Suggest(context.Background(), "blame doc")
	if err != nil || suggestion != "blame document" {
		t.Fatalf("headless suggestion = %q, %v", suggestion, err)
	}
	if names := service.CommandNames(); !slices.Contains(names, "blame") || !slices.Contains(names, "b") {
		t.Fatalf("headless command descriptors missing blame/alias: %v", names)
	}
	bin := t.TempDir()
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte("#!/bin/sh\nexec sleep 30\n"), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	if _, err := service.ListFiles(ctx, ""); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("file completion lost cancellation: %v", err)
	}
	for _, call := range []func(context.Context) error{
		func(ctx context.Context) error { _, err := service.Complete(ctx, "blame doc"); return err },
		func(ctx context.Context) error { _, err := service.Suggest(ctx, "blame doc"); return err },
	} {
		ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
		err := call(ctx)
		cancel()
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("best-effort library masked cancellation: %v", err)
		}
	}
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte("#!/bin/sh\necho 'read failed' >&2\nexit 128\n"), 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := service.ListFiles(context.Background(), ""); err == nil {
		t.Fatal("explicit completion read suppressed failure")
	}
}
