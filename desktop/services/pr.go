package services

import (
	"context"
	"fmt"
	"github.com/atterpac/ichi/internal/git"
	"time"

	"github.com/atterpac/ichi/internal/remote"
	_ "github.com/atterpac/ichi/internal/remote/github"
)

type PRProviderStatus struct {
	Remote   string
	URL      string
	Provider string
	Repo     string
	Ready    bool
	Login    string
	Message  string
}

type PRService struct {
	state *State
}

func (s *PRService) ProviderStatus(ctx context.Context, remoteName string) (*PRProviderStatus, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	provider, repoPath, url, err := s.provider(ctx, remoteName)
	if err != nil {
		return nil, err
	}
	status := &PRProviderStatus{Remote: remoteName, URL: url, Provider: provider.Name(), Repo: repoPath}
	if err := provider.Authenticate(); err != nil {
		status.Message = err.Error()
		return status, nil
	}
	user, err := provider.CurrentUser()
	if err != nil {
		status.Message = err.Error()
		return status, nil
	}
	status.Ready = true
	status.Login = user.Login
	return status, nil
}

func (s *PRService) ListPRs(ctx context.Context, remoteName string, opts remote.ListPRsOpts) ([]remote.PullRequest, error) {
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	provider, repoPath, _, err := s.provider(ctx, remoteName)
	if err != nil {
		return nil, err
	}
	if err := provider.Authenticate(); err != nil {
		return nil, err
	}
	return provider.ListPRs(repoPath, opts)
}

func (s *PRService) GetPR(ctx context.Context, remoteName string, id int) (*remote.PullRequest, error) {
	provider, repoPath, _, err := s.provider(ctx, remoteName)
	if err != nil {
		return nil, err
	}
	if err := provider.Authenticate(); err != nil {
		return nil, err
	}
	return provider.GetPR(repoPath, id)
}

func (s *PRService) GetPRFiles(ctx context.Context, remoteName string, id int) ([]remote.ChangedFile, error) {
	provider, repoPath, _, err := s.provider(ctx, remoteName)
	if err != nil {
		return nil, err
	}
	if err := provider.Authenticate(); err != nil {
		return nil, err
	}
	return provider.GetPRFiles(repoPath, id)
}

func (s *PRService) GetPRDiff(ctx context.Context, remoteName string, id int) (string, error) {
	provider, repoPath, _, err := s.provider(ctx, remoteName)
	if err != nil {
		return "", err
	}
	if err := provider.Authenticate(); err != nil {
		return "", err
	}
	return provider.GetPRDiff(repoPath, id)
}

func (s *PRService) GetChecks(ctx context.Context, remoteName string, id int) ([]remote.Check, error) {
	provider, repoPath, _, err := s.provider(ctx, remoteName)
	if err != nil {
		return nil, err
	}
	if err := provider.Authenticate(); err != nil {
		return nil, err
	}
	return provider.GetChecks(repoPath, id)
}

func (s *PRService) ListReviews(ctx context.Context, remoteName string, id int) ([]remote.Review, error) {
	provider, repoPath, _, err := s.provider(ctx, remoteName)
	if err != nil {
		return nil, err
	}
	if err := provider.Authenticate(); err != nil {
		return nil, err
	}
	return provider.ListReviews(repoPath, id)
}

func (s *PRService) ListComments(ctx context.Context, remoteName string, id int) ([]remote.Comment, error) {
	provider, repoPath, _, err := s.provider(ctx, remoteName)
	if err != nil {
		return nil, err
	}
	if err := provider.Authenticate(); err != nil {
		return nil, err
	}
	return provider.ListComments(repoPath, id)
}

func (s *PRService) AddComment(ctx context.Context, remoteName string, id int, body string) (*remote.Comment, error) {
	provider, repoPath, _, err := s.provider(ctx, remoteName)
	if err != nil {
		return nil, err
	}
	if err := provider.Authenticate(); err != nil {
		return nil, err
	}
	comment, err := provider.AddComment(repoPath, id, &remote.CommentInput{Body: body})
	if err == nil {
		s.state.Emit(EventPRChanged, map[string]any{"remote": remoteName, "id": id})
	}
	return comment, err
}

func (s *PRService) SubmitReview(ctx context.Context, remoteName string, id int, input remote.SubmitReviewInput) error {
	provider, repoPath, _, err := s.provider(ctx, remoteName)
	if err != nil {
		return err
	}
	if err := provider.Authenticate(); err != nil {
		return err
	}
	err = provider.SubmitReview(repoPath, id, &input)
	if err == nil {
		s.state.Emit(EventPRChanged, map[string]any{"remote": remoteName, "id": id})
	}
	return err
}

func (s *PRService) MergePR(ctx context.Context, remoteName string, id int, opts remote.MergeOpts) error {
	provider, repoPath, _, err := s.provider(ctx, remoteName)
	if err != nil {
		return err
	}
	if err := provider.Authenticate(); err != nil {
		return err
	}
	err = provider.MergePR(repoPath, id, opts)
	if err == nil {
		s.state.Emit(EventPRChanged, map[string]any{"remote": remoteName, "id": id})
		s.state.emitStatusChanged()
	}
	return err
}

func (s *PRService) ClosePR(ctx context.Context, remoteName string, id int) error {
	provider, repoPath, _, err := s.provider(ctx, remoteName)
	if err != nil {
		return err
	}
	if err := provider.Authenticate(); err != nil {
		return err
	}
	err = provider.ClosePR(repoPath, id)
	if err == nil {
		s.state.Emit(EventPRChanged, map[string]any{"remote": remoteName, "id": id})
	}
	return err
}

func (s *PRService) provider(ctx context.Context, remoteName string) (remote.Provider, string, string, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, "", "", err
	}
	if remoteName == "" {
		remoteName = "origin"
	}
	url, err := repo.ReadRemoteURL(remoteName)
	if err != nil {
		return nil, "", "", err
	}
	if url == "" {
		return nil, "", "", fmt.Errorf("remote %q has no URL", remoteName)
	}
	provider, repoPath, err := remote.DetectFromURL(url)
	if err != nil {
		return nil, "", "", err
	}
	return provider.WithContext(ctx), repoPath, url, nil
}

// GetDiscussion returns the conversation and complete review threads without modifying GitHub.
func (s *PRService) GetDiscussion(ctx context.Context, remoteName string, id int) (*remote.Discussion, error) {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	provider, repo, _, err := s.provider(ctx, remoteName)
	if err != nil {
		return nil, err
	}
	discussion, ok := provider.(remote.DiscussionProvider)
	if !ok {
		return nil, fmt.Errorf("review threads are not available for this provider")
	}
	return discussion.GetDiscussion(repo, id)
}

func (s *PRService) GetPRPatches(ctx context.Context, remoteName string, id int, expectedHead string) ([]*git.FileDiff, error) {
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	if expectedHead == "" {
		return nil, fmt.Errorf("refresh the pull request before loading review lines")
	}
	provider, repo, _, err := s.provider(ctx, remoteName)
	if err != nil {
		return nil, err
	}
	verify := func() error {
		pr, err := provider.GetPR(repo, id)
		if err != nil {
			return err
		}
		if pr == nil || pr.HeadSHA != expectedHead {
			return fmt.Errorf("the pull request changed while loading its diff; refresh before reviewing")
		}
		return nil
	}
	if err = verify(); err != nil {
		return nil, err
	}
	raw, err := provider.GetPRDiff(repo, id)
	if err != nil {
		return nil, err
	}
	if err = verify(); err != nil {
		return nil, err
	}
	return git.ParseDiff(raw)
}
