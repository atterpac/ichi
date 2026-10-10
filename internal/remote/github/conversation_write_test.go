package github

import (
	"encoding/json"
	"fmt"
	"github.com/atterpac/ichi/internal/remote"
	"os"
	"strings"
	"testing"
)

func payloadFromArgs(t *testing.T, args []string) (map[string]any, string) {
	t.Helper()
	for i, a := range args {
		if a == "--input" {
			path := args[i+1]
			raw, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			info, _ := os.Stat(path)
			if info.Mode().Perm() != 0600 {
				t.Fatal("payload must be private")
			}
			var value map[string]any
			if err = json.Unmarshal(raw, &value); err != nil {
				t.Fatal(err)
			}
			return value, path
		}
	}
	t.Fatal("missing structured input")
	return nil, ""
}
func TestConversationMutations(t *testing.T) {
	cases := []struct{ action, typ, want, idField string }{
		{"comment", "PullRequest", "addComment", "subjectId"},
		{"edit", "IssueComment", "updateIssueComment", "id"},
		{"delete", "IssueComment", "deleteIssueComment", "id"},
		{"edit", "PullRequestReviewComment", "updatePullRequestReviewComment", "pullRequestReviewCommentId"},
		{"delete", "PullRequestReviewComment", "deletePullRequestReviewComment", "id"},
		{"edit", "PullRequestReview", "updatePullRequestReview", "pullRequestReviewId"},
		{"delete", "PullRequestReview", "deletePullRequestReview", "pullRequestReviewId"},
		{"react", "IssueComment", "addReaction", "subjectId"},
		{"unreact", "PullRequestReview", "removeReaction", "subjectId"},
		{"reply", "PullRequestReviewThread", "addPullRequestReviewThreadReply", "pullRequestReviewThreadId"},
		{"resolve", "PullRequestReviewThread", "resolveReviewThread", "threadId"},
		{"unresolve", "PullRequestReviewThread", "unresolveReviewThread", "threadId"},
	}
	for _, tc := range cases {
		t.Run(tc.want, func(t *testing.T) {
			posts := 0
			path := ""
			body := "Line one\n`$(not-a-command)`\n\"quoted\""
			g := &GitHub{cli: func(args ...string) ([]byte, error) {
				if strings.Contains(strings.Join(args, " "), "--input") {
					posts++
					payload, file := payloadFromArgs(t, args)
					path = file
					if !strings.Contains(payload["query"].(string), tc.want+"(input:$input)") {
						t.Fatal(payload)
					}
					input := payload["variables"].(map[string]any)["input"].(map[string]any)
					if input[tc.idField] != "node1" {
						t.Fatal(input)
					}
					if tc.action == "edit" || tc.action == "comment" || tc.action == "reply" {
						if input["body"] != body {
							t.Fatal("body changed")
						}
					}
					if tc.action == "react" || tc.action == "unreact" {
						if input["content"] != "HEART" {
							t.Fatal(input)
						}
					}
					return []byte(`{"data":{"result":{"clientMutationId":null}}}`), nil
				}
				if tc.action == "comment" {
					return []byte(`{"data":{"repository":{"issueOrPullRequest":{"id":"node1","__typename":"PullRequest"}}}}`), nil
				}
				return []byte(fmt.Sprintf(`{"data":{"node":{"__typename":%q,"repository":{"nameWithOwner":"owner/repo"},"pullRequest":{"number":7}}}}`, tc.typ)), nil
			}}
			err := g.MutateConversation("owner/repo", 7, "pr", remote.ConversationAction{Action: tc.action, SubjectID: "node1", Body: body, Reaction: "HEART"})
			if err != nil || posts != 1 {
				t.Fatalf("posts %d, %v", posts, err)
			}
			if _, err = os.Stat(path); !os.IsNotExist(err) {
				t.Fatal("payload not removed")
			}
		})
	}
}
func TestConversationRejectsWrongTargetAndEmptyResults(t *testing.T) {
	for _, repo := range []string{"elsewhere/repo", "owner/repo"} {
		posted := false
		g := &GitHub{cli: func(args ...string) ([]byte, error) {
			if strings.Contains(strings.Join(args, " "), "--input") {
				posted = true
			}
			return []byte(fmt.Sprintf(`{"data":{"node":{"__typename":"IssueComment","repository":{"nameWithOwner":%q},"issue":{"number":99}}}}`, repo)), nil
		}}
		if err := g.MutateConversation("owner/repo", 7, "issue", remote.ConversationAction{Action: "delete", SubjectID: "node1"}); err == nil || posted {
			t.Fatal("cross-conversation mutation accepted")
		}
	}
	for _, response := range []string{`{"errors":[{"message":"forbidden"}]}`, `{"data":null}`, `{"data":{"updateIssueComment":null}}`} {
		g := &GitHub{cli: func(...string) ([]byte, error) { return []byte(response), nil }}
		if _, err := g.apiJSON("graphql", map[string]string{"query": "mutation"}); err == nil {
			t.Fatal("missing mutation result accepted")
		}
	}
}
func TestReviewSubmissionKeepsDiffCoordinatesAndChecksHead(t *testing.T) {
	draft := remote.ConversationReview{CommitOID: "head1", Event: "REQUEST_CHANGES", Body: "Please revise", Comments: []remote.ReviewDraftComment{{Path: "file.go", Line: 12, Side: "LEFT", Body: "Keep this"}, {Path: "file.go", Line: 20, Side: "RIGHT", Body: "Simplify"}}}
	posts := 0
	g := &GitHub{cli: func(args ...string) ([]byte, error) {
		if !strings.Contains(strings.Join(args, " "), "--input") {
			return []byte(`{"head":{"sha":"head1"},"state":"open"}`), nil
		}
		posts++
		payload, _ := payloadFromArgs(t, args)
		if payload["commit_id"] != "head1" || payload["event"] != "REQUEST_CHANGES" {
			t.Fatal(payload)
		}
		comments := payload["comments"].([]any)
		if len(comments) != 2 || comments[0].(map[string]any)["side"] != "LEFT" || comments[1].(map[string]any)["line"] != float64(20) {
			t.Fatal(comments)
		}
		return []byte(`{"id":123}`), nil
	}}
	if err := g.PublishReview("owner/repo", 7, draft); err != nil || posts != 1 {
		t.Fatal(err, posts)
	}
	draft.CommitOID = "old-head"
	if err := g.PublishReview("owner/repo", 7, draft); err == nil || posts != 1 {
		t.Fatal("stale draft posted")
	}
	draft.CommitOID = "head1"
	draft.Comments[0].Side = "MIDDLE"
	if err := g.PublishReview("owner/repo", 7, draft); err == nil || posts != 1 {
		t.Fatal("invalid coordinate posted")
	}
}
