package services

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/atterpac/ichi/internal/git"
)

func reviewFixture(t *testing.T) (*ReviewService, string, func(...string) string) {
	t.Helper()
	root, run := conflictTestRepo(t)
	writeProfile(t, filepath.Join(root, "feature.txt"), "before\n")
	run("add", ".")
	run("commit", "-m", "base")
	run("checkout", "-b", "feature")
	writeProfile(t, filepath.Join(root, "feature.txt"), "after\n")
	run("commit", "-am", "feature")
	run("checkout", "main")
	writeProfile(t, filepath.Join(root, "base-only.txt"), "unrelated base change\n")
	run("add", ".")
	run("commit", "-m", "base advanced")
	repo, err := git.OpenRepository(root)
	if err != nil {
		t.Fatal(err)
	}
	return &ReviewService{state: &State{repo: repo}}, root, run
}

func TestReviewSnapshotPinsMergeBaseAndPreservesWorktree(t *testing.T) {
	s, root, run := reviewFixture(t)
	writeProfile(t, filepath.Join(root, "dirty.txt"), "dirty\n")
	run("add", "dirty.txt")
	writeProfile(t, filepath.Join(root, "dirty.txt"), "more dirty\n")
	before := run("status", "--porcelain")
	snapshot, err := s.Compare(context.Background(), "main", "feature")
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Files) != 1 || snapshot.Files[0].Path != "feature.txt" || snapshot.MergeBase == snapshot.BaseCommit {
		t.Fatalf("wrong comparison: %+v", snapshot)
	}
	if before != run("status", "--porcelain") || run("branch", "--show-current") != "main" {
		t.Fatal("review changed worktree or index")
	}
	same, err := s.Compare(context.Background(), "main", "feature")
	if err != nil || same.ID != snapshot.ID || same.References[0].ID != snapshot.References[0].ID {
		t.Fatal("unstable references", err)
	}
	if stale, err := s.IsOutdated(context.Background(), snapshot.ID); err != nil || stale {
		t.Fatal("fresh snapshot marked outdated", err)
	}
	run("branch", "-f", "feature", "main")
	if stale, err := s.IsOutdated(context.Background(), snapshot.ID); err != nil || !stale {
		t.Fatal("branch movement not detected", err)
	}
	if !strings.Contains(snapshot.prompt, "+after") || strings.Contains(snapshot.prompt, "base-only") {
		t.Fatal("snapshot changed after branch movement")
	}
	if _, err := s.Compare(context.Background(), "HEAD~1", "feature"); err == nil {
		t.Fatal("accepted a revision expression instead of a branch")
	}
}

func TestReviewMetadataAndLimits(t *testing.T) {
	s, root, run := reviewFixture(t)
	run("checkout", "feature")
	run("mv", "feature.txt", "renamed.txt")
	writeProfile(t, filepath.Join(root, "binary.bin"), "a\x00b")
	run("add", ".")
	run("commit", "-m", "rename and binary")
	snapshot, err := s.Compare(context.Background(), "main", "feature")
	if err != nil {
		t.Fatal(err)
	}
	metadata := false
	for _, ref := range snapshot.References {
		if ref.HunkIndex == -1 {
			metadata = true
		}
	}
	if !metadata || !strings.Contains(snapshot.prompt, "binary") {
		t.Fatal("metadata changes omitted")
	}
	writeProfile(t, filepath.Join(root, "large.txt"), strings.Repeat("x", reviewPromptLimit))
	run("add", ".")
	run("commit", "-m", "large")
	snapshot, err = s.Compare(context.Background(), "main", "feature")
	if err != nil || snapshot.AnalysisBatches < 2 {
		t.Fatal("large comparison was not batched", err)
	}
	for _, batch := range snapshot.batches {
		if len(batch.prompt) > reviewPromptLimit {
			t.Fatal("batch exceeded model context budget")
		}
	}
	writeProfile(t, filepath.Join(root, "large.txt"), strings.Repeat("x", reviewPatchLimit+1))
	run("commit", "-am", "oversized")
	if _, err := s.Compare(context.Background(), "main", "feature"); err == nil {
		t.Fatal("accepted oversized snapshot")
	}
}

func TestReviewValidation(t *testing.T) {
	snapshot := &ReviewSnapshot{ID: "snapshot", References: []ReviewReference{{ID: "hunk"}}}
	valid := `{"snapshotId":"snapshot","summary":"Changes retries.","steps":[{"title":"Bound retries","explanation":"A limit prevents repeated attempts.","diffRefs":["hunk"]}]}`
	if _, err := validateReview([]byte(valid), snapshot); err != nil {
		t.Fatal(err)
	}
	for _, invalid := range []string{
		strings.Replace(valid, `"hunk"`, `"invented"`, 1),
		strings.Replace(valid, `"snapshot"`, `"wrong"`, 1),
		strings.Replace(valid, `["hunk"]`, `["hunk","hunk"]`, 1),
		strings.Replace(valid, `"Bound retries"`, `""`, 1),
		valid + `{}`, valid + `oops`, `null`,
		strings.Replace(valid, `"summary":`, `"unknown":0,"summary":`, 1),
	} {
		if _, err := validateReview([]byte(invalid), snapshot); err == nil {
			t.Fatalf("accepted invalid walkthrough: %s", invalid)
		}
	}
}

type fakeReviewBackend func(context.Context, string, string) ([]byte, error)

func (f fakeReviewBackend) generate(ctx context.Context, model, prompt string) ([]byte, error) {
	return f(ctx, model, prompt)
}

func TestReviewGenerateCancellationAndRepositoryIsolation(t *testing.T) {
	s, _, _ := reviewFixture(t)
	snapshot, err := s.Compare(context.Background(), "main", "feature")
	if err != nil {
		t.Fatal(err)
	}
	started := make(chan struct{})
	s.backend = func(string) (reviewBackend, error) {
		return fakeReviewBackend(func(ctx context.Context, _, prompt string) ([]byte, error) {
			if !strings.Contains(prompt, snapshot.References[0].ID) {
				t.Error("missing reference context")
			}
			close(started)
			<-ctx.Done()
			return nil, ctx.Err()
		}), nil
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { _, err := s.Generate(ctx, snapshot.ID, ReviewOptions{}); done <- err }()
	<-started
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatal("generation did not cancel", err)
	}
	other, _, _ := reviewFixture(t)
	s.state.SetRepo(other.state.repo)
	if _, err := s.Generate(context.Background(), snapshot.ID, ReviewOptions{}); err == nil {
		t.Fatal("used snapshot from a different repository")
	}
}

func TestReviewBufferBoundsIOCopy(t *testing.T) {
	b := &reviewBuffer{limit: 4}
	if _, err := io.Copy(b, io.LimitReader(strings.NewReader("123456789"), 9)); err != nil {
		t.Fatal(err)
	}
	if b.String() != "1234" || !b.exceeded {
		t.Fatal("buffer did not cap output")
	}
}

func TestReviewShutdownCancelsActiveRuns(t *testing.T) {
	s := &ReviewService{}
	ctx, done, err := s.runContext(context.Background(), time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	defer done()
	if err := s.ServiceShutdown(); err != nil {
		t.Fatal(err)
	}
	if ctx.Err() != context.Canceled {
		t.Fatal("shutdown did not cancel active work")
	}
	if _, _, err := s.runContext(context.Background(), time.Minute); err == nil {
		t.Fatal("accepted work after shutdown")
	}
}

func TestOllamaReviewStructuredRequest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Model    string
			Stream   bool
			Format   json.RawMessage
			Messages []struct{ Content string }
			Options  map[string]float64
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
		}
		if request.Model != "local-model" || request.Stream || !json.Valid(request.Format) || len(request.Messages) != 1 || request.Messages[0].Content != "synthetic fixture" || request.Options["num_ctx"] != 65536 {
			t.Error("wrong model request")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"done":true,"done_reason":"stop","message":{"content":"{\"summary\":\"ok\"}"}}`))
	}))
	defer server.Close()
	backend := ollamaReviewBackend{url: server.URL}
	data, err := backend.generate(context.Background(), "local-model", "synthetic fixture")
	if err != nil || string(data) != `{"summary":"ok"}` {
		t.Fatalf("%s: %v", data, err)
	}
	if _, err := backend.generate(context.Background(), "", ""); err == nil {
		t.Fatal("accepted empty model")
	}
}

func TestCodexReviewSmoke(t *testing.T) {
	if os.Getenv("ICHI_REVIEW_CODEX_SMOKE") != "1" {
		t.Skip("opt-in synthetic integration test uses the local Codex login")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	raw, err := (codexReviewBackend{}).generate(ctx, "", reviewInstructions+"\nSnapshot: smoke\nReference: retry\nFile: retry.go\n-old unlimited retries\n+limit retries to 3\n")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := validateReview(raw, &ReviewSnapshot{ID: "smoke", References: []ReviewReference{{ID: "retry"}}}); err != nil {
		t.Fatal(err)
	}
}
