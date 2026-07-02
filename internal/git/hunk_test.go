package git

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseDiffRoundTrip(t *testing.T) {
	diff := "diff --git a/f.go b/f.go\n" +
		"--- a/f.go\n+++ b/f.go\n" +
		"@@ -1,3 +1,3 @@ func F() {\n" +
		" ctx\n-old\n+new\n"
	files, err := ParseDiff(diff)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 || len(files[0].Hunks) != 1 {
		t.Fatalf("unexpected structure: %+v", files)
	}
	h := files[0].Hunks[0]
	if len(h.Lines) != 3 {
		t.Fatalf("got %d lines, want 3", len(h.Lines))
	}
	// Arena-allocated lines must remain distinct and correctly typed.
	if h.Lines[0].Type != LineContext || h.Lines[1].Type != LineRemoved || h.Lines[2].Type != LineAdded {
		t.Errorf("line types wrong: %+v %+v %+v", h.Lines[0], h.Lines[1], h.Lines[2])
	}
	if h.Lines[2].Content != "new" || h.Lines[1].Content != "old" {
		t.Errorf("content wrong: %q %q", h.Lines[1].Content, h.Lines[2].Content)
	}
	// computeLineNumbers must have run.
	if h.Lines[0].OldLineNo != 1 || h.Lines[0].NewLineNo != 1 {
		t.Errorf("line numbers wrong: %+v", h.Lines[0])
	}
}

func TestApplyHunkEditSplicesResultSideLines(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "f.go")
	if err := os.WriteFile(path, []byte("top\nnew two\nbottom\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	repo := &Repository{path: dir}
	hunk := &DiffHunk{
		NewStart: 1,
		NewCount: 3,
		Lines: []*DiffLine{
			{Type: LineContext, Content: "top"},
			{Type: LineRemoved, Content: "old two"},
			{Type: LineAdded, Content: "new two"},
			{Type: LineContext, Content: "bottom"},
		},
	}

	if err := repo.ApplyHunkEdit("f.go", hunk, []string{"top", "edited two", "inserted", "bottom"}); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "top\nedited two\ninserted\nbottom\n" {
		t.Fatalf("content = %q", string(got))
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %v, want 0600", info.Mode().Perm())
	}
}

func TestApplyHunkEditRejectsStaleHunk(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "f.go"), []byte("top\nchanged elsewhere\nbottom\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	repo := &Repository{path: dir}
	hunk := &DiffHunk{
		NewStart: 1,
		NewCount: 3,
		Lines: []*DiffLine{
			{Type: LineContext, Content: "top"},
			{Type: LineAdded, Content: "new two"},
			{Type: LineContext, Content: "bottom"},
		},
	}

	err := repo.ApplyHunkEdit("f.go", hunk, []string{"top", "edited", "bottom"})
	if err == nil || !strings.Contains(err.Error(), "no longer matches") {
		t.Fatalf("err = %v, want stale hunk error", err)
	}
}
