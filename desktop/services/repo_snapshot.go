package services

import (
	"context"
	"sync"
)

// repoInfoReads shares overlapping reads, but never caches a completed snapshot:
// external Git/filesystem changes must remain visible on the next refresh.
type repoInfoReads struct {
	mu      sync.Mutex
	pending *repoInfoRead
}

type repoInfoRead struct {
	done    chan struct{}
	info    *RepoInfo
	err     error
	waiters int
	cancel  context.CancelFunc
}

func (r *repoInfoReads) read(load func() (*RepoInfo, error)) (*RepoInfo, error) {
	return r.readContext(context.Background(), func(context.Context) (*RepoInfo, error) { return load() })
}

// Each caller owns a subscription. A departing caller stops waiting immediately;
// Git is cancelled when the final subscriber leaves, without aborting its peers.
func (r *repoInfoReads) readContext(ctx context.Context, load func(context.Context) (*RepoInfo, error)) (*RepoInfo, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	r.mu.Lock()
	pending := r.pending
	if pending == nil {
		runCtx, cancel := context.WithCancel(context.WithoutCancel(ctx))
		pending = &repoInfoRead{done: make(chan struct{}), cancel: cancel}
		r.pending = pending
		go func() {
			pending.info, pending.err = load(runCtx)
			r.mu.Lock()
			if r.pending == pending {
				r.pending = nil
			}
			close(pending.done)
			r.mu.Unlock()
			cancel()
		}()
	}
	pending.waiters++
	r.mu.Unlock()
	defer func() {
		r.mu.Lock()
		pending.waiters--
		if pending.waiters == 0 {
			pending.cancel()
			if r.pending == pending {
				r.pending = nil
			}
		}
		r.mu.Unlock()
	}()
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-pending.done:
		return pending.info, pending.err
	}
}

// Readers after a mutation/switch must not join the preceding snapshot. Older
// readers may finish, but cannot clear a newer in-flight read.
func (r *repoInfoReads) invalidate() {
	r.mu.Lock()
	r.pending = nil
	r.mu.Unlock()
}
