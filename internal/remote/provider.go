package remote

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// Provider abstracts GitHub, GitLab, Bitbucket, etc.
type Provider interface {
	// WithContext returns an independent provider bound to this operation's lifetime.
	WithContext(context.Context) Provider

	// Identity
	Name() string

	// Pull/Merge Requests
	ListPRs(repo string, opts ListPRsOpts) ([]PullRequest, error)
	GetPR(repo string, id int) (*PullRequest, error)
	CreatePR(repo string, pr *CreatePRInput) (*PullRequest, error)
	UpdatePR(repo string, id int, pr *UpdatePRInput) error
	MergePR(repo string, id int, opts MergeOpts) error
	ClosePR(repo string, id int) error

	// Reviews
	ListReviews(repo string, prID int) ([]Review, error)
	SubmitReview(repo string, prID int, review *SubmitReviewInput) error

	// Comments
	ListComments(repo string, prID int) ([]Comment, error)
	AddComment(repo string, prID int, comment *CommentInput) (*Comment, error)
	AddInlineComment(repo string, prID int, comment *InlineCommentInput) (*Comment, error)
	ResolveComment(repo string, prID int, commentID int64) error

	// Diff
	GetPRDiff(repo string, prID int) (string, error)
	GetPRFiles(repo string, prID int) ([]ChangedFile, error)

	// CI/Status
	GetChecks(repo string, prID int) ([]Check, error)

	// Auth
	Authenticate() error
	CurrentUser() (*User, error)
}

// ListPRsOpts configures PR listing
type ListPRsOpts struct {
	State  PRState // Filter by state (empty = all open)
	Author string  // Filter by author
	Limit  int     // Max results (0 = default)
}

// CreatePRInput for creating a new PR
type CreatePRInput struct {
	Title     string
	Body      string
	Base      string // Target branch
	Head      string // Source branch
	Draft     bool
	Reviewers []string
	Labels    []string
}

// UpdatePRInput for updating a PR
type UpdatePRInput struct {
	Title     *string
	Body      *string
	State     *PRState
	Draft     *bool
	Reviewers []string
	Labels    []string
}

// MergeOpts configures merge behavior
type MergeOpts struct {
	Method        MergeMethod // merge, squash, rebase
	CommitTitle   string
	CommitMessage string
	DeleteBranch  bool
}

// MergeMethod defines how to merge
type MergeMethod string

const (
	MergeMerge  MergeMethod = "merge"
	MergeSquash MergeMethod = "squash"
	MergeRebase MergeMethod = "rebase"
)

// SubmitReviewInput for submitting a review
type SubmitReviewInput struct {
	State    ReviewState
	Body     string
	Comments []InlineCommentInput // Pending inline comments
}

// CommentInput for adding a general comment
type CommentInput struct {
	Body string
}

// InlineCommentInput for adding an inline comment on a diff
type InlineCommentInput struct {
	Path      string
	Line      int
	Side      DiffSide
	Body      string
	InReplyTo *int64
}

// Core types - provider-agnostic

// PullRequest represents a PR/MR
type PullRequest struct {
	ID           int64
	Number       int
	Title        string
	Body         string
	State        PRState
	Author       User
	BaseBranch   string
	HeadBranch   string
	HeadSHA      string
	Draft        bool
	Mergeable    *bool
	CreatedAt    time.Time
	UpdatedAt    time.Time
	Labels       []string
	Reviewers    []User
	Checks       []Check
	URL          string
	Additions    int
	Deletions    int
	ChangedFiles int
}

// PRState represents the state of a PR
type PRState string

const (
	PROpen   PRState = "open"
	PRClosed PRState = "closed"
	PRMerged PRState = "merged"
	PRAll    PRState = "all"
)

// Review represents a review on a PR
type Review struct {
	ID        int64
	Author    User
	State     ReviewState
	Body      string
	CreatedAt time.Time
}

// ReviewState represents the state of a review
type ReviewState string

const (
	ReviewApproved         ReviewState = "APPROVED"
	ReviewChangesRequested ReviewState = "CHANGES_REQUESTED"
	ReviewCommented        ReviewState = "COMMENTED"
	ReviewPending          ReviewState = "PENDING"
	ReviewDismissed        ReviewState = "DISMISSED"
)

// Comment represents a comment on a PR
type Comment struct {
	ID        int64
	Author    User
	Body      string
	CreatedAt time.Time
	UpdatedAt time.Time
	Resolved  bool
	// For inline comments
	Path      string
	Line      int
	OrigLine  int
	Side      DiffSide
	InReplyTo *int64
	DiffHunk  string
	CommitID  string
}

// DiffSide indicates which side of the diff
type DiffSide string

const (
	SideLeft  DiffSide = "LEFT"
	SideRight DiffSide = "RIGHT"
)

// Check represents a CI check/status
type Check struct {
	Name        string
	Status      CheckStatus
	Conclusion  CheckConclusion
	URL         string
	StartedAt   time.Time
	CompletedAt time.Time
}

// CheckStatus represents the status of a check
type CheckStatus string

const (
	CheckQueued     CheckStatus = "queued"
	CheckInProgress CheckStatus = "in_progress"
	CheckCompleted  CheckStatus = "completed"
)

// CheckConclusion represents the conclusion of a completed check
type CheckConclusion string

const (
	CheckSuccess   CheckConclusion = "success"
	CheckFailure   CheckConclusion = "failure"
	CheckNeutral   CheckConclusion = "neutral"
	CheckCancelled CheckConclusion = "cancelled"
	CheckTimedOut  CheckConclusion = "timed_out"
	CheckSkipped   CheckConclusion = "skipped"
)

// ChangedFile represents a file changed in a PR
type ChangedFile struct {
	Path      string
	Status    FileStatus
	Additions int
	Deletions int
	Patch     string
	PrevPath  string // For renames
}

// FileStatus represents the status of a changed file
type FileStatus string

const (
	FileAdded    FileStatus = "added"
	FileModified FileStatus = "modified"
	FileDeleted  FileStatus = "deleted"
	FileRenamed  FileStatus = "renamed"
	FileCopied   FileStatus = "copied"
)

// User represents a user
type User struct {
	ID        int64
	Login     string
	Name      string
	Email     string
	AvatarURL string
}

// Provider registry

var providers = make(map[string]func() Provider)

// Register adds a provider factory
func Register(name string, factory func() Provider) {
	providers[name] = factory
}

// Get returns a provider by name
func Get(name string) (Provider, error) {
	factory, ok := providers[name]
	if !ok {
		return nil, fmt.Errorf("unknown provider: %s", name)
	}
	return factory(), nil
}

// DetectFromURL routes supported public hosts after parsing the transport.
// Enterprise/custom hosts need an explicit provider configuration and are not
// inferred from paths, usernames or host substrings.
func DetectFromURL(remoteURL string) (Provider, string, error) {
	host, repo, err := parseRemoteURL(remoteURL)
	if err != nil {
		return nil, "", err
	}
	name := ""
	switch host {
	case "github.com":
		name = "github"
	case "gitlab.com":
		name = "gitlab"
	case "bitbucket.org":
		name = "bitbucket"
	default:
		return nil, "", fmt.Errorf("unsupported remote host: %q", host)
	}
	provider, err := Get(name)
	return provider, repo, err
}

func parseRemoteURL(raw string) (string, string, error) {
	var host, path string
	if strings.Contains(raw, "://") {
		parsed, err := url.Parse(raw)
		if err != nil {
			return "", "", fmt.Errorf("invalid remote URL: %w", err)
		}
		switch parsed.Scheme {
		case "http", "https", "ssh", "git":
		default:
			return "", "", fmt.Errorf("unsupported remote scheme: %q", parsed.Scheme)
		}
		if parsed.RawQuery != "" || parsed.Fragment != "" || strings.Contains(strings.ToLower(parsed.EscapedPath()), "%2f") {
			return "", "", fmt.Errorf("remote URL requires a repository path without query, fragment or escaped separators")
		}
		host, path = parsed.Hostname(), strings.TrimPrefix(parsed.Path, "/")
	} else {
		// SCP-style syntax: [user@]host:owner/repository.git.
		authority, repo, ok := strings.Cut(raw, ":")
		if !ok || strings.ContainsAny(authority, "/\\") {
			return "", "", fmt.Errorf("invalid SCP-style remote")
		}
		if at := strings.LastIndexByte(authority, '@'); at >= 0 {
			authority = authority[at+1:]
		}
		host, path = authority, repo
	}
	host = strings.ToLower(host)
	path = strings.TrimSuffix(path, ".git")
	if host == "" || strings.ContainsAny(host, " \t\r\n:") {
		return "", "", fmt.Errorf("invalid remote host")
	}
	parts := strings.Split(path, "/")
	if len(parts) < 2 || (host != "gitlab.com" && len(parts) != 2) {
		return "", "", fmt.Errorf("remote path requires owner/repository")
	}
	for _, part := range parts {
		if part == "" || part == "." || part == ".." || strings.ContainsAny(part, " \t\r\n\\:") {
			return "", "", fmt.Errorf("invalid repository path segment")
		}
	}
	return host, path, nil
}
