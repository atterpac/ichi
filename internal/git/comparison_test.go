package git

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSelectedComparisonKeepsLiteralRenameAndExcludesOtherPatches(t *testing.T) {
	repo, run := diffTestRepo(t)
	old := "[source]\tname.txt"
	next := "[renamed]\tname.txt"
	if err := os.WriteFile(filepath.Join(repo.path, old), []byte(strings.Repeat("same line\n", 10)), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo.path, "other.txt"), []byte("unrelated old\n"), 0600); err != nil {
		t.Fatal(err)
	}
	run("add", ".")
	run("commit", "-m", "before")
	base := strings.TrimSpace(run("rev-parse", "HEAD"))
	if err := os.Rename(filepath.Join(repo.path, old), filepath.Join(repo.path, next)); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo.path, next), []byte(strings.Repeat("same line\n", 10)+"new line\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo.path, "other.txt"), []byte("unrelated new\n"), 0600); err != nil {
		t.Fatal(err)
	}
	run("add", ".")
	run("commit", "-m", "after")
	churn, err := repo.DiffFiles(base, "HEAD")
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, entry := range churn {
		if entry.Path == next {
			found = true
			if entry.OldPath != old {
				t.Fatalf("rename=%+v", entry)
			}
		}
	}
	if !found {
		t.Fatalf("missing rename in %+v", churn)
	}
	for _, source := range []string{"", old} {
		raw, err := repo.GetDiffBetweenFile(base, "HEAD", next, source)
		if err != nil {
			t.Fatal(err)
		}
		files, err := ParseDiff(raw)
		if err != nil || len(files) != 1 || files[0].Path != next || files[0].OldPath != old {
			t.Fatalf("files=%+v, %v", files, err)
		}
		if strings.Contains(raw, "unrelated") {
			t.Fatal("selected-file read included another file")
		}
	}
	if _, err := repo.GetDiffBetweenFile("--output=bad", "HEAD", next, ""); err == nil {
		t.Fatal("option accepted as revision")
	}
	if _, err := repo.GetDiffBetweenFile(base, "HEAD", "", ""); err == nil {
		t.Fatal("empty path accepted")
	}
}

func TestNULChurnPreservesOddNamesAndBinary(t *testing.T) {
	entries := parseChurn("1\t2\tline\nbreak.txt\x00-\t-\tbinary\x001\t0\t\x00old\tname\x00new\nname\x00")
	if len(entries) != 3 || entries[0].Path != "line\nbreak.txt" || entries[1].Added != 0 || entries[2].OldPath != "old\tname" || entries[2].Path != "new\nname" {
		t.Fatalf("entries=%+v", entries)
	}
}
