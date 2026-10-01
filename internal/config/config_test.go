package config

import (
	"errors"
	"fmt"
	"gopkg.in/yaml.v3"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"
)

func isolatedConfig(t *testing.T) {
	t.Helper()
	mu.Lock()
	old, oldPath := current, configPath
	current = &Config{Theme: defaultTheme, Commands: []CustomCommand{{Name: "custom", Aliases: []string{"alias"}}}}
	configPath = filepath.Join(t.TempDir(), "ichi", configFile)
	mu.Unlock()
	t.Cleanup(func() { mu.Lock(); current, configPath = old, oldPath; mu.Unlock() })
}

func TestSnapshotsOwnNestedValues(t *testing.T) {
	isolatedConfig(t)
	if err := SaveRepo("", Repo{Name: "one", Path: "/one"}); err != nil {
		t.Fatal(err)
	}
	c := Get()
	c.Theme = "changed"
	c.Repos[0].Name = "changed"
	c.Commands[0].Aliases[0] = "changed"
	commands := GetCommands()
	commands[0].Name = "changed"
	commands[0].Aliases[0] = "changed"
	repos := GetRepos()
	repos[0].Name = "changed"
	if GetTheme() != defaultTheme || GetRepos()[0].Name != "one" || GetCommands()[0].Name != "custom" || GetCommands()[0].Aliases[0] != "alias" {
		t.Fatal("snapshot mutated store")
	}
}

func TestFailedSaveDoesNotPublish(t *testing.T) {
	isolatedConfig(t)
	before := Get()
	blocker := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(blocker, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	configPath = filepath.Join(blocker, "config.yaml")
	if err := SetTheme("new"); err == nil {
		t.Fatal("expected directory failure")
	}
	if !reflect.DeepEqual(Get(), before) {
		t.Fatal("failed write published memory")
	}
	if data, _ := os.ReadFile(blocker); string(data) != "keep" {
		t.Fatal("previous file changed")
	}
}

func TestAtomicReplacementFailurePreservesFile(t *testing.T) {
	isolatedConfig(t)
	if err := SetTheme("previous"); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(configPath, 0600); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(configPath)
	failure := errors.New("replacement denied")
	err := persistConfig(configPath, &Config{Theme: "next"}, func(string, string) error { return failure })
	if !errors.Is(err, failure) {
		t.Fatalf("got %v", err)
	}
	after, _ := os.ReadFile(configPath)
	if string(after) != string(before) {
		t.Fatal("failed replacement damaged original")
	}
	files, _ := filepath.Glob(filepath.Join(filepath.Dir(configPath), ".config-*"))
	if len(files) != 0 {
		t.Fatalf("temporary files retained: %v", files)
	}
	if err := SetTheme("saved"); err != nil {
		t.Fatal(err)
	}
	info, _ := os.Stat(configPath)
	if info.Mode().Perm() != 0600 {
		t.Fatalf("permissions=%v", info.Mode())
	}
}

func TestConcurrentSavesRemainInOrderAndRoundTrip(t *testing.T) {
	isolatedConfig(t)
	var wg sync.WaitGroup
	for i := range 24 {
		wg.Go(func() {
			name := fmt.Sprintf("repo-%d", i)
			if err := SaveRepo("", Repo{Name: name, Path: "/" + name}); err != nil {
				t.Error(err)
			}
			c := Get()
			if len(c.Commands) != 1 {
				t.Error("missing commands")
			}
		})
	}
	wg.Wait()
	data, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	var disk Config
	if err := yaml.Unmarshal(data, &disk); err != nil {
		t.Fatal(err)
	}
	if len(disk.Repos) != 24 || !reflect.DeepEqual(disk, *Get()) {
		t.Fatal("saved snapshot diverged from memory")
	}
	if err := SaveRepo("repo-0", Repo{Name: "renamed", Path: "/new"}); err != nil {
		t.Fatal(err)
	}
	if _, ok := FindRepo("repo-0"); ok {
		t.Fatal("old name retained")
	}
	if err := DeleteRepo("renamed"); err != nil {
		t.Fatal(err)
	}
	if len(GetRepos()) != 23 {
		t.Fatal("delete failed")
	}
}
