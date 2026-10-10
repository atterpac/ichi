package github

import (
	"encoding/json"
	"fmt"
	"github.com/atterpac/ichi/internal/remote"
	"os"
	"strconv"
	"strings"
)

// Payloads go through a private temporary file rather than command-line arguments.
func (g *GitHub) apiJSON(endpoint string, payload any) ([]byte, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	f, err := os.CreateTemp("", "ichi-github-*.json")
	if err != nil {
		return nil, err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(data); err != nil {
		f.Close()
		return nil, err
	}
	if err = f.Close(); err != nil {
		return nil, err
	}
	raw, err := g.gh("api", endpoint, "--hostname", "github.com", "--method", "POST", "--input", f.Name())
	if err != nil {
		return nil, err
	}
	var envelope struct{ Errors []struct{ Message string } }
	if json.Unmarshal(raw, &envelope) == nil && len(envelope.Errors) > 0 {
		return nil, fmt.Errorf("GitHub: %s", envelope.Errors[0].Message)
	}
	if endpoint == "graphql" {
		var response struct{ Data map[string]json.RawMessage }
		if json.Unmarshal(raw, &response) != nil || len(response.Data) == 0 {
			return nil, fmt.Errorf("GitHub returned no mutation result; refresh before retrying")
		}
		for _, value := range response.Data {
			if string(value) == "null" {
				return nil, fmt.Errorf("GitHub returned an empty mutation result; refresh before retrying")
			}
		}
	}
	return raw, nil
}
func validConversation(repo string, number int, kind string) error {
	parts := strings.Split(repo, "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" || number <= 0 || (kind != "pr" && kind != "issue") {
		return fmt.Errorf("a repository, positive number and conversation kind are required")
	}
	return nil
}
func (g *GitHub) conversationSubject(repo string, number int, kind string) (string, error) {
	parts := strings.Split(repo, "/")
	var response struct {
		Data struct {
			Repository *struct {
				Subject *struct {
					ID   string
					Type string `json:"__typename"`
				} `json:"issueOrPullRequest"`
			}
		}
	}
	err := g.graphql(`query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issueOrPullRequest(number:$number){__typename ... on Issue{id} ... on PullRequest{id}}}}`, []string{"-f", "owner=" + parts[0], "-f", "name=" + parts[1], "-F", "number=" + strconv.Itoa(number)}, &response)
	if err != nil {
		return "", err
	}
	if response.Data.Repository == nil || response.Data.Repository.Subject == nil {
		return "", fmt.Errorf("conversation unavailable")
	}
	subject := response.Data.Repository.Subject
	if (kind == "pr") != (subject.Type == "PullRequest") || subject.ID == "" {
		return "", fmt.Errorf("conversation type mismatch")
	}
	return subject.ID, nil
}

// Check IDs against the selected repository and conversation before mutating them.
func (g *GitHub) conversationNode(repo string, number int, kind, id string) (string, error) {
	var response struct {
		Data struct {
			Node *struct {
				Type        string `json:"__typename"`
				Number      int
				Repository  struct{ NameWithOwner string }
				Issue       *struct{ Number int }
				PullRequest *struct{ Number int }
			}
		}
	}
	query := `query($id:ID!){node(id:$id){__typename ... on Issue{number repository{nameWithOwner}} ... on PullRequest{number repository{nameWithOwner}} ... on IssueComment{repository{nameWithOwner} issue{number} pullRequest{number}} ... on PullRequestReviewComment{repository{nameWithOwner} pullRequest{number}} ... on PullRequestReview{repository{nameWithOwner} pullRequest{number}} ... on PullRequestReviewThread{repository{nameWithOwner} pullRequest{number}}}}`
	if err := g.graphql(query, []string{"-f", "id=" + id}, &response); err != nil {
		return "", err
	}
	node := response.Data.Node
	if node == nil || !strings.EqualFold(node.Repository.NameWithOwner, repo) {
		return "", fmt.Errorf("comment is not in the selected repository")
	}
	actualNumber := node.Number
	actualKind := "issue"
	if node.Type == "PullRequest" {
		actualKind = "pr"
	}
	if node.Issue != nil {
		actualNumber = node.Issue.Number
	}
	if node.PullRequest != nil {
		actualNumber = node.PullRequest.Number
		actualKind = "pr"
	}
	if actualNumber != number || actualKind != kind {
		return "", fmt.Errorf("comment is not in the selected conversation")
	}
	return node.Type, nil
}
func (g *GitHub) MutateConversation(repo string, number int, kind string, input remote.ConversationAction) error {
	if err := validConversation(repo, number, kind); err != nil {
		return err
	}
	if len(input.Body) > 65536 {
		return fmt.Errorf("comment is too long")
	}
	switch input.Action {
	case "comment", "edit", "reply":
		if strings.TrimSpace(input.Body) == "" {
			return fmt.Errorf("comment cannot be empty")
		}
	case "delete", "react", "unreact", "resolve", "unresolve":
	default:
		return fmt.Errorf("unsupported conversation action")
	}
	fields := map[string]any{}
	mutation := ""
	if input.Action == "comment" {
		id, err := g.conversationSubject(repo, number, kind)
		if err != nil {
			return err
		}
		mutation = "addComment"
		fields["subjectId"] = id
		fields["body"] = input.Body
	} else {
		if input.SubjectID == "" {
			return fmt.Errorf("a subject is required")
		}
		typ, err := g.conversationNode(repo, number, kind, input.SubjectID)
		if err != nil {
			return err
		}
		switch input.Action {
		case "react", "unreact":
			if typ == "PullRequestReviewThread" {
				return fmt.Errorf("react to a comment, not a thread")
			}
			switch input.Reaction {
			case "THUMBS_UP", "THUMBS_DOWN", "LAUGH", "HOORAY", "CONFUSED", "HEART", "ROCKET", "EYES":
			default:
				return fmt.Errorf("unsupported reaction")
			}
			mutation = "addReaction"
			if input.Action == "unreact" {
				mutation = "removeReaction"
			}
			fields["subjectId"] = input.SubjectID
			fields["content"] = input.Reaction
		case "reply", "resolve", "unresolve":
			if typ != "PullRequestReviewThread" {
				return fmt.Errorf("a review thread is required")
			}
			if input.Action == "reply" {
				mutation = "addPullRequestReviewThreadReply"
				fields["pullRequestReviewThreadId"] = input.SubjectID
				fields["body"] = input.Body
			} else {
				mutation = "resolveReviewThread"
				if input.Action == "unresolve" {
					mutation = "unresolveReviewThread"
				}
				fields["threadId"] = input.SubjectID
			}
		case "edit", "delete":
			field := "id"
			switch typ {
			case "IssueComment":
				mutation = "IssueComment"
			case "PullRequestReviewComment":
				mutation = "PullRequestReviewComment"
				if input.Action == "edit" {
					field = "pullRequestReviewCommentId"
				}
			case "PullRequestReview":
				mutation = "PullRequestReview"
				field = "pullRequestReviewId"
			default:
				return fmt.Errorf("only comments and reviews can be edited or deleted here")
			}
			if input.Action == "edit" {
				mutation = "update" + mutation
				fields["body"] = input.Body
			} else {
				mutation = "delete" + mutation
			}
			fields[field] = input.SubjectID
		}
	}
	inputType := strings.ToUpper(mutation[:1]) + mutation[1:] + "Input"
	_, err := g.apiJSON("graphql", map[string]any{"query": "mutation($input:" + inputType + "!){" + mutation + "(input:$input){clientMutationId}}", "variables": map[string]any{"input": fields}})
	return err
}
func (g *GitHub) PublishReview(repo string, number int, input remote.ConversationReview) error {
	if err := validConversation(repo, number, "pr"); err != nil {
		return err
	}
	switch input.Event {
	case "COMMENT", "APPROVE", "REQUEST_CHANGES":
	default:
		return fmt.Errorf("unsupported review decision")
	}
	if (input.Event == "REQUEST_CHANGES" || input.Event == "COMMENT") && strings.TrimSpace(input.Body) == "" {
		return fmt.Errorf("a review message is required")
	}
	if input.CommitOID == "" {
		return fmt.Errorf("refresh the pull request before reviewing")
	}
	raw, err := g.gh("api", "repos/"+repo+"/pulls/"+strconv.Itoa(number), "--hostname", "github.com")
	if err != nil {
		return err
	}
	var pr struct {
		Head  struct{ SHA string }
		State string
	}
	if err = json.Unmarshal(raw, &pr); err != nil {
		return err
	}
	if pr.State != "open" {
		return fmt.Errorf("this pull request is no longer open")
	}
	if pr.Head.SHA != input.CommitOID {
		return fmt.Errorf("the pull request changed; refresh and check your draft comments against the new diff before submitting")
	}
	comments := []map[string]any{}
	for _, c := range input.Comments {
		if c.Path == "" || c.Line <= 0 || (c.Side != "LEFT" && c.Side != "RIGHT") || strings.TrimSpace(c.Body) == "" {
			return fmt.Errorf("each review comment needs a file, diff line, side and text")
		}
		comments = append(comments, map[string]any{"path": c.Path, "line": c.Line, "side": c.Side, "body": c.Body})
	}
	_, err = g.apiJSON("repos/"+repo+"/pulls/"+strconv.Itoa(number)+"/reviews", map[string]any{"commit_id": input.CommitOID, "event": input.Event, "body": input.Body, "comments": comments})
	return err
}
