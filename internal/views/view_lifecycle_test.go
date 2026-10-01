package views

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/atterpac/dado/components"
	"github.com/atterpac/dado/theme"
	"github.com/atterpac/ichi/internal/git"
)

func TestDelayedGraphHighlightCannotRestartStoppedView(t *testing.T) {
	repo, run := viewTestRepo(t)
	queue := make(chan func(), 32)
	theme.SetQueue(func(fn func()) { queue <- fn })
	t.Cleanup(func() { theme.SetQueue(nil) })
	v := NewGraphView(nil, repo)
	v.gitGraph.SetChangeDebounce(time.Millisecond)
	graph := components.NewGitGraphData()
	graph.AddCommit(&components.GitCommit{Hash: run("rev-parse", "HEAD")})
	v.gitGraph.SetGraph(graph)
	v.active = true
	v.detailView.SetText("Before")
	v.gitGraph.SetSelectedIndex(0)
	v.Stop()
	select {
	case fn := <-queue:
		fn()
	case <-time.After(3 * time.Second):
		t.Fatal("debounce callback never arrived")
	}
	if v.detailCancel != nil || v.detailView.GetText() != "Before" {
		v.Stop()
		t.Fatal("hidden graph restarted a detail read")
	}
}

func TestCommitViewsStopOwnsDetailAndMutationLifetimes(t *testing.T) {
	repo, _ := viewTestRepo(t)
	for _, name := range []string{"graph", "commit"} {
		t.Run(name, func(t *testing.T) {
			queue := make(chan func(), 32)
			theme.SetQueue(func(fn func()) { queue <- fn })
			t.Cleanup(func() { theme.SetQueue(nil) })
			ctx, cancel := context.WithCancel(context.Background())
			var owner *commitActionOwner
			var stop func()
			if name == "graph" {
				v := &GraphView{detailCancel: cancel}
				owner, stop = &v.mutations, v.Stop
			} else {
				v := &CommitView{cancel: cancel}
				owner, stop = &v.mutations, v.Stop
			}
			loader := owner.run(repo, commitAction{kind: checkoutCommit, hash: "HEAD"}, func() { t.Error("stopped view refreshed") }, func(error) { t.Error("stopped view displayed feedback") })
			stop()
			if ctx.Err() != context.Canceled {
				t.Fatal("detail read outlived view")
			}
			for loader.IsRunning() {
				select {
				case fn := <-queue:
					fn()
				case <-time.After(3 * time.Second):
					t.Fatal("mutation outlived view")
				}
			}
		})
	}
}

func TestStagingNodeSelectionContracts(t *testing.T) {
	repo, run := viewTestRepo(t)
	if err := os.Rename(filepath.Join(repo.Path(), "file"), filepath.Join(repo.Path(), "renamed")); err != nil {
		t.Fatal(err)
	}
	run("add", "-A")
	status, err := repo.Status()
	if err != nil || len(status) != 1 {
		t.Fatalf("rename status=%v error=%v", status, err)
	}
	data := &nodeData{isFile: true, file: &status[0]}
	if err := applyStagingNode(repo, nil, data, true); err != nil {
		t.Fatal(err)
	}
	if got := run("diff", "--cached", "--name-only"); got != "" {
		t.Fatalf("rename unstage left old path staged: %s", got)
	}
	root := &components.TreeNode{Data: &nodeData{isDir: true}}
	old := &git.StatusEntry{Path: "file", WorkStatus: git.FileDeleted}
	newFile := &git.StatusEntry{Path: "renamed", IsUntracked: true}
	root.AddChild(&components.TreeNode{Data: &nodeData{isFile: true, file: old}})
	root.AddChild(&components.TreeNode{Data: &nodeData{isFile: true, file: newFile}})
	if err := applyStagingNode(repo, root, root.Data.(*nodeData), false); err != nil {
		t.Fatal(err)
	}
	if got := run("diff", "--cached", "--name-status"); got == "" {
		t.Fatal("directory action staged no files")
	}
	if err := applyStagingNode(repo, nil, &nodeData{}, false); err == nil {
		t.Fatal("missing file accepted")
	}
	if err := applyStagingNode(repo, nil, &nodeData{file: old}, false); err == nil {
		t.Fatal("missing hunk accepted")
	}
}
