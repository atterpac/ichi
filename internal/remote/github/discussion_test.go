package github

import (
	"fmt"
	"strings"
	"testing"
)

func TestDiscussionPaginatesThreadsAndReplies(t *testing.T) {
	calls := 0
	g := &GitHub{cli: func(args ...string) ([]byte, error) {
		calls++
		q := strings.Join(args, " ")
		if !strings.Contains(q, "--hostname github.com") {
			t.Fatalf("host not explicit: %s", q)
		}
		switch {
		case strings.Contains(q, "... on PullRequestReviewThread"):
			if !strings.Contains(q, "cursor=reply-next") {
				t.Fatal(q)
			}
			return []byte(`{"data":{"node":{"comments":{"nodes":[{"id":"reply","body":"fixed","author":{"login":"bob","avatarUrl":"https://avatars.githubusercontent.com/u/2"}}],"pageInfo":{}}}}}`), nil
		case strings.Contains(q, "reviewThreads"):
			if strings.Contains(q, "cursor=thread-next") {
				return []byte(`{"data":{"repository":{"pullRequest":{"reviewThreads":{"nodes":[{"id":"t2","path":"old.go","isOutdated":true,"comments":{"nodes":[]}}],"pageInfo":{}}}}}}`), nil
			}
			return []byte(`{"data":{"repository":{"pullRequest":{"reviewThreads":{"nodes":[{"id":"t1","path":"main.go","line":12,"diffSide":"RIGHT","isResolved":true,"comments":{"nodes":[{"id":"root","body":"change this","author":null,"diffHunk":"@@"}],"pageInfo":{"hasNextPage":true,"endCursor":"reply-next"}}}],"pageInfo":{"hasNextPage":true,"endCursor":"thread-next"}}}}}}`), nil
		case strings.Contains(q, "reviews(first"):
			return []byte(`{"data":{"repository":{"pullRequest":{"reviews":{"nodes":[{"id":"r","state":"APPROVED","author":{"login":"alice","avatarUrl":"https://avatars.githubusercontent.com/u/1"}}],"pageInfo":{}}}}}}`), nil
		default:
			if strings.Contains(q, "cursor=comment-next") {
				return []byte(`{"data":{"repository":{"pullRequest":{"comments":{"nodes":[{"id":"c2","body":"second"}],"pageInfo":{}}}}}}`), nil
			}
			return []byte(`{"data":{"repository":{"pullRequest":{"comments":{"nodes":[{"id":"c1","body":"hello"}],"pageInfo":{"hasNextPage":true,"endCursor":"comment-next"}}}}}}`), nil
		}
	}}
	d, err := g.GetDiscussion("owner/repo", 42)
	if err != nil {
		t.Fatal(err)
	}
	if calls != 6 || len(d.Comments) != 2 || len(d.Reviews) != 1 || len(d.Threads) != 2 {
		t.Fatalf("calls=%d discussion=%+v", calls, d)
	}
	if d.Reviews[0].AvatarURL != "https://avatars.githubusercontent.com/u/1" || d.Comments[0].AvatarURL != "" || d.Threads[0].Comments[1].AvatarURL != "https://avatars.githubusercontent.com/u/2" {
		t.Fatalf("missing author avatars: %+v", d)
	}
	thread := d.Threads[0]
	if !thread.Resolved || thread.Line != 12 || len(thread.Comments) != 2 || thread.Comments[0].Author != "Deleted user" || thread.Comments[1].Body != "fixed" || !d.Threads[1].Outdated {
		t.Fatalf("threads=%+v", d.Threads)
	}
}
func TestDiscussionRejectsPartialErrorsAndInvalidPages(t *testing.T) {
	for _, raw := range []string{`{"errors":[{"message":"rate limited"}],"data":{}}`, `{"data":{"repository":null}}`, `{"data":{"repository":{"pullRequest":{"comments":{"nodes":[],"pageInfo":{"hasNextPage":true}}}}}}`} {
		t.Run(fmt.Sprint(len(raw)), func(t *testing.T) {
			g := &GitHub{cli: func(...string) ([]byte, error) { return []byte(raw), nil }}
			if _, err := g.GetDiscussion("owner/repo", 1); err == nil {
				t.Fatal("accepted incomplete discussion")
			}
		})
	}
}
