package github

import (
	"errors"
	"github.com/atterpac/ichi/internal/remote"
	"reflect"
	"strings"
	"testing"
)

func TestChecksPreserveFailureAbsenceAndOutcomes(t *testing.T) {
	failure := errors.New("authentication or transport failed")
	for _, test := range []struct {
		name, json string
		err        error
		want       int
	}{
		{"none", `{"statusCheckRollup":[]}`, nil, 0},
		{"auth", "", failure, 0},
		{"invalid", "not JSON", nil, 0},
		{"rollup", `{"statusCheckRollup":[{"__typename":"CheckRun","name":"test","status":"COMPLETED","conclusion":"FAILURE","detailsUrl":"https://example.test/run"},{"__typename":"CheckRun","name":"waiting","status":"IN_PROGRESS","conclusion":""},{"__typename":"StatusContext","context":"legacy","state":"SUCCESS","targetUrl":"https://example.test/status"}]}`, nil, 3},
	} {
		t.Run(test.name, func(t *testing.T) {
			g := &GitHub{cli: func(args ...string) ([]byte, error) {
				if !reflect.DeepEqual(args, []string{"pr", "view", "7", "-R", "owner/repo", "--json", "statusCheckRollup"}) {
					t.Fatalf("args=%v", args)
				}
				return []byte(test.json), test.err
			}}
			checks, err := g.GetChecks("owner/repo", 7)
			if test.err != nil {
				if !errors.Is(err, failure) {
					t.Fatal(err)
				}
				return
			}
			if test.name == "invalid" {
				if err == nil {
					t.Fatal("invalid JSON accepted")
				}
				return
			}
			if err != nil || len(checks) != test.want {
				t.Fatalf("checks=%+v err=%v", checks, err)
			}
			if len(checks) > 0 && (checks[0].Status != remote.CheckCompleted || checks[0].Conclusion != remote.CheckFailure || checks[1].Status != remote.CheckInProgress || checks[2].Name != "legacy" || checks[2].Conclusion != remote.CheckSuccess) {
				t.Fatalf("wrong outcomes: %+v", checks)
			}
		})
	}
}

func TestMergeabilityRetainsUnknown(t *testing.T) {
	for _, state := range []string{"", "UNKNOWN", "FUTURE", "MERGEABLE", "CONFLICTING"} {
		pr := (&ghPullRequest{Mergeable: state}).toRemote()
		known := state == "MERGEABLE" || state == "CONFLICTING"
		if known && (pr.Mergeable == nil || *pr.Mergeable != (state == "MERGEABLE")) {
			t.Fatalf("%s=%v", state, pr.Mergeable)
		}
		if !known && pr.Mergeable != nil {
			t.Fatalf("unknown %s became certain", state)
		}
	}
}

func TestDiscussionCreationReturnsCreatedCommentOnly(t *testing.T) {
	calls := 0
	g := &GitHub{cli: func(args ...string) ([]byte, error) {
		calls++
		want := []string{"api", "-X", "POST", "repos/owner/repo/issues/7/comments", "-f", "body=discussion"}
		if !reflect.DeepEqual(args, want) {
			t.Fatalf("args=%v", args)
		}
		return []byte(`{"id":42,"body":"discussion","user":{"login":"created-author"}}`), nil
	}}
	comment, err := g.AddComment("owner/repo", 7, &remote.CommentInput{Body: "discussion"})
	if err != nil || calls != 1 || comment.ID != 42 || comment.Author.Login != "created-author" || comment.Path != "" {
		t.Fatalf("comment=%+v err=%v calls=%d", comment, err, calls)
	}
}

func TestReviewCommentsRejectBeforePostingAndEventsMapExplicitly(t *testing.T) {
	calls := 0
	g := &GitHub{cli: func(args ...string) ([]byte, error) { calls++; return nil, nil }}
	err := g.SubmitReview("owner/repo", 7, &remote.SubmitReviewInput{State: remote.ReviewApproved, Comments: []remote.InlineCommentInput{{Path: "file", Line: 1, Body: "change"}}})
	if !errors.Is(err, ErrInlineReviewCommentsUnsupported) || calls != 0 {
		t.Fatalf("err=%v calls=%d", err, calls)
	}
	for _, pair := range []struct {
		state remote.ReviewState
		event string
	}{{remote.ReviewApproved, "APPROVE"}, {remote.ReviewChangesRequested, "REQUEST_CHANGES"}, {remote.ReviewCommented, "COMMENT"}} {
		g.cli = func(args ...string) ([]byte, error) {
			if !strings.Contains(strings.Join(args, " "), "event="+pair.event) {
				t.Fatalf("args=%v", args)
			}
			return nil, nil
		}
		if err := g.SubmitReview("owner/repo", 7, &remote.SubmitReviewInput{State: pair.state, Body: "review"}); err != nil {
			t.Fatal(err)
		}
	}
	g.cli = func(...string) ([]byte, error) { t.Fatal("invalid state posted"); return nil, nil }
	if err := g.SubmitReview("owner/repo", 7, &remote.SubmitReviewInput{State: remote.ReviewDismissed}); err == nil {
		t.Fatal("invalid state accepted")
	}
}
