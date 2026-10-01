package services

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func preferenceTestContent(user string) string {
	return `{"version":1,"user":` + user + `,"workspaces":{},"repositories":{},"profiles":{},"selectedProfile":null,"extensions":{}}`
}

func TestPreferencesSaveLoadAndConflicts(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config", "preferences.json")
	service := &PreferencesService{path: path}
	initial, err := service.Load()
	if err != nil {
		t.Fatal(err)
	}
	if initial.Revision != "missing" {
		t.Fatal(initial)
	}
	if _, err = os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("Load must not create a file")
	}
	content := preferenceTestContent(`{"graph.limit":250}`)
	saved, err := service.Save(initial.Revision, content)
	if err != nil {
		t.Fatal(err)
	}
	if saved.Code != "saved" || saved.Snapshot == nil || saved.Snapshot.Content != content {
		t.Fatalf("save outcome = %+v", saved)
	}
	loaded, err := service.Load()
	if err != nil || loaded.Content != content || loaded.Revision != saved.Snapshot.Revision {
		t.Fatalf("loaded %+v, err %v", loaded, err)
	}
	if conflict, err := service.Save(initial.Revision, preferenceTestContent(`{}`)); err != nil || conflict.Code != "conflict" || conflict.Snapshot.Revision != saved.Snapshot.Revision || conflict.Snapshot.Content != content || conflict.Message == "" {
		t.Fatalf("expected explicit conflict with current snapshot: %+v, %v", conflict, err)
	}
	if err = os.WriteFile(path, []byte(preferenceTestContent(`{}`)), 0600); err != nil {
		t.Fatal(err)
	}
	if conflict, err := service.Save(saved.Snapshot.Revision, content); err != nil || conflict.Code != "conflict" {
		t.Fatalf("external edits must invalidate the revision: %+v, %v", conflict, err)
	}
	files, err := filepath.Glob(filepath.Join(filepath.Dir(path), ".preferences-*"))
	if err != nil || len(files) != 0 {
		t.Fatalf("temporary files leaked: %v", files)
	}
}

func TestPreferencesInvalidWritesLeaveFileUntouched(t *testing.T) {
	path := filepath.Join(t.TempDir(), "preferences.json")
	service := &PreferencesService{path: path}
	initial, _ := service.Load()
	saved, err := service.Save(initial.Revision, preferenceTestContent(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	for _, input := range []string{`{`, `{"version":2}`, preferenceTestContent(`[]`), strings.Repeat("x", preferenceMaxBytes+1)} {
		if _, err = service.Save(saved.Snapshot.Revision, input); err == nil {
			t.Fatal("accepted invalid input")
		}
		loaded, err := service.Load()
		if err != nil || loaded.Revision != saved.Snapshot.Revision {
			t.Fatal("invalid write changed preferences")
		}
	}
	if err = os.WriteFile(path, []byte("malformed"), 0600); err != nil {
		t.Fatal(err)
	}
	loaded, err := service.Load()
	if err != nil || loaded.Content != "malformed" {
		t.Fatal("malformed input should remain available for diagnostics")
	}
}

func TestPreferencesConcurrentWindowsCannotOverwrite(t *testing.T) {
	path := filepath.Join(t.TempDir(), "preferences.json")
	initial, err := (&PreferencesService{path: path}).Load()
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	type saveResult struct {
		outcome *PreferenceSaveOutcome
		err     error
	}
	results := make(chan saveResult, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			outcome, err := (&PreferencesService{path: path}).Save(initial.Revision, preferenceTestContent(`{}`))
			results <- saveResult{outcome, err}
		}()
	}
	wg.Wait()
	close(results)
	success, conflicts := 0, 0
	for result := range results {
		if result.err != nil {
			t.Fatal(result.err)
		}
		switch result.outcome.Code {
		case "saved":
			success++
		case "conflict":
			conflicts++
		default:
			t.Fatalf("unknown outcome: %+v", result.outcome)
		}
	}
	if success != 1 || conflicts != 1 {
		t.Fatalf("success %d, conflicts %d", success, conflicts)
	}
}

func TestPreferencesLockReleasedAfterClose(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".preferences.lock")
	unlock, err := lockPreferenceFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if second, err := lockPreferenceFile(path); err == nil {
		second()
		unlock()
		t.Fatal("accepted concurrent lock")
	}
	unlock()
	final, err := lockPreferenceFile(path)
	if err != nil {
		t.Fatal(err)
	}
	final()
}

func TestPreferencesWriteFailureCanBeRetried(t *testing.T) {
	root := t.TempDir()
	blocked := filepath.Join(root, "blocked")
	if err := os.WriteFile(blocked, []byte("keep me"), 0600); err != nil {
		t.Fatal(err)
	}
	service := &PreferencesService{path: filepath.Join(blocked, "preferences.json")}
	if _, err := service.Save("missing", preferenceTestContent(`{}`)); err == nil {
		t.Fatal("expected invalid parent failure")
	}
	original, err := os.ReadFile(blocked)
	if err != nil || string(original) != "keep me" {
		t.Fatal("write failure damaged existing content")
	}
	if err := os.Remove(blocked); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Save("missing", preferenceTestContent(`{}`)); err != nil {
		t.Fatal(err)
	}
}
