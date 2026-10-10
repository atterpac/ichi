package remote

import "time"

// IssueProvider is optional: providers can expose issues independently of PRs.
type IssueProvider interface {
	ListIssues(repo, state, search string, limit int) ([]Issue, error)
	GetIssue(repo string, number int) (*Issue, error)
}
type Issue struct {
	NodeID      string
	CanReact    bool
	Reactions   []ReactionGroup
	Triage      InboxActivity
	Number      int
	Title       string
	Body        string
	State       string
	StateReason string
	Author      string
	URL         string
	CreatedAt   time.Time
	UpdatedAt   time.Time
	Labels      []string
	Assignees   []string
	Milestone   string
	Comments    []DiscussionComment
}

// InboxActivity contains bounded preview data. Known distinguishes unavailable
// enrichment from a genuinely empty conversation.
type InboxActivity struct {
	Known             bool
	CommentCount      int
	RecentComments    []DiscussionComment
	UnresolvedThreads int
	ThreadsKnown      bool
}
