package git

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestParseNumstatZ(t *testing.T) {
	got, err := parseNumstatZ("2\t3\tpath with\tand\nspace\x00-\t-\timage.bin\x000\t0\t\x00old name\x00new\nname\x00")
	want := []FileDelta{
		{Path: "path with\tand\nspace", Added: 2, Deleted: 3},
		{Path: "image.bin", Binary: true},
		{Path: "new\nname", OldPath: "old name"},
	}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, %v; want %+v", got, err, want)
	}
	for _, malformed := range []string{"1\t2\tfile", "bad\x00", "x\t1\tf\x00", "1\t-\tf\x00", "1\t-2\tf\x00", "0\t0\t\x00old\x00"} {
		if _, err := parseNumstatZ(malformed); err == nil {
			t.Errorf("accepted malformed numstat: %q", malformed)
		}
	}
}

func TestWorktreeSummaryAndSelectedPatch(t *testing.T) {
	repo, run := diffTestRepo(t)
	write := func(name, content string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(repo.path, name), []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	name := "partially staged.txt"
	write(name, "original\n")
	write("old name.txt", "rename body\n")
	write("image.bin", "before\x00")
	write("deleted.txt", "deleted\n")
	write("unrelated.txt", "original\n")
	run("add", ".")
	run("commit", "-m", "initial")
	write(name, "staged\nsecond\n")
	run("add", "--", name)
	write(name, "working\nsecond\nthird\n")
	run("mv", "--", "old name.txt", "new name.txt")
	write("image.bin", "after\x00")
	if err := os.Remove(filepath.Join(repo.path, "deleted.txt")); err != nil {
		t.Fatal(err)
	}
	write("untracked.txt", "untracked\n")
	write("unrelated.txt", strings.Repeat("a large unrelated patch\n", 20000))

	summary, err := repo.LoadWorktreeSummary()
	if err != nil {
		t.Fatal(err)
	}
	find := func(files []FileDelta, path string) FileDelta {
		t.Helper()
		for _, f := range files {
			if f.Path == path {
				return f
			}
		}
		t.Fatalf("missing delta %q in %+v", path, files)
		return FileDelta{}
	}
	if got := find(summary.Staged, name); got.Added != 2 || got.Deleted != 1 {
		t.Fatalf("staged delta = %+v", got)
	}
	if got := find(summary.Working, name); got.Added != 2 || got.Deleted != 1 {
		t.Fatalf("working delta = %+v", got)
	}
	if got := find(summary.Staged, "new name.txt"); got.OldPath != "old name.txt" || got.Added != 0 || got.Deleted != 0 {
		t.Fatalf("rename = %+v", got)
	}
	if got := find(summary.Working, "image.bin"); !got.Binary {
		t.Fatalf("binary = %+v", got)
	}
	if got := find(summary.Working, "deleted.txt"); got.Deleted != 1 {
		t.Fatalf("deleted = %+v", got)
	}
	for _, delta := range append(summary.Working, summary.Staged...) {
		if delta.Path == "untracked.txt" {
			t.Fatal("invented a tracked count for an untracked file")
		}
	}
	var partial, rename, untracked bool
	for _, entry := range summary.Entries {
		if entry.Path == name {
			partial = entry.IndexStatus == FileModified && entry.WorkStatus == FileModified
		}
		if entry.Path == "new name.txt" {
			rename = entry.OldPath == "old name.txt"
		}
		if entry.Path == "untracked.txt" {
			untracked = entry.IsUntracked
		}
	}
	if !partial || !rename || !untracked {
		t.Fatalf("status entries = %+v", summary.Entries)
	}
	patch, err := repo.GetWorktreeFileDiff(name, "", false)
	if err != nil {
		t.Fatal(err)
	}
	files, err := ParseDiff(patch)
	if err != nil || len(files) != 1 || files[0].Path != name || strings.Contains(patch, "unrelated") {
		t.Fatalf("selected patch = %q, %v", patch, err)
	}
	// Measure serialized payloads on the same deterministic worktree. This is
	// a data-volume regression check, not an end-user latency benchmark.
	summaryJSON, err := json.Marshal(summary)
	if err != nil {
		t.Fatal(err)
	}
	selectedJSON, err := json.Marshal(files[0])
	if err != nil {
		t.Fatal(err)
	}
	workingRaw, err := repo.GetWorkingDiff()
	if err != nil {
		t.Fatal(err)
	}
	stagedRaw, err := repo.GetStagedDiff()
	if err != nil {
		t.Fatal(err)
	}
	workingFiles, err := ParseDiff(workingRaw)
	if err != nil {
		t.Fatal(err)
	}
	stagedFiles, err := ParseDiff(stagedRaw)
	if err != nil {
		t.Fatal(err)
	}
	fullJSON, err := json.Marshal(struct{ Working, Staged []*FileDiff }{workingFiles, stagedFiles})
	if err != nil {
		t.Fatal(err)
	}
	if len(summaryJSON)+len(selectedJSON) >= len(fullJSON)/10 {
		t.Fatalf("unrelated patch leaked into demand load: summary=%d selected=%d full=%d", len(summaryJSON), len(selectedJSON), len(fullJSON))
	}
	t.Logf("payload bytes: summary=%d selected=%d full-working-and-staged=%d", len(summaryJSON), len(selectedJSON), len(fullJSON))
	patch, err = repo.GetWorktreeFileDiff("new name.txt", "old name.txt", true)
	if err != nil {
		t.Fatal(err)
	}
	files, err = ParseDiff(patch)
	if err != nil || len(files) != 1 || files[0].Path != "new name.txt" || files[0].OldPath != "old name.txt" || files[0].Status != FileRenamed {
		t.Fatalf("rename patch = %q, %v", patch, err)
	}
}

func TestStatusZLiteralPaths(t *testing.T) {
	name, old := "new name\t\n\".txt", "old name\t\n\".txt"
	got := parseStatusV2("2 R. N... 100644 100644 100644 1111111 2222222 R100 " + name + "\x00" + old + "\x00? untracked\nfile\x00")
	if len(got) != 2 || got[0].Path != name || got[0].OldPath != old || got[1].Path != "untracked\nfile" {
		t.Fatalf("literal status paths = %+v", got)
	}
}

func TestUnbornAndConflictedSummary(t *testing.T) {
	repo, run := diffTestRepo(t)
	file := filepath.Join(repo.path, "file.txt")
	if err := os.WriteFile(file, []byte("initial\n"), 0600); err != nil {
		t.Fatal(err)
	}
	run("add", ".")
	summary, err := repo.LoadWorktreeSummary()
	if err != nil || len(summary.Staged) != 1 || summary.Staged[0].Added != 1 {
		t.Fatalf("unborn summary = %+v, %v", summary, err)
	}
	run("commit", "-m", "initial")
	// An unmerged index has three stages and must remain a conflict row,
	// regardless of any counts Git reports for its working diff.
	hash := strings.TrimSpace(run("rev-parse", "HEAD:file.txt"))
	if err := repo.RunWithStdin("0 0000000000000000000000000000000000000000\tfile.txt\n100644 "+hash+" 1\tfile.txt\n100644 "+hash+" 2\tfile.txt\n100644 "+hash+" 3\tfile.txt\n", "update-index", "--index-info"); err != nil {
		t.Fatal(err)
	}
	summary, err = repo.LoadWorktreeSummary()
	if err != nil || len(summary.Entries) != 1 || !summary.Entries[0].IsConflict {
		t.Fatalf("conflicted summary = %+v, %v", summary, err)
	}
}
