package services

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/atterpac/ichi/internal/git"
)

func TestDesktopDiffStopsBeforeParsingOversizedPatch(t *testing.T) {
	root, run := conflictTestRepo(t)
	path := filepath.Join(root, "large.txt")
	if err := os.WriteFile(path, []byte("small\n"), 0600); err != nil {
		t.Fatal(err)
	}
	run("add", "large.txt")
	run("commit", "-m", "small file")
	repo, err := git.OpenRepository(root)
	if err != nil {
		t.Fatal(err)
	}
	state := &State{repo: repo}
	service := &DiffService{state: state}
	for _, content := range []string{strings.Repeat("added\n", 25000), strings.Repeat("x", 5<<20) + "\n"} {
		if err := os.WriteFile(path, []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
		patch, err := service.WorktreeFile(context.Background(), "large.txt", "", false)
		if patch != nil || !errors.Is(err, git.ErrReadLimit) {
			t.Fatalf("oversized patch escaped: %v %v", patch, err)
		}
	}
	// File-level operations stay available even when a preview is too large.
	if err := (&WorktreeService{state: state}).StageFiles(context.Background(), []string{"large.txt"}); err != nil {
		t.Fatal(err)
	}
}

func TestPatchHeaderCannotReserveAnUnboundedLineArray(t *testing.T) {
	patch := "diff --git a/file b/file\n--- a/file\n+++ b/file\n@@ -1,1000000000 +1,1000000000 @@\n context\n"
	files, err := git.ParseDiff(patch)
	if err != nil || len(files) != 1 || len(files[0].Hunks) != 1 {
		t.Fatalf("parse: %v %v", files, err)
	}
	if cap(files[0].Hunks[0].Lines) > 20 {
		t.Fatal("hunk allocated from a declared count rather than actual data")
	}
}

func TestParsedDiffsKeepIndexAndWorktreeSeparate(t *testing.T) {
	root := t.TempDir()
	run := func(args ...string) {
		t.Helper()
		out, err := exec.Command("git", append([]string{"-C", root}, args...)...).CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %s: %v", args, out, err)
		}
	}
	run("init")
	run("config", "user.name", "Test")
	run("config", "user.email", "test@example.com")
	run("config", "commit.gpgsign", "false")
	write := func(content string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(root, "file with spaces.txt"), []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	write("original\n")
	run("add", ".")
	run("commit", "-m", "initial")
	write("staged\n")
	run("add", ".")
	write("working\n")
	repo, err := git.OpenRepository(root)
	if err != nil {
		t.Fatal(err)
	}
	service := &DiffService{state: &State{repo: repo}}
	for _, tc := range []struct {
		name           string
		staged         bool
		added, removed string
	}{
		{"staged", true, "staged", "original"},
		{"working", false, "working", "staged"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			file, err := service.WorktreeFile(context.Background(), "file with spaces.txt", "", tc.staged)
			if err != nil || file == nil {
				t.Fatalf("file = %+v, error = %v", file, err)
			}
			if file.Path != "file with spaces.txt" || file.OldPath != "file with spaces.txt" {
				t.Fatalf("incorrect paths: %+v", file)
			}
			var added, removed []string
			for _, hunk := range file.Hunks {
				for _, line := range hunk.Lines {
					switch line.Type {
					case git.LineAdded:
						added = append(added, line.Content)
					case git.LineRemoved:
						removed = append(removed, line.Content)
					}
				}
			}
			if strings.Join(added, "\n") != tc.added || strings.Join(removed, "\n") != tc.removed {
				t.Fatalf("added %q, removed %q", added, removed)
			}
		})
	}
	run("add", ".")
	run("commit", "-m", "change")
	for _, read := range []func() ([]*git.FileDiff, error){
		func() ([]*git.FileDiff, error) {
			return service.FileDiff(context.Background(), "HEAD", "file with spaces.txt")
		},
		func() ([]*git.FileDiff, error) { return service.DiffBetween(context.Background(), "HEAD~1", "HEAD") },
	} {
		files, err := read()
		if err != nil || len(files) != 1 || files[0].Path != "file with spaces.txt" || len(files[0].Hunks) != 1 {
			t.Fatalf("commit comparison = %+v, %v", files, err)
		}
	}
	if _, err := service.FileDiff(context.Background(), "nonexistent-ref", "file with spaces.txt"); err == nil {
		t.Fatal("invalid revision error was swallowed")
	}
	run("reset", "--hard", "HEAD")
	for _, staged := range []bool{false, true} {
		file, err := service.WorktreeFile(context.Background(), "file with spaces.txt", "", staged)
		if err != nil || file != nil {
			t.Fatalf("clean diff = %+v, %v", file, err)
		}
	}
	if _, err := service.WorktreeFile(context.Background(), "", "", false); err == nil {
		t.Fatal("accepted empty path")
	}
	service.state.SetRepo(nil)
	if _, err := service.WorktreeFile(context.Background(), "file with spaces.txt", "", false); err == nil {
		t.Fatal("missing repository error was swallowed")
	}
}

func TestSelectedComparisonPreservesRenameAndExcludesOtherPatches(t *testing.T) {
	path, run := conflictTestRepo(t)
	oldPath, newPath := "old\t[ab].txt", "new\t[ab].txt"
	body := "one\ntwo\nthree\nfour\nfive\n"
	if err := os.WriteFile(filepath.Join(path, oldPath), []byte(body), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(path, "unrelated"), []byte("original\n"), 0600); err != nil {
		t.Fatal(err)
	}
	run("add", ".")
	run("commit", "-m", "initial")
	run("mv", oldPath, newPath)
	if err := os.WriteFile(filepath.Join(path, newPath), []byte(body+"six\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(path, "unrelated"), []byte("unrelated replacement\n"), 0600); err != nil {
		t.Fatal(err)
	}
	run("add", ".")
	run("commit", "-m", "rename and unrelated change")
	repo, err := git.OpenRepository(path)
	if err != nil {
		t.Fatal(err)
	}
	state := &State{repo: repo}
	summary, err := (&RefService{state: state}).DiffFiles(context.Background(), "HEAD~1", "HEAD")
	if err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, entry := range summary {
		if entry.Path == newPath && entry.OldPath == oldPath {
			found = true
		}
	}
	if !found {
		t.Fatalf("rename summary loses literal identities: %+v", summary)
	}
	service := &DiffService{state: state}
	for _, source := range []string{"", oldPath} {
		file, err := service.DiffBetweenFile(context.Background(), "HEAD~1", "HEAD", newPath, source)
		if err != nil || file == nil || file.Path != newPath || file.OldPath != oldPath || len(file.Hunks) != 1 {
			t.Fatalf("selected rename = %+v, %v", file, err)
		}
		for _, hunk := range file.Hunks {
			for _, line := range hunk.Lines {
				if strings.Contains(line.Content, "unrelated") {
					t.Fatal("selected result includes unrelated content")
				}
			}
		}
	}
	for _, tc := range []struct {
		from, to, file string
		fail           bool
	}{
		{"HEAD", "HEAD", newPath, false},
		{"HEAD~1", "HEAD", "missing", false},
		{"HEAD~1", "HEAD", "", true},
		{"missing-ref", "HEAD", newPath, true},
		{"--stat", "HEAD", newPath, true},
	} {
		file, err := service.DiffBetweenFile(context.Background(), tc.from, tc.to, tc.file, "")
		if (err != nil) != tc.fail || (!tc.fail && file != nil) {
			t.Fatalf("comparison (%q,%q,%q) = %+v, %v", tc.from, tc.to, tc.file, file, err)
		}
	}
	state.SetRepo(nil)
	if _, err := service.DiffBetweenFile(context.Background(), "HEAD~1", "HEAD", newPath, ""); err == nil {
		t.Fatal("missing repository error swallowed")
	}
}
