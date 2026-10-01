package services

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestEditorSave(t *testing.T) {
	path := filepath.Join(t.TempDir(), "file")
	original := "one\r\ntwo" // Preserve CRLF and missing final newline.
	if err := os.WriteFile(path, []byte(original), 0755); err != nil {
		t.Fatal(err)
	}
	if err := saveEditorFile(path, "stale", "bad"); err == nil {
		t.Fatal("accepted stale contents")
	}
	next := "three\r\ntwo"
	if err := saveEditorFile(path, original, next); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(path)
	if string(got) != next {
		t.Fatalf("got %q", got)
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0755 {
		t.Fatal("lost permissions")
	}
	if err := saveEditorFile(path, next, ""); err != nil {
		t.Fatal(err)
	}
	got, _ = os.ReadFile(path)
	if len(got) != 0 {
		t.Fatal("cannot empty file")
	}
}

func TestEditorRejectsFIFOWithoutBlocking(t *testing.T) {
	if path := os.Getenv("ICHI_TEST_EDITOR_FIFO"); path != "" {
		if _, err := readEditorFile(path); err == nil {
			t.Fatal("accepted FIFO as a regular editor file")
		}
		return
	}
	if runtime.GOOS == "windows" {
		t.Skip("POSIX FIFO fixture")
	}
	mkfifo, err := exec.LookPath("mkfifo")
	if err != nil {
		t.Skip("mkfifo unavailable")
	}
	path := filepath.Join(t.TempDir(), "fifo")
	if output, err := exec.Command(mkfifo, path).CombinedOutput(); err != nil {
		t.Fatalf("mkfifo: %s, %v", output, err)
	}
	// An isolated child gives this regression a hard bound: an accidental
	// blocking open cannot hang the parent suite or leave a blocked goroutine.
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestEditorRejectsFIFOWithoutBlocking$")
	cmd.Env = append(os.Environ(), "ICHI_TEST_EDITOR_FIFO="+path, "GORACE=atexit_sleep_ms=0")
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("regular-file rejection blocked or failed: %s, %v, context=%v", output, err, ctx.Err())
	}
}

func TestAtomicEditorWriteFailurePreservesOriginal(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "file")
	if err := os.WriteFile(path, []byte("original\r\nno final newline"), 0755); err != nil {
		t.Fatal(err)
	}
	wantErr := errors.New("disk write failed")
	err := atomicReplaceFile(path, 0755, func(f *os.File) error {
		if _, err := f.WriteString("partial replacement"); err != nil {
			t.Fatal(err)
		}
		return wantErr
	})
	if !errors.Is(err, wantErr) {
		t.Fatalf("write error = %v", err)
	}
	got, err := os.ReadFile(path)
	if err != nil || string(got) != "original\r\nno final newline" {
		t.Fatalf("original damaged: %q, %v", got, err)
	}
	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm() != 0755 {
		t.Fatalf("original mode changed: %v, %v", info, err)
	}
	files, err := filepath.Glob(filepath.Join(root, ".ichi-save-*"))
	if err != nil || len(files) != 0 {
		t.Fatalf("temporary files leaked: %v, %v", files, err)
	}
}

func TestEditorRejectsMetadataAndPreservesInWorktreeSymlinks(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".git"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".git", "config"), []byte("metadata"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(root, ".git", "config"), filepath.Join(root, "metadata-link")); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{".git/config", "./.git/config", "metadata-link", ".", "../outside", filepath.Join(root, ".git", "config")} {
		if _, err := editorPath(root, path); err == nil {
			t.Fatalf("accepted metadata/unsafe path %q", path)
		}
	}
	target := filepath.Join(root, "source")
	if err := os.WriteFile(target, []byte("original"), 0640); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "source-link")
	if err := os.Symlink("source", link); err != nil {
		t.Fatal(err)
	}
	resolved, err := editorPath(root, "source-link")
	if err != nil || resolved != target {
		t.Fatalf("source symlink = %q, %v", resolved, err)
	}
	if err := saveEditorFile(resolved, "original", "changed"); err != nil {
		t.Fatal(err)
	}
	info, err := os.Lstat(link)
	if err != nil || info.Mode()&os.ModeSymlink == 0 {
		t.Fatal("save replaced the symlink")
	}
	if err := os.Chmod(target, 0440); err != nil {
		t.Fatal(err)
	}
	if err := saveEditorFile(target, "changed", "should fail"); err == nil {
		t.Fatal("accepted read-only file")
	}
	got, err := os.ReadFile(target)
	if err != nil || string(got) != "changed" {
		t.Fatalf("read-only content changed: %q, %v", got, err)
	}
}

func TestEditorLimitsAndPaths(t *testing.T) {
	for _, input := range []string{strings.Repeat("x", editorMaxBytes+1), strings.Repeat("\n", editorMaxLines), "a\x00b", "\xff"} {
		if validateEditorContent(input) == nil {
			t.Fatal("accepted invalid content")
		}
	}
	root := t.TempDir()
	outside := filepath.Join(t.TempDir(), "outside")
	if err := os.WriteFile(outside, []byte("text"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "link")); err != nil {
		t.Fatal(err)
	}
	if _, err := editorPath(root, "link"); err == nil {
		t.Fatal("accepted outside symlink")
	}
	if _, err := readEditorFile(root); err == nil {
		t.Fatal("accepted directory")
	}
}
