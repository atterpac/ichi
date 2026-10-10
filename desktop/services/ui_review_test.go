package services

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/atterpac/ichi/internal/git"
)

func TestScopedReviewExcludesUnselectedContent(t *testing.T) {
	snapshot := &ReviewSnapshot{ID: "scope", Files: []*git.FileDiff{
		{Path: "included.go", Hunks: []*git.DiffHunk{{Lines: []*git.DiffLine{{Type: git.LineAdded, Content: "included change"}}}}},
		{Path: "excluded.go", Hunks: []*git.DiffHunk{{Lines: []*git.DiffLine{{Type: git.LineAdded, Content: "excluded private change"}}}}},
	}, References: []ReviewReference{{ID: "yes", FileIndex: 0, HunkIndex: 0}, {ID: "no", FileIndex: 1, HunkIndex: 0}}}
	scoped, err := scopeReview(snapshot, []string{"included.go"})
	if err != nil {
		t.Fatal(err)
	}
	if len(scoped.References) != 1 || scoped.References[0].ID != "yes" {
		t.Fatal("incorrect scoped references")
	}
	if len(snapshot.References) != 2 {
		t.Fatal("mutated captured comparison")
	}
	for _, batch := range scoped.batches {
		if strings.Contains(batch.prompt, "excluded") || !strings.Contains(batch.prompt, "included change") {
			t.Fatal("incorrect model input", batch.prompt)
		}
	}
	if _, err := scopeReview(snapshot, []string{"missing.go"}); err == nil {
		t.Fatal("accepted unknown scope")
	}
}

func TestStashPreviewIncludesUntrackedWithoutChangingRepository(t *testing.T) {
	review, root, run := reviewFixture(t)
	writeProfile(t, filepath.Join(root, "feature.txt"), "saved tracked change\n")
	writeProfile(t, filepath.Join(root, "new.txt"), "saved untracked change\n")
	run("stash", "push", "-u", "-m", "preview fixture")
	before := run("status", "--porcelain")
	service := &StashService{state: review.state}
	files, err := service.StashDiff(context.Background(), 0)
	if err != nil {
		t.Fatal(err)
	}
	found := map[string]bool{}
	for _, file := range files {
		found[file.Path] = true
	}
	if !found["feature.txt"] || !found["new.txt"] {
		t.Fatalf("missing tracked or untracked preview: %v", found)
	}
	if before != run("status", "--porcelain") || !strings.Contains(run("stash", "list"), "preview fixture") {
		t.Fatal("preview mutated repository")
	}
}
