package commands

import (
	"github.com/atterpac/ichi/internal/config"
	"strings"
	"testing"
	"time"
)

func TestReplacementOwnsOnlyItsAliases(t *testing.T) {
	oldRegistry, oldAll := registry, allCommands
	registry = map[string]*Command{}
	allCommands = nil
	t.Cleanup(func() { registry, allCommands = oldRegistry, oldAll })
	original := &Command{Name: "builtin", Aliases: []string{"old"}}
	other := &Command{Name: "other", Aliases: []string{"owned"}}
	Register(original)
	Register(other)
	warnings := RegisterCustom([]config.CustomCommand{{Name: "builtin", Aliases: []string{"new"}, Command: "true"}})
	if len(warnings) != 0 || Get("old") != nil || Get("builtin") == original || Get("new") != Get("builtin") || Get("other") != other || len(All()) != 2 {
		t.Fatalf("registry=%v warnings=%v", registry, warnings)
	}
	replacement := Get("builtin")
	warnings = RegisterCustom([]config.CustomCommand{{Name: "builtin", Aliases: []string{"owned"}, Command: "true"}})
	if len(warnings) != 1 || Get("owned") != other || Get("builtin") != replacement {
		t.Fatal("collision partially replaced command")
	}
	warnings = RegisterCustom([]config.CustomCommand{{Name: "owned", Command: "true"}})
	if len(warnings) != 0 || Get("other") != other || Get("owned") == other || len(All()) != 3 {
		t.Fatal("primary alias replacement displaced owner")
	}
}

func TestCustomAsyncOutputFailureAndCancellation(t *testing.T) {
	for _, mode := range []string{"none", "pager", "diff", "commit", "graph", "branch"} {
		t.Run(mode, func(t *testing.T) {
			result := make(chan string, 1)
			failure := make(chan error, 1)
			runCustomAsync(mode, t.TempDir(), "printf 'result'", func(out string) { result <- out }, func(err error) { failure <- err })
			select {
			case out := <-result:
				if out != "result" {
					t.Fatal(out)
				}
			case err := <-failure:
				t.Fatal(err)
			case <-time.After(3 * time.Second):
				t.Fatal("missing async result")
			}
		})
	}
	result := make(chan string, 1)
	failure := make(chan error, 1)
	loader := runCustomAsync("cancel", t.TempDir(), "exec sleep 60", func(out string) { result <- out }, func(err error) { failure <- err })
	loader.Cancel()
	select {
	case <-result:
		t.Fatal("cancelled command returned success")
	case err := <-failure:
		if err == nil {
			t.Fatal("nil cancellation")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("cancellation left caller waiting")
	}
	runCustomAsync("fail", t.TempDir(), "echo useful-diagnostic >&2; exit 7", func(out string) { result <- out }, func(err error) { failure <- err })
	select {
	case <-result:
		t.Fatal("failed command returned success")
	case err := <-failure:
		if !strings.Contains(err.Error(), "useful-diagnostic") {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("missing failure")
	}
}
