package git

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestBatchStageUnstageLiteralPaths(t *testing.T) {
	repo, run := diffTestRepo(t)
	names := []string{"spaces file", "[literal]", "literal", "--flag", "quote\"name", "café"}
	if runtime.GOOS != "windows" {
		names = append(names, "tab\tname", "line\nname", "back\\slash")
	} else {
		names[4] = "quote-name"
	}
	for i := 0; i < 100; i++ {
		names = append(names, fmt.Sprintf("file-%03d", i))
	}
	write := func(name, body string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(repo.path, name), []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, name := range names {
		write(name, "original\n")
	}
	write("unrelated", "original\n")
	write("l", "original\n")
	run("add", ".")
	run("commit", "-m", "initial")
	for _, name := range names {
		write(name, "changed\n")
	}
	write("unrelated", "changed\n")
	write("l", "changed\n")
	trace := filepath.Join(t.TempDir(), "trace")
	t.Setenv("GIT_TRACE", trace)
	if err := repo.StageFiles(append(names, names[0])); err != nil {
		t.Fatal(err)
	}
	log, _ := os.ReadFile(trace)
	if strings.Count(string(log), "built-in: git") != 1 {
		t.Fatalf("stage launched extra commands: %s", log)
	}
	staged := strings.Split(strings.TrimSuffix(run("diff", "--cached", "--name-only", "-z"), "\x00"), "\x00")
	if len(staged) != len(names) {
		t.Fatalf("staged %d, want %d", len(staged), len(names))
	}
	for _, name := range staged {
		if name == "unrelated" {
			t.Fatal("staged unrelated file")
		}
	}
	if err := os.WriteFile(trace, nil, 0600); err != nil {
		t.Fatal(err)
	}
	if err := repo.UnstageFiles(names); err != nil {
		t.Fatal(err)
	}
	log, _ = os.ReadFile(trace)
	if strings.Count(string(log), "built-in: git") != 1 {
		t.Fatalf("unstage launched extra commands: %s", log)
	}
	if out := run("diff", "--cached", "--name-only"); out != "" {
		t.Fatalf("still staged: %s", out)
	}
	for _, name := range names {
		body, err := os.ReadFile(filepath.Join(repo.path, name))
		if err != nil || string(body) != "changed\n" {
			t.Fatalf("worktree modified: %q, %v", name, err)
		}
	}
	// A literal bracket pattern must never select its matching sibling.
	if err := repo.StageFiles([]string{"[literal]"}); err != nil {
		t.Fatal(err)
	}
	if out := run("diff", "--cached", "--name-only"); strings.TrimSpace(out) != "[literal]" {
		t.Fatalf("pathspec expanded: %s", out)
	}
}

func TestBatchUnstageBeforeFirstCommitAndRename(t *testing.T) {
	repo, run := diffTestRepo(t)
	if err := os.WriteFile(filepath.Join(repo.path, "old name"), []byte("body\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := repo.StageFiles([]string{"old name"}); err != nil {
		t.Fatal(err)
	}
	if err := repo.UnstageFiles([]string{"old name"}); err != nil {
		t.Fatal(err)
	}
	if out := run("ls-files"); out != "" {
		t.Fatalf("unborn unstage failed: %s", out)
	}
	run("add", ".")
	run("commit", "-m", "initial")
	run("mv", "old name", "new name")
	if err := repo.UnstageFiles([]string{"old name", "new name"}); err != nil {
		t.Fatal(err)
	}
	if out := run("diff", "--cached", "--name-only"); out != "" {
		t.Fatalf("partial rename: %s", out)
	}
	if err := repo.StageFiles([]string{"old name", "new name"}); err != nil {
		t.Fatal(err)
	}
	if out := run("diff", "--cached", "--name-status"); !strings.Contains(out, "R100") {
		t.Fatalf("rename not staged: %s", out)
	}
}

func TestBatchRejectsInvalidPathsBeforeChangingIndex(t *testing.T) {
	repo, run := diffTestRepo(t)
	if err := os.WriteFile(filepath.Join(repo.path, "valid"), []byte("body\n"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"", ".", "../outside", "/outside", ".git/config", "bad\x00path"} {
		if err := repo.StageFiles([]string{"valid", bad}); err == nil {
			t.Fatalf("accepted %q", bad)
		}
		if out := run("ls-files"); out != "" {
			t.Fatalf("partial stage for %q: %s", bad, out)
		}
	}
	if err := repo.StageFiles([]string{"valid", "missing"}); err == nil {
		t.Fatal("missing path accepted")
	}
	if out := run("ls-files"); out != "" {
		t.Fatalf("index changed after failure: %s", out)
	}
	if err := repo.StageFiles(nil); err != nil {
		t.Fatal(err)
	}
	if err := repo.UnstageFiles(nil); err != nil {
		t.Fatal(err)
	}
}
