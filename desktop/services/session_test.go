package services

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func sessionTestRepo(t *testing.T, path string) string {
	t.Helper()
	if output, err := exec.Command("git", "init", path).CombinedOutput(); err != nil {
		t.Fatalf("git init: %s %v", output, err)
	}
	canonical, err := filepath.EvalSymlinks(path)
	if err != nil {
		t.Fatal(err)
	}
	return canonical
}

func TestSessionRestoresLastActiveRepository(t *testing.T) {
	home := profileTestEnv(t)
	first := sessionTestRepo(t, filepath.Join(home, "first repo"))
	second := sessionTestRepo(t, filepath.Join(home, "second repo"))
	repo, err := OpenStartupRepository(first)
	if err != nil || repo.Path() != first {
		t.Fatalf("initial startup: %v, %v", repo, err)
	}
	// Startup also remembers the initial repository without requiring a switch.
	repo, err = OpenStartupRepository(home)
	if err != nil || repo.Path() != first {
		t.Fatalf("initial repository was not remembered: %v, %v", repo, err)
	}
	service := &RepoService{state: NewState(repo, nil)}
	if _, err := service.Open(context.Background(), second); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Open(context.Background(), filepath.Join(home, "missing")); err == nil {
		t.Fatal("invalid repository opened")
	}
	// A new process uses the saved path, even when launched in another repo.
	repo, err = OpenStartupRepository(first)
	if err != nil || repo.Path() != second {
		t.Fatalf("last successful switch was not restored: %v, %v", repo, err)
	}
}

func TestSessionFallback(t *testing.T) {
	for _, data := range []string{
		`{"lastRepository":"/nonexistent/ichi-session-test"}`,
		`invalid json`,
		`{}`,
	} {
		t.Run(data, func(t *testing.T) {
			home := profileTestEnv(t)
			root := sessionTestRepo(t, filepath.Join(home, "fallback"))
			path, err := sessionPath()
			if err != nil {
				t.Fatal(err)
			}
			if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, []byte(data), 0600); err != nil {
				t.Fatal(err)
			}
			repo, err := OpenStartupRepository(root)
			if err != nil || repo.Path() != root {
				t.Fatalf("fallback failed: %v, %v", repo, err)
			}
		})
	}
}
