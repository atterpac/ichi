package git

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestIndexAndWorktreeContentAreExplicit(t *testing.T) {
	repo, run := diffTestRepo(t)
	file := "literal [ab]\tname"
	if err := os.WriteFile(filepath.Join(repo.path, file), []byte("staged\r\nno final newline"), 0600); err != nil {
		t.Fatal(err)
	}
	run("add", "--", file)
	if err := os.WriteFile(filepath.Join(repo.path, file), []byte("working\r\nno final newline"), 0600); err != nil {
		t.Fatal(err)
	}
	index, err := repo.IndexFileContent(file)
	if err != nil || index != "staged\r\nno final newline" {
		t.Fatalf("index = %q, %v", index, err)
	}
	working, err := repo.WorkingFileContent(file)
	if err != nil || working != "working\r\nno final newline" {
		t.Fatalf("worktree = %q, %v", working, err)
	}
	run("rm", "--cached", "-f", "--", file)
	if _, err := repo.IndexFileContent(file); err == nil {
		t.Fatal("missing index content silently fell back to disk")
	}
	if err := os.Remove(filepath.Join(repo.path, file)); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.WorkingFileContent(file); err == nil {
		t.Fatal("missing worktree file silently read the index")
	}
}

func TestWorktreePreviewBoundsAndTextContracts(t *testing.T) {
	repo, _ := diffTestRepo(t)
	for _, tc := range []struct {
		name, body, want  string
		truncated, binary bool
	}{
		{"crlf", "one\r\ntwo", "one\r\ntwo", false, false},
		{"empty", "", "", false, false},
		{"byte limit", strings.Repeat("x", WorktreePreviewMaxBytes*5), strings.Repeat("x", WorktreePreviewMaxBytes), true, false},
		{"exact byte limit", strings.Repeat("x", WorktreePreviewMaxBytes), strings.Repeat("x", WorktreePreviewMaxBytes), false, false},
		{"line limit", strings.Repeat("line\n", WorktreePreviewMaxLines+20), strings.Repeat("line\n", WorktreePreviewMaxLines), true, false},
		{"exact line limit", strings.Repeat("line\n", WorktreePreviewMaxLines), strings.Repeat("line\n", WorktreePreviewMaxLines), false, false},
		{"utf8 boundary", strings.Repeat("x", WorktreePreviewMaxBytes-1) + "界" + "next", strings.Repeat("x", WorktreePreviewMaxBytes-1), true, false},
		{"binary", "first\x00binary", "", false, true},
		{"invalid utf8", "first\xffinvalid", "", false, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			file := filepath.Join(repo.path, "preview")
			if err := os.WriteFile(file, []byte(tc.body), 0600); err != nil {
				t.Fatal(err)
			}
			preview, err := repo.WorkingFilePreview("preview")
			if err != nil || preview.Content != tc.want || preview.Truncated != tc.truncated || preview.Binary != tc.binary {
				t.Fatalf("preview = %+v, %v", preview, err)
			}
			if !utf8.ValidString(preview.Content) || len(preview.Content) > WorktreePreviewMaxBytes {
				t.Fatal("invalid or unbounded bridge text")
			}
			encoded, err := json.Marshal(preview)
			if err != nil || len(encoded) > WorktreePreviewMaxBytes*6+100 {
				t.Fatalf("bridge payload unbounded: %d, %v", len(encoded), err)
			}
		})
	}
	// A sparse untracked file proves preview size does not follow file size.
	f, err := os.Create(filepath.Join(repo.path, "large"))
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Truncate(128 * 1024 * 1024); err != nil {
		t.Fatal(err)
	}
	f.Close()
	preview, err := repo.WorkingFilePreview("large")
	if err != nil || !preview.Truncated || !preview.Binary || preview.Content != "" {
		t.Fatalf("large binary = %+v, %v", preview, err)
	}
}

func TestWorktreeContentRejectsUnsafePaths(t *testing.T) {
	repo, _ := diffTestRepo(t)
	outside := filepath.Join(t.TempDir(), "outside")
	if err := os.WriteFile(outside, []byte("private"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(repo.path, "escape")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(repo.path, ".git", "config"), filepath.Join(repo.path, "metadata")); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"../outside", outside, "escape", "metadata", ".git/config", ".", "bad\x00path"} {
		if _, err := repo.WorkingFilePreview(path); err == nil {
			t.Fatalf("accepted unsafe preview %q", path)
		}
		if _, err := repo.WorkingFileContent(path); err == nil {
			t.Fatalf("accepted unsafe content %q", path)
		}
	}
	if _, err := repo.IndexFileContent(".git/config"); err == nil {
		t.Fatal("accepted metadata index path")
	}
}

func TestIndexFileContentUsesLiteralStageZeroPath(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("colon filename is Unix-specific")
	}
	repo, run := diffTestRepo(t)
	file := "2:file"
	if err := os.WriteFile(filepath.Join(repo.path, file), []byte("index version"), 0600); err != nil {
		t.Fatal(err)
	}
	run("add", "--", file)
	if err := os.WriteFile(filepath.Join(repo.path, file), []byte("worktree version"), 0600); err != nil {
		t.Fatal(err)
	}
	index, err := repo.IndexFileContent(file)
	if err != nil || index != "index version" {
		t.Fatalf("literal index = %q, %v", index, err)
	}
	worktree, err := repo.WorkingFileContent(file)
	if err != nil || worktree != "worktree version" {
		t.Fatalf("literal worktree = %q, %v", worktree, err)
	}
}
