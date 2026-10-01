package services

import (
	"context"
	"errors"
	"github.com/atterpac/ichi/internal/git"
	"sync"
	"sync/atomic"
	"testing"
	"testing/synctest"
)

func TestSnapshotCancellationKeepsOtherSubscribersAlive(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		var reads repoInfoReads
		ctx, cancel := context.WithCancel(context.Background())
		release := make(chan struct{})
		load := func(ctx context.Context) (*RepoInfo, error) {
			select {
			case <-release:
				return &RepoInfo{Branch: "main"}, nil
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		first := make(chan error, 1)
		second := make(chan error, 1)
		go func() { _, err := reads.readContext(ctx, load); first <- err }()
		synctest.Wait()
		go func() { _, err := reads.readContext(context.Background(), load); second <- err }()
		synctest.Wait()
		cancel()
		if err := <-first; !errors.Is(err, context.Canceled) {
			t.Fatalf("first caller: %v", err)
		}
		close(release)
		if err := <-second; err != nil {
			t.Fatalf("cancelled another subscriber: %v", err)
		}
	})
}

func TestSnapshotCancelsGitWhenFinalSubscriberLeaves(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		var reads repoInfoReads
		ctx, cancel := context.WithCancel(context.Background())
		stopped := make(chan struct{})
		caller := make(chan struct{})
		go func() {
			reads.readContext(ctx, func(ctx context.Context) (*RepoInfo, error) { <-ctx.Done(); close(stopped); return nil, ctx.Err() })
			close(caller)
		}()
		synctest.Wait()
		cancel()
		<-caller
		<-stopped
	})
}

func TestRepoInfoSharesOnlyOverlappingReads(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		var reads repoInfoReads
		var calls atomic.Int32
		release := make(chan struct{})
		want := &RepoInfo{Branch: "main"}
		load := func() (*RepoInfo, error) {
			calls.Add(1)
			<-release
			return want, nil
		}
		var wg sync.WaitGroup
		for range 20 {
			wg.Go(func() {
				got, err := reads.read(load)
				if got != want || err != nil {
					t.Errorf("read = %v, %v", got, err)
				}
			})
		}
		synctest.Wait()
		if calls.Load() != 1 {
			t.Fatalf("overlapping reads launched %d loads", calls.Load())
		}
		close(release)
		wg.Wait()
		reads.read(load)
		if calls.Load() != 2 {
			t.Fatal("completed snapshot was cached across refreshes")
		}
	})
}

func TestRepoInfoInvalidationSeparatesGenerations(t *testing.T) {
	for _, event := range []string{EventStatusChanged, EventRepoChanged} {
		t.Run(event, func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				state := &State{} // Invalidation must work without an event emitter.
				oldRelease, newRelease := make(chan struct{}), make(chan struct{})
				oldDone := make(chan struct{})
				go func() {
					state.infoReads.read(func() (*RepoInfo, error) {
						<-oldRelease
						return &RepoInfo{Branch: "old"}, nil
					})
					close(oldDone)
				}()
				synctest.Wait()
				state.Emit(event, nil)
				var newCalls atomic.Int32
				loadNew := func() (*RepoInfo, error) {
					newCalls.Add(1)
					<-newRelease
					return &RepoInfo{Branch: "new"}, nil
				}
				var wg sync.WaitGroup
				check := func() {
					info, err := state.infoReads.read(loadNew)
					if err != nil || info.Branch != "new" {
						t.Errorf("new generation = %v, %v", info, err)
					}
				}
				wg.Go(check)
				synctest.Wait()
				close(oldRelease)
				<-oldDone
				// Finishing the old read must not clear the new pending read.
				wg.Go(check)
				synctest.Wait()
				if newCalls.Load() != 1 {
					t.Fatalf("new generation launched %d reads", newCalls.Load())
				}
				close(newRelease)
				wg.Wait()
			})
		})
	}
}

func TestRepoInfoRetriesFailedRead(t *testing.T) {
	var reads repoInfoReads
	failure := errors.New("git failed")
	if _, err := reads.read(func() (*RepoInfo, error) { return nil, failure }); err != failure {
		t.Fatalf("error = %v", err)
	}
	if info, err := reads.read(func() (*RepoInfo, error) { return &RepoInfo{Branch: "main"}, nil }); err != nil || info.Branch != "main" {
		t.Fatalf("retry = %v, %v", info, err)
	}
}

func TestRepoInfoAndSummarySharePendingSnapshot(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		state := &State{}
		release := make(chan struct{})
		want := &RepoInfo{Branch: "main", worktree: &git.WorktreeSummary{Entries: []git.StatusEntry{{Path: "same file"}}}}
		var wg sync.WaitGroup
		wg.Go(func() { state.infoReads.read(func() (*RepoInfo, error) { <-release; return want, nil }) })
		synctest.Wait()
		wg.Go(func() {
			got, err := (&RepoService{state: state}).Info(context.Background())
			if err != nil || got != want {
				t.Errorf("Info did not share snapshot: %v %v", got, err)
			}
		})
		wg.Go(func() {
			got, err := (&WorktreeService{state: state}).Summary(context.Background())
			if err != nil || got.Info != want || got.Summary != want.worktree {
				t.Errorf("Summary did not share snapshot: %v %v", got, err)
			}
		})
		synctest.Wait()
		close(release)
		wg.Wait()
	})
}
