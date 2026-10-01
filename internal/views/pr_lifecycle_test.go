package views

import (
	"context"
	"errors"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/atterpac/dado/components"
	"github.com/atterpac/dado/core"
	"github.com/atterpac/dado/theme"
	"github.com/atterpac/ichi/internal/remote"
)

type lifecycleProvider struct {
	remote.Provider
	ctx        context.Context
	auth       func(context.Context) error
	list       func(context.Context, remote.ListPRsOpts) ([]remote.PullRequest, error)
	files      func(context.Context) ([]remote.ChangedFile, error)
	reviewsErr error
}

func (p *lifecycleProvider) WithContext(ctx context.Context) remote.Provider {
	clone := *p
	clone.ctx = ctx
	return &clone
}
func (p *lifecycleProvider) Authenticate() error {
	if p.auth != nil {
		return p.auth(p.ctx)
	}
	return nil
}
func (p *lifecycleProvider) ListPRs(_ string, opts remote.ListPRsOpts) ([]remote.PullRequest, error) {
	return p.list(p.ctx, opts)
}
func (p *lifecycleProvider) GetPRFiles(string, int) ([]remote.ChangedFile, error) {
	return p.files(p.ctx)
}
func (p *lifecycleProvider) ListReviews(string, int) ([]remote.Review, error) {
	return nil, p.reviewsErr
}
func (p *lifecycleProvider) ListComments(string, int) ([]remote.Comment, error) { return nil, nil }
func (p *lifecycleProvider) GetChecks(string, int) ([]remote.Check, error)      { return nil, nil }

func TestPRReadStopCancelsProviderAndDropsStaleUI(t *testing.T) {
	repo, _ := viewTestRepo(t)
	queue := make(chan func(), 32)
	theme.SetQueue(func(fn func()) { queue <- fn })
	t.Cleanup(func() { theme.SetQueue(nil) })
	started, canceled := make(chan struct{}), make(chan struct{})
	provider := &lifecycleProvider{list: func(ctx context.Context, _ remote.ListPRsOpts) ([]remote.PullRequest, error) {
		close(started)
		<-ctx.Done()
		close(canceled)
		return nil, ctx.Err()
	}}
	v := NewPRListView(nil, repo)
	v.provider, v.repoPath = provider, "owner/repo"
	v.detailText.SetText("Before")
	v.loadPRs()
	loader := v.load
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("provider never started")
	}
	v.Stop()
	select {
	case <-canceled:
	case <-time.After(3 * time.Second):
		t.Fatal("provider ignored cancellation")
	}
	for loader.IsRunning() {
		select {
		case fn := <-queue:
			fn()
		case <-time.After(3 * time.Second):
			t.Fatal("loader never completed")
		}
	}
	if v.detailText.GetText() != "Before" || provider.ctx != nil {
		t.Fatal("stopped read changed UI or poisoned base provider")
	}
}

func TestFilterChangeDuringDiscoveryRestartsWithCurrentFilter(t *testing.T) {
	repo, run := viewTestRepo(t)
	run("remote", "add", "origin", "https://github.com/owner/repo.git")
	queue := make(chan func(), 32)
	theme.SetQueue(func(fn func()) { queue <- fn })
	t.Cleanup(func() { theme.SetQueue(nil) })
	original, err := remote.Get("github")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { remote.Register("github", func() remote.Provider { return original }) })
	started := make(chan struct{})
	var calls atomic.Int32
	provider := &lifecycleProvider{auth: func(ctx context.Context) error {
		if calls.Add(1) == 1 {
			close(started)
			<-ctx.Done()
			return ctx.Err()
		}
		return nil
	}, list: func(ctx context.Context, opts remote.ListPRsOpts) ([]remote.PullRequest, error) {
		if opts.State != remote.PRClosed {
			t.Errorf("stale filter %q", opts.State)
		}
		return []remote.PullRequest{{Number: 2, State: opts.State, Title: "Latest"}}, ctx.Err()
	}}
	remote.Register("github", func() remote.Provider { return provider })
	v := NewPRListView(nil, repo)
	v.Start()
	old := v.load
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("discovery never started")
	}
	v.cycleStateFilter()
	fresh := v.load
	for old.IsRunning() || fresh.IsRunning() {
		select {
		case fn := <-queue:
			fn()
		case <-time.After(3 * time.Second):
			t.Fatal("filter refresh never completed")
		}
	}
	if len(v.prs) != 1 || v.prs[0].State != remote.PRClosed || v.stateFilter != remote.PRClosed {
		t.Fatalf("filter/view mismatch: %+v %s", v.prs, v.stateFilter)
	}
}

func TestPRDetailsKeepSuccessfulSectionsAndExposePartialFailure(t *testing.T) {
	queue := make(chan func(), 32)
	theme.SetQueue(func(fn func()) { queue <- fn })
	t.Cleanup(func() { theme.SetQueue(nil) })
	provider := &lifecycleProvider{files: func(ctx context.Context) ([]remote.ChangedFile, error) {
		return []remote.ChangedFile{{Path: "updated", Patch: "+new"}}, ctx.Err()
	}, reviewsErr: errors.New("reviews unavailable")}
	v := &PRDetailView{provider: provider, repoPath: "owner/repo", pr: &remote.PullRequest{Number: 1}, fileTree: components.NewTree(), contentView: core.NewTextView()}
	v.loadData()
	loader := v.load
	for loader.IsRunning() {
		select {
		case fn := <-queue:
			fn()
		case <-time.After(3 * time.Second):
			t.Fatal("detail refresh never completed")
		}
	}
	if len(v.files) != 1 || v.files[0].Path != "updated" || !strings.Contains(v.contentView.GetText(), "reviews unavailable") {
		t.Fatalf("partial result hidden: files=%v text=%s", v.files, v.contentView.GetText())
	}
}
