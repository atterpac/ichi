package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/atterpac/ichi/desktop/services"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// Wails owns a process-wide application singleton. Exercise production
// construction once, without starting the native window/event loop.
func TestBuildAppServiceEvents(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	t.Setenv("GIT_CONFIG_GLOBAL", os.DevNull)
	t.Setenv("GIT_CONFIG_NOSYSTEM", "1")
	root := t.TempDir()
	if output, err := exec.Command("git", "init", "--initial-branch=main", root).CombinedOutput(); err != nil {
		t.Fatalf("git init: %v: %s", err, output)
	}
	t.Chdir(root)
	if err := os.WriteFile(filepath.Join(root, "file.txt"), []byte("change\n"), 0600); err != nil {
		t.Fatal(err)
	}

	app := buildApp()
	var repo *services.RepoService
	var worktree *services.WorktreeService
	var remote *services.RemoteService
	gotTypes := make(map[reflect.Type]bool)
	for _, service := range app.Config().Services {
		instance := service.Instance()
		typ := reflect.TypeOf(instance)
		if gotTypes[typ] {
			t.Fatalf("duplicate service registration: %v", typ)
		}
		gotTypes[typ] = true
		switch instance := instance.(type) {
		case *services.RepoService:
			repo = instance
		case *services.WorktreeService:
			worktree = instance
		case *services.RemoteService:
			remote = instance
		}
	}
	for _, instance := range []any{
		&services.PreferencesService{}, &services.RepoService{},
		&services.GraphService{}, &services.WorktreeService{},
		&services.DiffService{}, &services.RefService{},
		&services.RemoteService{}, &services.StashService{},
		&services.ConflictService{}, &services.InspectService{},
		&services.CompletionService{}, &services.SearchService{}, &services.PRService{}, &services.ReviewService{},
	} {
		if !gotTypes[reflect.TypeOf(instance)] {
			t.Fatalf("missing service registration: %T", instance)
		}
	}

	t.Run("mutation publishes invalidation and fresh status", func(t *testing.T) {
		before, err := repo.Info(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		notifications := listenForEvents(t, app, services.EventStatusChanged, services.EventRepoChanged)
		if err := worktree.StageFiles(context.Background(), []string{"file.txt"}); err != nil {
			t.Fatal(err)
		}
		for _, event := range receiveEvents(t, notifications, 2) {
			if event.Data != nil {
				t.Errorf("invalidation payload = %#v, want nil", event.Data)
			}
		}
		after, err := repo.Info(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		if before.Staged.Files != 0 || after.Staged.Files != 1 {
			t.Fatalf("staged count before/after = %d/%d, want 0/1", before.Staged.Files, after.Staged.Files)
		}
	})

	t.Run("failure preserves progress and diagnostics", func(t *testing.T) {
		notifications := listenForEvents(t, app, services.EventProgress, services.EventOperationErr, services.EventStatusChanged, services.EventRepoChanged)
		err := remote.Fetch(context.Background(), "missing-remote")
		if err == nil {
			t.Fatal("fetch without a configured remote succeeded")
		}
		got := receiveEvents(t, notifications, 4)
		if !reflect.DeepEqual(got[services.EventProgress].Data, map[string]any{"op": "fetch", "phase": "start"}) {
			t.Errorf("progress payload = %#v", got[services.EventProgress].Data)
		}
		if !reflect.DeepEqual(got[services.EventOperationErr].Data, map[string]any{"op": "fetch", "error": err.Error()}) {
			t.Errorf("error payload = %#v", got[services.EventOperationErr].Data)
		}
	})

	t.Run("adapter preserves Wails payload shape", func(t *testing.T) {
		emitter := wailsEventEmitter{events: app.Event}
		for _, test := range []struct {
			name string
			data []any
			want any
		}{
			{"empty", nil, nil},
			{"nil", []any{nil}, nil},
			{"single", []any{map[string]any{"id": 7}}, map[string]any{"id": 7}},
			{"multiple", []any{"first", 7}, []any{"first", 7}},
		} {
			t.Run(test.name, func(t *testing.T) {
				notifications := listenForEvents(t, app, services.EventPRChanged)
				emitter.Emit(services.EventPRChanged, test.data...)
				got := receiveEvents(t, notifications, 1)[services.EventPRChanged].Data
				if !reflect.DeepEqual(got, test.want) {
					t.Errorf("payload = %#v, want %#v", got, test.want)
				}
			})
		}
	})
}

func listenForEvents(t *testing.T, app *application.App, names ...string) <-chan *application.CustomEvent {
	t.Helper()
	notifications := make(chan *application.CustomEvent, 16)
	for _, name := range names {
		t.Cleanup(app.Event.On(name, func(event *application.CustomEvent) {
			notifications <- event
		}))
	}
	return notifications
}

func receiveEvents(t *testing.T, notifications <-chan *application.CustomEvent, count int) map[string]*application.CustomEvent {
	t.Helper()
	got := make(map[string]*application.CustomEvent)
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()
	for range count {
		select {
		case event := <-notifications:
			if got[event.Name] != nil {
				t.Fatalf("duplicate event: %s", event.Name)
			}
			got[event.Name] = event
		case <-timer.C:
			t.Fatalf("received %d of %d Wails events: %v", len(got), count, got)
		}
	}
	return got
}
