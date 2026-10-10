package github

import (
	"fmt"
	"github.com/atterpac/ichi/internal/remote"
	"strings"
	"testing"
)

func TestInboxPaginationAndUnknownActivity(t *testing.T) {
	calls := 0
	g := &GitHub{cli: func(args ...string) ([]byte, error) {
		calls++
		q := strings.Join(args, " ")
		if calls == 1 {
			if !strings.Contains(q, "comments(last:3)") {
				t.Fatal(q)
			}
			return []byte(`{"data":{"nodes":[{"id":"PR1","comments":{"totalCount":20,"nodes":[{"id":"c1","body":"latest","author":null}]},"reviewThreads":{"nodes":[{"isResolved":false},{"isResolved":true}],"pageInfo":{"hasNextPage":true,"endCursor":"next"}}},null]}}`), nil
		}
		if !strings.Contains(q, "cursor=next") {
			t.Fatal(q)
		}
		return []byte(`{"data":{"node":{"reviewThreads":{"nodes":[{"isResolved":false}],"pageInfo":{}}}}}`), nil
	}}
	got := g.inboxActivity([]string{"PR1", "missing"})
	activity := got["PR1"]
	if !activity.Known || !activity.ThreadsKnown || activity.CommentCount != 20 || activity.UnresolvedThreads != 2 || len(activity.RecentComments) != 1 || activity.RecentComments[0].Author != "Deleted user" || got["missing"].Known {
		t.Fatalf("%+v", got)
	}
	g.cli = func(...string) ([]byte, error) { return nil, fmt.Errorf("offline") }
	if g.inboxActivity([]string{"PR1"})["PR1"].Known {
		t.Fatal("failure reported as known empty")
	}
}
func TestInboxPartialThreadsAreUnknown(t *testing.T) {
	calls := 0
	g := &GitHub{cli: func(...string) ([]byte, error) {
		calls++
		if calls > 1 {
			return nil, fmt.Errorf("rate limit")
		}
		return []byte(`{"data":{"nodes":[{"id":"PR1","comments":{"totalCount":2},"reviewThreads":{"nodes":[{"isResolved":false}],"pageInfo":{"hasNextPage":true,"endCursor":"next"}}}]}}`), nil
	}}
	a := g.inboxActivity([]string{"PR1"})["PR1"]
	if !a.Known || a.ThreadsKnown {
		t.Fatalf("%+v", a)
	}
}
func TestPRInboxSearchAndSignals(t *testing.T) {
	g := &GitHub{cli: func(args ...string) ([]byte, error) {
		q := strings.Join(args, " ")
		if args[0] == "pr" {
			for _, want := range []string{"--search review-requested:alice sort:updated-desc", "--limit 500", "reviewDecision,statusCheckRollup"} {
				if !strings.Contains(q, want) {
					t.Fatal(q)
				}
			}
			return []byte(`[{"id":"PR1","number":1,"body":"Description","reviewDecision":"CHANGES_REQUESTED","statusCheckRollup":[{"__typename":"StatusContext","context":"build","state":"ERROR"}]}]`), nil
		}
		return []byte(`{"data":{"nodes":[{"id":"PR1","comments":{"totalCount":4},"reviewThreads":{}}]}}`), nil
	}}
	prs, err := g.ListPRs("owner/repo", remote.ListPRsOpts{Search: "review-requested:alice sort:updated-desc", Limit: 900})
	if err != nil || len(prs) != 1 {
		t.Fatalf("%v %v", prs, err)
	}
	p := prs[0]
	if p.Body != "Description" || p.ReviewDecision != "CHANGES_REQUESTED" || p.Checks[0].Conclusion != "failure" || !p.Triage.Known || p.Triage.CommentCount != 4 {
		t.Fatalf("%+v", p)
	}
}
