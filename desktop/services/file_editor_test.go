package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
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
