package github

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/atterpac/ichi/internal/remote"
)

func init() {
	remote.Register("github", New)
}

// GitHub implements the remote.Provider interface using the gh CLI
type GitHub struct {
	// cli is an optional execution seam for provider contract tests.
	cli           func(...string) ([]byte, error)
	ctx           context.Context
	authenticated bool
	user          *remote.User
}

// New creates a new GitHub provider
func New() remote.Provider {
	return &GitHub{}
}

// WithContext preserves provider configuration without changing another caller's
// lifetime. Interactive terminal authentication remains the caller's concern.
func (g *GitHub) WithContext(ctx context.Context) remote.Provider {
	clone := *g
	clone.ctx = ctx
	return &clone
}

func (g *GitHub) operationContext() context.Context {
	if g.ctx != nil {
		return g.ctx
	}
	return context.Background()
}

func (g *GitHub) Name() string {
	return "github"
}

func (g *GitHub) Authenticate() error {
	// Check if gh is authenticated
	if _, err := g.gh("auth", "status"); err != nil {
		return fmt.Errorf("gh CLI authentication check failed (run 'gh auth login' to authenticate): %w", err)
	}
	g.authenticated = true
	return nil
}

func (g *GitHub) CurrentUser() (*remote.User, error) {
	if g.user != nil {
		return g.user, nil
	}

	out, err := g.gh("api", "user")
	if err != nil {
		return nil, err
	}

	var resp struct {
		ID        int64  `json:"id"`
		Login     string `json:"login"`
		Name      string `json:"name"`
		Email     string `json:"email"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := json.Unmarshal(out, &resp); err != nil {
		return nil, err
	}

	g.user = &remote.User{
		ID:        resp.ID,
		Login:     resp.Login,
		Name:      resp.Name,
		Email:     resp.Email,
		AvatarURL: resp.AvatarURL,
	}
	return g.user, nil
}

func (g *GitHub) ListPRs(repo string, opts remote.ListPRsOpts) ([]remote.PullRequest, error) {
	args := []string{"pr", "list", "-R", repo, "--json",
		"number,title,state,author,headRefName,baseRefName,createdAt,updatedAt,labels,isDraft,url,additions,deletions,changedFiles,headRefOid"}

	if opts.State != "" && opts.State != remote.PRAll {
		args = append(args, "--state", string(opts.State))
	}
	if opts.Author != "" {
		args = append(args, "--author", opts.Author)
	}
	if opts.Limit > 0 {
		args = append(args, "--limit", strconv.Itoa(opts.Limit))
	}

	out, err := g.gh(args...)
	if err != nil {
		return nil, err
	}

	var resp []ghPullRequest
	if err := json.Unmarshal(out, &resp); err != nil {
		return nil, err
	}

	prs := make([]remote.PullRequest, len(resp))
	for i, pr := range resp {
		prs[i] = pr.toRemote()
	}
	return prs, nil
}

func (g *GitHub) GetPR(repo string, id int) (*remote.PullRequest, error) {
	out, err := g.gh("pr", "view", strconv.Itoa(id), "-R", repo, "--json",
		"number,title,body,state,author,headRefName,baseRefName,createdAt,updatedAt,labels,isDraft,url,additions,deletions,changedFiles,headRefOid,mergeable,reviewRequests")
	if err != nil {
		return nil, err
	}

	var resp ghPullRequest
	if err := json.Unmarshal(out, &resp); err != nil {
		return nil, err
	}

	pr := resp.toRemote()
	return &pr, nil
}

func (g *GitHub) CreatePR(repo string, input *remote.CreatePRInput) (*remote.PullRequest, error) {
	args := []string{"pr", "create", "-R", repo,
		"--title", input.Title,
		"--body", input.Body,
		"--base", input.Base,
		"--head", input.Head,
	}

	if input.Draft {
		args = append(args, "--draft")
	}
	for _, r := range input.Reviewers {
		args = append(args, "--reviewer", r)
	}
	for _, l := range input.Labels {
		args = append(args, "--label", l)
	}

	out, err := g.gh(args...)
	if err != nil {
		return nil, err
	}

	// gh pr create outputs the URL
	url := strings.TrimSpace(string(out))

	// Extract PR number from URL and fetch full details
	parts := strings.Split(url, "/")
	if len(parts) > 0 {
		numStr := parts[len(parts)-1]
		if num, err := strconv.Atoi(numStr); err == nil {
			return g.GetPR(repo, num)
		}
	}

	return nil, fmt.Errorf("failed to get created PR details")
}

func (g *GitHub) UpdatePR(repo string, id int, input *remote.UpdatePRInput) error {
	args := []string{"pr", "edit", strconv.Itoa(id), "-R", repo}

	if input.Title != nil {
		args = append(args, "--title", *input.Title)
	}
	if input.Body != nil {
		args = append(args, "--body", *input.Body)
	}
	for _, r := range input.Reviewers {
		args = append(args, "--add-reviewer", r)
	}
	for _, l := range input.Labels {
		args = append(args, "--add-label", l)
	}

	_, err := g.gh(args...)
	return err
}

func (g *GitHub) MergePR(repo string, id int, opts remote.MergeOpts) error {
	args := []string{"pr", "merge", strconv.Itoa(id), "-R", repo}

	switch opts.Method {
	case remote.MergeSquash:
		args = append(args, "--squash")
	case remote.MergeRebase:
		args = append(args, "--rebase")
	default:
		args = append(args, "--merge")
	}

	if opts.CommitTitle != "" {
		args = append(args, "--subject", opts.CommitTitle)
	}
	if opts.CommitMessage != "" {
		args = append(args, "--body", opts.CommitMessage)
	}
	if opts.DeleteBranch {
		args = append(args, "--delete-branch")
	}

	_, err := g.gh(args...)
	return err
}

func (g *GitHub) ClosePR(repo string, id int) error {
	_, err := g.gh("pr", "close", strconv.Itoa(id), "-R", repo)
	return err
}

func (g *GitHub) ListReviews(repo string, prID int) ([]remote.Review, error) {
	out, err := g.gh("api", fmt.Sprintf("repos/%s/pulls/%d/reviews", repo, prID))
	if err != nil {
		return nil, err
	}

	var resp []ghReview
	if err := json.Unmarshal(out, &resp); err != nil {
		return nil, err
	}

	reviews := make([]remote.Review, len(resp))
	for i, r := range resp {
		reviews[i] = r.toRemote()
	}
	return reviews, nil
}

var ErrInlineReviewCommentsUnsupported = errors.New("GitHub CLI review submission does not support pending inline comments")

func (g *GitHub) SubmitReview(repo string, prID int, input *remote.SubmitReviewInput) error {
	if len(input.Comments) != 0 {
		return ErrInlineReviewCommentsUnsupported
	}
	event := ""
	switch input.State {
	case remote.ReviewApproved:
		event = "APPROVE"
	case remote.ReviewChangesRequested:
		event = "REQUEST_CHANGES"
	case remote.ReviewCommented:
		event = "COMMENT"
	default:
		return fmt.Errorf("unsupported review state: %s", input.State)
	}
	args := []string{"api", "-X", "POST",
		fmt.Sprintf("repos/%s/pulls/%d/reviews", repo, prID),
		"-f", fmt.Sprintf("event=%s", event),
	}

	if input.Body != "" {
		args = append(args, "-f", fmt.Sprintf("body=%s", input.Body))
	}

	// Reject unsupported comments before posting to avoid partial success.

	_, err := g.gh(args...)
	return err
}

func (g *GitHub) ListComments(repo string, prID int) ([]remote.Comment, error) {
	// Get review comments (inline on diff)
	out, err := g.gh("api", fmt.Sprintf("repos/%s/pulls/%d/comments", repo, prID))
	if err != nil {
		return nil, err
	}

	var resp []ghComment
	if err := json.Unmarshal(out, &resp); err != nil {
		return nil, err
	}

	comments := make([]remote.Comment, len(resp))
	for i, c := range resp {
		comments[i] = c.toRemote()
	}
	return comments, nil
}

func (g *GitHub) AddComment(repo string, prID int, input *remote.CommentInput) (*remote.Comment, error) {
	out, err := g.gh("api", "-X", "POST", fmt.Sprintf("repos/%s/issues/%d/comments", repo, prID), "-f", "body="+input.Body)
	if err != nil {
		return nil, err
	}
	var response ghComment
	if err := json.Unmarshal(out, &response); err != nil {
		return nil, err
	}
	comment := response.toRemote()
	return &comment, nil
}

func (g *GitHub) AddInlineComment(repo string, prID int, input *remote.InlineCommentInput) (*remote.Comment, error) {
	// Get the latest commit SHA
	pr, err := g.GetPR(repo, prID)
	if err != nil {
		return nil, err
	}

	args := []string{"api", "-X", "POST",
		fmt.Sprintf("repos/%s/pulls/%d/comments", repo, prID),
		"-f", fmt.Sprintf("body=%s", input.Body),
		"-f", fmt.Sprintf("path=%s", input.Path),
		"-F", fmt.Sprintf("line=%d", input.Line),
		"-f", fmt.Sprintf("side=%s", input.Side),
		"-f", fmt.Sprintf("commit_id=%s", pr.HeadSHA),
	}

	if input.InReplyTo != nil {
		args = append(args, "-F", fmt.Sprintf("in_reply_to=%d", *input.InReplyTo))
	}

	out, err := g.gh(args...)
	if err != nil {
		return nil, err
	}

	var resp ghComment
	if err := json.Unmarshal(out, &resp); err != nil {
		return nil, err
	}

	c := resp.toRemote()
	return &c, nil
}

func (g *GitHub) ResolveComment(repo string, prID int, commentID int64) error {
	// GitHub doesn't have a direct "resolve" API for PR comments
	// This is typically done through the GraphQL API for review threads
	return fmt.Errorf("resolve comment not supported via REST API")
}

func (g *GitHub) GetPRDiff(repo string, prID int) (string, error) {
	out, err := g.gh("pr", "diff", strconv.Itoa(prID), "-R", repo)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func (g *GitHub) GetPRFiles(repo string, prID int) ([]remote.ChangedFile, error) {
	out, err := g.gh("api", fmt.Sprintf("repos/%s/pulls/%d/files", repo, prID))
	if err != nil {
		return nil, err
	}

	var resp []ghChangedFile
	if err := json.Unmarshal(out, &resp); err != nil {
		return nil, err
	}

	files := make([]remote.ChangedFile, len(resp))
	for i, f := range resp {
		files[i] = f.toRemote()
	}
	return files, nil
}

func (g *GitHub) GetChecks(repo string, prID int) ([]remote.Check, error) {
	// A PR rollup returns an empty collection successfully when checks are absent.
	// Unlike `gh pr checks`, a failed or pending check does not change the CLI exit
	// status; authentication/network failures remain errors rather than data.
	out, err := g.gh("pr", "view", strconv.Itoa(prID), "-R", repo, "--json", "statusCheckRollup")
	if err != nil {
		return nil, err
	}
	var response struct {
		Checks []ghCheck `json:"statusCheckRollup"`
	}
	if err := json.Unmarshal(out, &response); err != nil {
		return nil, err
	}
	checks := make([]remote.Check, len(response.Checks))
	for i, check := range response.Checks {
		checks[i] = check.toRemote()
	}
	return checks, nil
}

// gh executes a gh CLI command and returns stdout
func (g *GitHub) gh(args ...string) ([]byte, error) {
	ctx := g.operationContext()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if g.cli != nil {
		return g.cli(args...)
	}
	cmd := exec.CommandContext(ctx, "gh", args...)
	cmd.WaitDelay = time.Second
	out, err := cmd.Output()
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("gh %s: %s: %w", strings.Join(args, " "), string(exitErr.Stderr), err)
		}
		return nil, err
	}
	return out, nil
}

// GitHub API response types

type ghPullRequest struct {
	Number         int       `json:"number"`
	Title          string    `json:"title"`
	Body           string    `json:"body"`
	State          string    `json:"state"`
	Author         ghUser    `json:"author"`
	HeadRefName    string    `json:"headRefName"`
	BaseRefName    string    `json:"baseRefName"`
	HeadRefOid     string    `json:"headRefOid"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
	Labels         []ghLabel `json:"labels"`
	IsDraft        bool      `json:"isDraft"`
	URL            string    `json:"url"`
	Additions      int       `json:"additions"`
	Deletions      int       `json:"deletions"`
	ChangedFiles   int       `json:"changedFiles"`
	Mergeable      string    `json:"mergeable"`
	ReviewRequests []ghUser  `json:"reviewRequests"`
}

func (pr *ghPullRequest) toRemote() remote.PullRequest {
	labels := make([]string, len(pr.Labels))
	for i, l := range pr.Labels {
		labels[i] = l.Name
	}

	reviewers := make([]remote.User, len(pr.ReviewRequests))
	for i, r := range pr.ReviewRequests {
		reviewers[i] = r.toRemote()
	}

	var mergeable *bool
	if pr.Mergeable == "MERGEABLE" || pr.Mergeable == "CONFLICTING" {
		m := pr.Mergeable == "MERGEABLE"
		mergeable = &m
	}

	state := remote.PROpen
	if pr.State == "MERGED" {
		state = remote.PRMerged
	} else if pr.State == "CLOSED" {
		state = remote.PRClosed
	}

	return remote.PullRequest{
		Number:       pr.Number,
		Title:        pr.Title,
		Body:         pr.Body,
		State:        state,
		Author:       pr.Author.toRemote(),
		HeadBranch:   pr.HeadRefName,
		BaseBranch:   pr.BaseRefName,
		HeadSHA:      pr.HeadRefOid,
		CreatedAt:    pr.CreatedAt,
		UpdatedAt:    pr.UpdatedAt,
		Labels:       labels,
		Draft:        pr.IsDraft,
		Mergeable:    mergeable,
		URL:          pr.URL,
		Additions:    pr.Additions,
		Deletions:    pr.Deletions,
		ChangedFiles: pr.ChangedFiles,
		Reviewers:    reviewers,
	}
}

type ghUser struct {
	Login     string `json:"login"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatarUrl"`
}

func (u *ghUser) toRemote() remote.User {
	return remote.User{
		Login:     u.Login,
		Name:      u.Name,
		Email:     u.Email,
		AvatarURL: u.AvatarURL,
	}
}

type ghLabel struct {
	Name string `json:"name"`
}

type ghReview struct {
	ID          int64     `json:"id"`
	User        ghUser    `json:"user"`
	State       string    `json:"state"`
	Body        string    `json:"body"`
	SubmittedAt time.Time `json:"submitted_at"`
}

func (r *ghReview) toRemote() remote.Review {
	return remote.Review{
		ID:        r.ID,
		Author:    r.User.toRemote(),
		State:     remote.ReviewState(r.State),
		Body:      r.Body,
		CreatedAt: r.SubmittedAt,
	}
}

type ghComment struct {
	ID           int64     `json:"id"`
	User         ghUser    `json:"user"`
	Body         string    `json:"body"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	Path         string    `json:"path"`
	Line         int       `json:"line"`
	OriginalLine int       `json:"original_line"`
	Side         string    `json:"side"`
	InReplyToID  *int64    `json:"in_reply_to_id"`
	DiffHunk     string    `json:"diff_hunk"`
	CommitID     string    `json:"commit_id"`
}

func (c *ghComment) toRemote() remote.Comment {
	side := remote.SideRight
	if c.Side == "LEFT" {
		side = remote.SideLeft
	}

	return remote.Comment{
		ID:        c.ID,
		Author:    c.User.toRemote(),
		Body:      c.Body,
		CreatedAt: c.CreatedAt,
		UpdatedAt: c.UpdatedAt,
		Path:      c.Path,
		Line:      c.Line,
		OrigLine:  c.OriginalLine,
		Side:      side,
		InReplyTo: c.InReplyToID,
		DiffHunk:  c.DiffHunk,
		CommitID:  c.CommitID,
	}
}

type ghChangedFile struct {
	Filename     string `json:"filename"`
	Status       string `json:"status"`
	Additions    int    `json:"additions"`
	Deletions    int    `json:"deletions"`
	Patch        string `json:"patch"`
	PrevFilename string `json:"previous_filename"`
}

func (f *ghChangedFile) toRemote() remote.ChangedFile {
	return remote.ChangedFile{
		Path:      f.Filename,
		Status:    remote.FileStatus(f.Status),
		Additions: f.Additions,
		Deletions: f.Deletions,
		Patch:     f.Patch,
		PrevPath:  f.PrevFilename,
	}
}

type ghCheck struct {
	Type        string    `json:"__typename"`
	Status      string    `json:"status"`
	Context     string    `json:"context"`
	TargetURL   string    `json:"targetUrl"`
	DetailsURL  string    `json:"detailsUrl"`
	CreatedAt   time.Time `json:"createdAt"`
	Name        string    `json:"name"`
	State       string    `json:"state"`
	Conclusion  string    `json:"conclusion"`
	Link        string    `json:"link"`
	StartedAt   time.Time `json:"startedAt"`
	CompletedAt time.Time `json:"completedAt"`
}

func (c *ghCheck) toRemote() remote.Check {
	status := remote.CheckQueued
	name, url := c.Name, c.DetailsURL
	state, conclusion := c.Status, strings.ToLower(c.Conclusion)
	started := c.StartedAt
	if c.Type == "StatusContext" {
		name, url = c.Context, c.TargetURL
		started = c.CreatedAt
		if c.State == "PENDING" {
			state = "IN_PROGRESS"
		} else {
			state = "COMPLETED"
			conclusion = strings.ToLower(c.State)
			if c.State == "ERROR" {
				conclusion = "failure"
			}
		}
	}
	switch state {
	case "IN_PROGRESS":
		status = remote.CheckInProgress
	case "COMPLETED":
		status = remote.CheckCompleted
	}
	return remote.Check{Name: name, Status: status, Conclusion: remote.CheckConclusion(conclusion), URL: url, StartedAt: started, CompletedAt: c.CompletedAt}
}
