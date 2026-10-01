package views

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/atterpac/dado/theme"
	"github.com/atterpac/ichi/internal/git"
)

func viewTestRepo(t *testing.T) (*git.Repository, func(...string) string) {
	t.Helper()
	dir := t.TempDir()
	run := func(args ...string) string {
		t.Helper()
		cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %s %v", args, out, err)
		}
		return strings.TrimSpace(string(out))
	}
	run("init", "-q")
	run("config", "user.name", "Tests")
	run("config", "user.email", "test@example.test")
	if err := os.WriteFile(filepath.Join(dir, "file"), []byte("base\n"), 0600); err != nil {
		t.Fatal(err)
	}
	run("add", "file")
	run("commit", "-qm", "Base")
	repo, err := git.OpenRepository(dir)
	if err != nil {
		t.Fatal(err)
	}
	return repo, run
}

func TestCommitActionRefreshesConflictBeforeFeedback(t *testing.T) {
	repo, run := viewTestRepo(t)
	run("checkout", "-qb", "topic")
	if err := os.WriteFile(filepath.Join(repo.Path(), "file"), []byte("topic\n"), 0600); err != nil {
		t.Fatal(err)
	}
	run("commit", "-qam", "Topic")
	topic := run("rev-parse", "HEAD")
	run("checkout", "-q", "-")
	if err := os.WriteFile(filepath.Join(repo.Path(), "file"), []byte("main\n"), 0600); err != nil {
		t.Fatal(err)
	}
	run("commit", "-qam", "Main")
	queue := make(chan func(), 32)
	theme.SetQueue(func(fn func()) { queue <- fn })
	t.Cleanup(func() { theme.SetQueue(nil) })
	var owner commitActionOwner
	refreshed := false
	complete := false
	loader := owner.run(repo, commitAction{kind: cherryPickCommit, hash: topic}, func() {
		status, err := repo.LoadRepositoryStatus()
		if err != nil {
			t.Fatal(err)
		}
		for _, entry := range status.Entries {
			if entry.IsConflict {
				refreshed = true
			}
		}
	}, func(err error) {
		if err == nil || !refreshed {
			t.Fatalf("failure feedback preceded fresh conflict observation: %v", err)
		}
		complete = true
	})
	for loader.IsRunning() {
		select {
		case fn := <-queue:
			fn()
		case <-time.After(3 * time.Second):
			t.Fatal("action did not finish")
		}
	}
	if !complete {
		t.Fatal("missing failure outcome")
	}
}

func TestStoppedCommitActionCannotRefreshOrReopenFeedback(t *testing.T) {
	repo, _ := viewTestRepo(t)
	queue := make(chan func(), 32)
	theme.SetQueue(func(fn func()) { queue <- fn })
	t.Cleanup(func() { theme.SetQueue(nil) })
	var owner commitActionOwner
	loader := owner.run(repo, commitAction{kind: checkoutCommit, hash: "HEAD"}, func() { t.Error("stopped view refreshed") }, func(error) { t.Error("stopped view displayed feedback") })
	owner.stop()
	for loader.IsRunning() {
		select {
		case fn := <-queue:
			fn()
		case <-time.After(3 * time.Second):
			t.Fatal("stopped action did not terminate")
		}
	}
}

func TestCommitActionContracts(t *testing.T) {
	repo, run := viewTestRepo(t)
	if err := os.WriteFile(filepath.Join(repo.Path(), "file"), []byte("second\n"), 0600); err != nil {
		t.Fatal(err)
	}
	run("commit", "-qam", "Second")
	if err := (commitAction{kind: rewordCommit, hash: run("rev-parse", "HEAD"), message: "Changed message"}).apply(repo); err != nil {
		t.Fatal(err)
	}
	if got := run("log", "-1", "--format=%s"); got != "Changed message" {
		t.Fatal(got)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := (commitAction{kind: checkoutCommit, hash: "HEAD"}).apply(repo.WithContext(ctx)); err != context.Canceled {
		t.Fatalf("action ignored context: %v", err)
	}
	if err := (commitAction{kind: "unknown"}).apply(repo); err == nil {
		t.Fatal("unknown action accepted")
	}
}
