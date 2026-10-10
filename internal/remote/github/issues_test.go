package github

import (
	"fmt"
	"strings"
	"testing"
)

func TestIssuesSearchAndMetadata(t *testing.T) {
	g := &GitHub{cli: func(args ...string) ([]byte, error) {
		q := strings.Join(args, " ")
		for _, want := range []string{"issue list", "--state closed", "--limit 500", "--search label:bug author:alice"} {
			if !strings.Contains(q, want) {
				t.Fatalf("missing %q: %s", want, q)
			}
		}
		return []byte(`[{"number":12,"title":"Bug","state":"CLOSED","stateReason":"COMPLETED","author":{"login":"alice"},"labels":[{"name":"bug"}],"assignees":[{"login":"bob"}],"milestone":{"title":"v1"}}]`), nil
	}}
	items, err := g.ListIssues("owner/repo", "closed", "label:bug author:alice", 900)
	if err != nil || len(items) != 1 {
		t.Fatalf("%v %v", items, err)
	}
	i := items[0]
	if i.State != "closed" || i.Author != "alice" || i.Labels[0] != "bug" || i.Assignees[0] != "bob" || i.Milestone != "v1" {
		t.Fatalf("%+v", i)
	}
	if _, err = g.ListIssues("owner/repo", "merged", "", 50); err == nil {
		t.Fatal("invalid state accepted")
	}
}
func TestIssuePaginatesConversation(t *testing.T) {
	calls := 0
	g := &GitHub{cli: func(args ...string) ([]byte, error) {
		calls++
		q := strings.Join(args, " ")
		if args[0] == "issue" {
			return []byte(`{"number":12,"title":"Bug","author":null}`), nil
		}
		if !strings.Contains(q, "--hostname github.com") {
			t.Fatal(q)
		}
		if strings.Contains(q, "cursor=next") {
			return []byte(`{"data":{"repository":{"issue":{"comments":{"nodes":[{"id":"2","body":"reply","author":{"login":"bob"}}],"pageInfo":{}}}}}}`), nil
		}
		return []byte(`{"data":{"repository":{"issue":{"comments":{"nodes":[{"id":"1","body":"hello","author":null}],"pageInfo":{"hasNextPage":true,"endCursor":"next"}}}}}}`), nil
	}}
	i, err := g.GetIssue("owner/repo", 12)
	if err != nil {
		t.Fatal(err)
	}
	if calls != 3 || len(i.Comments) != 2 || i.Comments[0].Author != "Deleted user" || i.Comments[1].Author != "bob" {
		t.Fatalf("%+v calls=%d", i, calls)
	}
}
func TestIssueRejectsPartialConversation(t *testing.T) {
	for _, response := range []string{`{"errors":[{"message":"rate limited"}]}`, `{"data":{"repository":null}}`, `{"data":{"repository":{"issue":{"comments":{"pageInfo":{"hasNextPage":true}}}}}}`, "bad json"} {
		g := &GitHub{cli: func(args ...string) ([]byte, error) {
			if args[0] == "issue" {
				return []byte(`{"number":12}`), nil
			}
			return []byte(response), nil
		}}
		if i, err := g.GetIssue("owner/repo", 12); err == nil || i != nil {
			t.Fatalf("partial result returned: %v %v", i, err)
		}
	}
	g := &GitHub{cli: func(args ...string) ([]byte, error) { return nil, fmt.Errorf("offline") }}
	if _, err := g.GetIssue("owner/repo", 12); err == nil {
		t.Fatal("command failure ignored")
	}
}
