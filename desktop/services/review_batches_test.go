package services

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/atterpac/ichi/internal/git"
)

func TestReviewBatchesPreserveOversizedHunks(t *testing.T) {
	content := strings.Repeat("世", reviewPromptLimit)
	snapshot := &ReviewSnapshot{ID: "snapshot", Files: []*git.FileDiff{{Path: "large.txt", Hunks: []*git.DiffHunk{{Header: "@@ -0,0 +1 @@", Lines: []*git.DiffLine{{Type: git.LineAdded, Content: content}}}}}}, References: []ReviewReference{{ID: "large", FileIndex: 0, HunkIndex: 0}}, FileDetails: []string{"new file mode 100644"}}
	batches, err := prepareReviewBatches(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if len(batches) < 3 {
		t.Fatal("large hunk was not split")
	}
	count := 0
	for _, batch := range batches {
		if len(batch.prompt) > reviewPromptLimit || !utf8.ValidString(batch.prompt) {
			t.Fatal("invalid context boundary")
		}
		if len(batch.refs) != 1 || batch.refs[0].ID != "large" {
			t.Fatal("reference changed while splitting")
		}
		count += strings.Count(batch.prompt, "世")
	}
	if count != reviewPromptLimit {
		t.Fatal("hunk content was lost while splitting")
	}
}

func TestReviewBatchesAnalyzeThenCombineAndValidate(t *testing.T) {
	snapshot := &ReviewSnapshot{ID: "snapshot", References: []ReviewReference{{ID: "a"}, {ID: "b"}}, batches: []reviewBatch{
		{prompt: "Snapshot: snapshot\nReference: a\n+first", refs: []ReviewReference{{ID: "a"}}},
		{prompt: "Snapshot: snapshot\nReference: b\n+second", refs: []ReviewReference{{ID: "b"}}},
	}}
	s := &ReviewService{state: &State{}}
	calls := 0
	backend := fakeReviewBackend(func(_ context.Context, _, prompt string) ([]byte, error) {
		calls++
		refs := []string{"a"}
		if calls == 2 {
			refs = []string{"b"}
		}
		if calls == 3 {
			if !strings.Contains(prompt, "Preliminary review notes") || !strings.Contains(prompt, `"a"`) || !strings.Contains(prompt, `"b"`) {
				t.Fatal("combiner missed earlier evidence")
			}
			refs = []string{"a", "b"}
		}
		return json.Marshal(map[string]any{"snapshotId": "snapshot", "summary": "A complete summary", "steps": []ReviewStep{{Title: "Related changes", Explanation: "Explains the supplied changes.", DiffRefs: refs}}})
	})
	result, err := s.generateBatches(context.Background(), backend, snapshot, ReviewOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if calls != 3 || len(result.Steps[0].DiffRefs) != 2 {
		t.Fatal("did not analyze both parts and combine them")
	}
	bad := fakeReviewBackend(func(_ context.Context, _, _ string) ([]byte, error) {
		return []byte(`{"snapshotId":"snapshot","summary":"Wrong batch","steps":[{"title":"Wrong","explanation":"Unsupported","diffRefs":["b"]}]}`), nil
	})
	if _, err := s.generateBatches(context.Background(), bad, snapshot, ReviewOptions{}); err == nil {
		t.Fatal("accepted a reference outside the active batch")
	}
}

func TestReviewRepositoryComparison(t *testing.T) {
	path := os.Getenv("ICHI_REVIEW_REPO")
	if path == "" {
		t.Skip("opt-in read-only comparison check; does not invoke a model")
	}
	repo, err := git.OpenRepository(path)
	if err != nil {
		t.Fatal(err)
	}
	head, err := repo.Command("symbolic-ref", "--short", "HEAD").Output()
	if err != nil {
		t.Fatal(err)
	}
	s := &ReviewService{state: &State{repo: repo}}
	snapshot, err := s.Compare(context.Background(), "origin/main", strings.TrimSpace(string(head)))
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.References) == 0 {
		t.Fatal("no changes on the current branch")
	}
	for _, batch := range snapshot.batches {
		if len(batch.prompt) > reviewPromptLimit {
			t.Fatal("oversized model batch")
		}
	}
	t.Logf("Loaded %d files, %d change references, %d bounded analysis parts", len(snapshot.Files), len(snapshot.References), snapshot.AnalysisBatches)
}
