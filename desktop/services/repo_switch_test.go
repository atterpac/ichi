package services

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestOpenRepositorySwitch(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	root := filepath.Join(home, "project with spaces")
	if err := os.MkdirAll(filepath.Join(root, "nested"), 0755); err != nil {
		t.Fatal(err)
	}
	if output, err := exec.Command("git", "init", root).CombinedOutput(); err != nil {
		t.Fatalf("git init: %s %v", output, err)
	}
	service := &RepoService{state: NewState(nil, nil)}
	info, err := service.Open("~/project with spaces/nested")
	if err != nil {
		t.Fatal(err)
	}
	if info.Path != root {
		t.Fatalf("expected root %q, got %q", root, info.Path)
	}
	original, _ := service.state.Repo()
	for _, path := range []string{"", filepath.Join(home, "missing"), home} {
		if _, err := service.Open(path); err == nil {
			t.Fatalf("opened invalid path %q", path)
		}
		current, _ := service.state.Repo()
		if current != original {
			t.Fatal("failed switch changed the active repository")
		}
	}
}
