package services

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/atterpac/ichi/internal/git"
)

type mutationEvent struct {
	name string
	data []any
}
type mutationEvents struct {
	events []mutationEvent
	onEmit func(string)
}

func (e *mutationEvents) Emit(name string, data ...any) {
	e.events = append(e.events, mutationEvent{name, data})
	if e.onEmit != nil {
		e.onEmit(name)
	}
}

func TestMutationAttemptRefreshAndProgressPolicy(t *testing.T) {
	path, run := conflictTestRepo(t)
	run("commit", "--allow-empty", "-m", "initial")
	repo, err := git.OpenRepository(path)
	if err != nil {
		t.Fatal(err)
	}
	failure := errors.New("operation failed after changing a file")
	for _, tc := range []struct {
		name, op        string
		available, fail bool
		want            []string
	}{
		{"success", "", true, false, []string{EventStatusChanged, EventRepoChanged}},
		{"partial failure", "", true, true, []string{EventStatusChanged, EventRepoChanged}},
		{"rejected before work", "", false, false, nil},
		{"remote success", "fetch", true, false, []string{EventProgress, EventProgress, EventStatusChanged, EventRepoChanged}},
		{"remote failure", "pull", true, true, []string{EventProgress, EventOperationErr, EventStatusChanged, EventRepoChanged}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			events := &mutationEvents{}
			state := &State{repo: repo, emitter: events}
			if !tc.available {
				state.repo = nil
			}
			preceding := &repoInfoRead{}
			state.infoReads.pending = preceding
			// A reader started by the first notification belongs to the new generation.
			// The second notification must not invalidate it again.
			fresh := &repoInfoRead{}
			events.onEmit = func(name string) {
				if name == EventStatusChanged {
					if state.infoReads.pending != nil {
						t.Error("preceding snapshot survived mutation")
					}
					state.infoReads.pending = fresh
				}
			}
			called := false
			err := state.mutate(context.Background(), tc.op, func(*git.Repository) error {
				called = true
				if err := os.WriteFile(filepath.Join(path, "changed-by-operation"), []byte(tc.name), 0600); err != nil {
					t.Fatal(err)
				}
				if tc.fail {
					return failure
				}
				return nil
			})
			if called != tc.available {
				t.Fatalf("operation called = %v", called)
			}
			if tc.fail && !errors.Is(err, failure) {
				t.Fatalf("failure lost: %v", err)
			}
			if !tc.available && err == nil {
				t.Fatal("missing repository accepted")
			}
			if tc.available && !tc.fail && err != nil {
				t.Fatal(err)
			}
			var names []string
			for _, event := range events.events {
				names = append(names, event.name)
			}
			if !reflect.DeepEqual(names, tc.want) {
				t.Fatalf("events = %v, want %v", names, tc.want)
			}
			if tc.available && state.infoReads.pending != fresh {
				t.Fatal("refresh invalidated new generation twice")
			}
			if !tc.available && state.infoReads.pending != preceding {
				t.Fatal("rejected operation invalidated snapshot")
			}
			if tc.op != "" {
				if got := events.events[0].data[0]; !reflect.DeepEqual(got, map[string]any{"op": tc.op, "phase": "start"}) {
					t.Fatalf("start = %v", got)
				}
				want := map[string]any{"op": tc.op, "phase": "done"}
				if tc.fail {
					want = map[string]any{"op": tc.op, "error": failure.Error()}
				}
				if got := events.events[1].data[0]; !reflect.DeepEqual(got, want) {
					t.Fatalf("completion = %v", got)
				}
			}
		})
	}
}

func TestFailedMutationAdaptersRefresh(t *testing.T) {
	path, run := conflictTestRepo(t)
	run("commit", "--allow-empty", "-m", "initial")
	repo, err := git.OpenRepository(path)
	if err != nil {
		t.Fatal(err)
	}
	events := &batchEvents{}
	state := NewState(repo, events)
	// The commit hook changes the worktree before rejecting the commit.
	hook := filepath.Join(path, ".git", "hooks", "pre-commit")
	if err := os.WriteFile(hook, []byte("#!/bin/sh\nprintf 'hook changed file' > hook-output\nexit 1\n"), 0700); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name string
		call func() error
	}{
		{"commit hook", func() error { return (&WorktreeService{state: state}).Commit(context.Background(), "rejected") }},
		{"diff", func() error {
			return (&DiffService{state: state}).StageHunk(context.Background(), "missing", &git.DiffHunk{})
		}},
		{"ref", func() error { return (&RefService{state: state}).Checkout(context.Background(), "missing-ref") }},
		{"stash", func() error { return (&StashService{state: state}).StashApplyIndex(context.Background(), 99) }},
		{"graph", func() error { return (&GraphService{state: state}).DropCommit(context.Background(), "missing-ref") }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			events.names = nil
			if err := tc.call(); err == nil {
				t.Fatal("operation unexpectedly succeeded")
			}
			if !reflect.DeepEqual(events.names, []string{EventStatusChanged, EventRepoChanged}) {
				t.Fatalf("refreshes = %v", events.names)
			}
		})
	}
	content, err := os.ReadFile(filepath.Join(path, "hook-output"))
	if err != nil || string(content) != "hook changed file" {
		t.Fatalf("hook did not demonstrate partial failure: %q, %v", content, err)
	}
}
