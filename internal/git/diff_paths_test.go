package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
)

func diffTestRepo(t *testing.T) (*Repository, func(...string) string) {
	t.Helper()
	root := t.TempDir()
	run := func(args ...string) string {
		t.Helper()
		out, err := exec.Command("git", append([]string{"-C", root}, args...)...).CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %s: %v", args, out, err)
		}
		return string(out)
	}
	run("init")
	run("config", "user.name", "Test")
	run("config", "user.email", "test@example.com")
	run("config", "commit.gpgsign", "false")
	return &Repository{path: root}, run
}

func TestDiffPathsAndHunkStaging(t *testing.T) {
	for _, name := range []string{
		"file with spaces.txt", "nested b/path b/name.txt", "tab\tfile.txt",
		"line\nbreak.txt", "quote\"file.txt", "back\\slash.txt", "café.txt",
		"trailing ", "--flag.txt", "[literal].txt",
	} {
		t.Run(strconv.Quote(name), func(t *testing.T) {
			if runtime.GOOS == "windows" && (strings.ContainsAny(name, "\t\n\"\\") || strings.HasSuffix(name, " ")) {
				t.Skip("filename is not supported on Windows")
			}
			repo, run := diffTestRepo(t)
			path := filepath.Join(repo.path, name)
			if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, []byte("-- old content\n"), 0600); err != nil {
				t.Fatal(err)
			}
			run("add", ".")
			run("commit", "-m", "initial")
			if err := os.WriteFile(path, []byte("++ new content\n"), 0600); err != nil {
				t.Fatal(err)
			}
			// Application parsing must not depend on terminal display settings.
			run("config", "diff.noprefix", "true")
			run("config", "color.ui", "always")
			for _, quote := range []string{"true", "false"} {
				run("config", "core.quotePath", quote)
				raw, err := repo.GetWorkingFileDiff(name)
				if err != nil {
					t.Fatal(err)
				}
				files, err := ParseDiff(raw)
				if err != nil || len(files) != 1 {
					t.Fatalf("files = %+v, %v; raw = %q", files, err, raw)
				}
				file := files[0]
				if file.Path != name || file.OldPath != name {
					t.Fatalf("paths = %q, %q; want %q", file.OldPath, file.Path, name)
				}
				if len(file.Hunks) != 1 || len(file.Hunks[0].Lines) != 2 {
					t.Fatalf("lost hunk content: %+v", file.Hunks)
				}
				hunk := file.Hunks[0]
				if hunk.Lines[0].Content != "-- old content" || hunk.Lines[1].Content != "++ new content" {
					t.Fatal("file-header-like content was lost")
				}
				if err := repo.StageHunk(file.Path, hunk); err != nil {
					t.Fatalf("stage hunk: %v", err)
				}
				staged, err := repo.GetStagedFileDiff(name)
				if err != nil || staged == "" {
					t.Fatalf("missing staged patch: %v", err)
				}
				files, err = ParseDiff(staged)
				if err != nil || len(files) != 1 || files[0].Path != name {
					t.Fatalf("staged path: %+v, %v", files, err)
				}
				if err := repo.UnstageHunk(file.Path, hunk); err != nil {
					t.Fatalf("unstage hunk: %v", err)
				}
				if staged, err := repo.GetStagedFileDiff(name); err != nil || staged != "" {
					t.Fatalf("index was not restored: %q, %v", staged, err)
				}
			}
		})
	}
}

func TestDiffBinaryAndRenamePaths(t *testing.T) {
	repo, run := diffTestRepo(t)
	name := "nested b/with b/spaces.bin"
	path := filepath.Join(repo.path, name)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("before\x00"), 0600); err != nil {
		t.Fatal(err)
	}
	run("add", ".")
	run("commit", "-m", "initial")
	if err := os.WriteFile(path, []byte("after\x00"), 0600); err != nil {
		t.Fatal(err)
	}
	raw, err := repo.GetWorkingDiff()
	if err != nil {
		t.Fatal(err)
	}
	files, err := ParseDiff(raw)
	if err != nil || len(files) != 1 || !files[0].Binary || files[0].Path != name || files[0].OldPath != name {
		t.Fatalf("binary paths: %+v, %v", files, err)
	}
	run("checkout", "--", ".")
	renamed := "copy to renamed café.bin"
	run("mv", "--", name, renamed)
	raw, err = repo.GetStagedDiff()
	if err != nil {
		t.Fatal(err)
	}
	files, err = ParseDiff(raw)
	if err != nil || len(files) != 1 || files[0].Status != FileRenamed || files[0].Path != renamed || files[0].OldPath != name {
		t.Fatalf("rename paths: %+v, %v; raw = %q", files, err, raw)
	}
}

func TestDiffExtendedPathsAndMalformedQuotes(t *testing.T) {
	for _, kind := range []string{"rename", "copy"} {
		old, next := "old\tname", "copy to new\nname"
		raw := "diff --git " + quoteDiffPath("a/"+old) + " " + quoteDiffPath("b/"+next) + "\n" +
			kind + " from " + quoteDiffPath(old) + "\n" + kind + " to " + quoteDiffPath(next) + "\n"
		files, err := ParseDiff(raw)
		if err != nil || len(files) != 1 || files[0].Path != next || files[0].OldPath != old {
			t.Fatalf("%s: %+v, %v", kind, files, err)
		}
	}
	for _, raw := range []string{
		"diff --git \"a/unterminated b/path\n",
		"diff --git a/path \"b/unterminated\n",
		"diff --git a/path b/path\nrename to \"unterminated\n",
	} {
		if _, err := ParseDiff(raw); err == nil {
			t.Fatalf("accepted malformed quoted path: %q", raw)
		}
	}
}
