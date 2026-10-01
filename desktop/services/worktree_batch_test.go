package services

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/atterpac/ichi/internal/git"
)

type batchEvents struct{ names []string }

func (e *batchEvents) Emit(name string, _ ...any) { e.names = append(e.names, name) }

func TestBatchIndexEmitsOneRefreshOnSuccessAndFailure(t *testing.T) {
	root := t.TempDir()
	if out, err := exec.Command("git", "-C", root, "init").CombinedOutput(); err != nil {
		t.Fatalf("init: %s %v", out, err)
	}
	for _, name := range []string{"a", "b"} {
		if err := os.WriteFile(filepath.Join(root, name), []byte("body\n"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	repo, err := git.OpenRepository(root)
	if err != nil {
		t.Fatal(err)
	}
	events := &batchEvents{}
	service := &WorktreeService{state: &State{repo: repo, emitter: events}}
	for _, test := range []struct {
		name    string
		call    func() error
		fail    bool
		signals int
	}{
		{"stage", func() error { return service.StageFiles(context.Background(), []string{"a", "b"}) }, false, 2},
		{"unstage", func() error { return service.UnstageFiles(context.Background(), []string{"a", "b"}) }, false, 2},
		{"failed stage", func() error { return service.StageFiles(context.Background(), []string{"a", "missing"}) }, true, 2},
		{"empty", func() error { return service.StageFiles(context.Background(), nil) }, false, 0},
	} {
		t.Run(test.name, func(t *testing.T) {
			events.names = nil
			err := test.call()
			if (err != nil) != test.fail {
				t.Fatalf("error: %v", err)
			}
			if len(events.names) != test.signals {
				t.Fatalf("signals: %v", events.names)
			}
			if test.signals > 0 && (events.names[0] != EventStatusChanged || events.names[1] != EventRepoChanged) {
				t.Fatalf("wrong signals: %v", events.names)
			}
		})
	}
}
