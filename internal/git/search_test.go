package git

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

func newSearchFixture(t *testing.T) *Repository {
	t.Helper()
	dir := t.TempDir()
	git := func(args ...string) string {
		cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Alice", "GIT_AUTHOR_EMAIL=alice@example.com",
			"GIT_COMMITTER_NAME=Alice", "GIT_COMMITTER_EMAIL=alice@example.com",
		)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
		return strings.TrimSpace(string(out))
	}
	git("init", "-b", "main")
	git("commit", "--allow-empty", "-m", "Add Diff view")
	git("commit", "--allow-empty", "-m", "unrelated work")

	repo, err := OpenRepository(dir)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	return repo
}

func TestSearchCommitsCaseInsensitiveMessage(t *testing.T) {
	repo := newSearchFixture(t)
	found, err := repo.SearchCommits("diff", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(found) != 1 || found[0].Message != "Add Diff view" {
		t.Fatalf("expected the Diff commit, got %+v", found)
	}
}

func TestSearchCommitsByHashPrefix(t *testing.T) {
	repo := newSearchFixture(t)
	all, err := repo.SearchCommits("work", 10)
	if err != nil || len(all) != 1 {
		t.Fatalf("fixture lookup failed: %v %+v", err, all)
	}
	prefix := all[0].Hash[:7]

	found, err := repo.SearchCommits(prefix, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(found) == 0 || found[0].Hash != all[0].Hash {
		t.Fatalf("expected hash %s first, got %+v", prefix, found)
	}
}

func TestSearchCommitsByAuthor(t *testing.T) {
	repo := newSearchFixture(t)
	found, err := repo.SearchCommits("alice", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(found) != 2 {
		t.Fatalf("expected both commits by author, got %+v", found)
	}
}
