package services

import (
	"fmt"

	"github.com/atterpac/ichi/internal/remote"
	_ "github.com/atterpac/ichi/internal/remote/github"
)

type PRProviderStatus struct {
	Remote   string
	URL      string
	Provider string
	Repo     string
	Ready    bool
}

type PRService struct {
	state *State
}

func (s *PRService) ProviderStatus(remoteName string) (*PRProviderStatus, error) {
	provider, repoPath, url, err := s.provider(remoteName)
	if err != nil {
		return nil, err
	}
	return &PRProviderStatus{
		Remote:   remoteName,
		URL:      url,
		Provider: provider.Name(),
		Repo:     repoPath,
		Ready:    true,
	}, nil
}

func (s *PRService) ListPRs(remoteName string, opts remote.ListPRsOpts) ([]remote.PullRequest, error) {
	provider, repoPath, _, err := s.provider(remoteName)
	if err != nil {
		return nil, err
	}
	if err := provider.Authenticate(); err != nil {
		return nil, err
	}
	return provider.ListPRs(repoPath, opts)
}

func (s *PRService) GetPR(remoteName string, id int) (*remote.PullRequest, error) {
	provider, repoPath, _, err := s.provider(remoteName)
	if err != nil {
		return nil, err
	}
	if err := provider.Authenticate(); err != nil {
		return nil, err
	}
	return provider.GetPR(repoPath, id)
}

func (s *PRService) GetPRFiles(remoteName string, id int) ([]remote.ChangedFile, error) {
	provider, repoPath, _, err := s.provider(remoteName)
	if err != nil {
		return nil, err
	}
	if err := provider.Authenticate(); err != nil {
		return nil, err
	}
	return provider.GetPRFiles(repoPath, id)
}

func (s *PRService) GetPRDiff(remoteName string, id int) (string, error) {
	provider, repoPath, _, err := s.provider(remoteName)
	if err != nil {
		return "", err
	}
	if err := provider.Authenticate(); err != nil {
		return "", err
	}
	return provider.GetPRDiff(repoPath, id)
}

func (s *PRService) GetChecks(remoteName string, id int) ([]remote.Check, error) {
	provider, repoPath, _, err := s.provider(remoteName)
	if err != nil {
		return nil, err
	}
	if err := provider.Authenticate(); err != nil {
		return nil, err
	}
	return provider.GetChecks(repoPath, id)
}

func (s *PRService) ListReviews(remoteName string, id int) ([]remote.Review, error) {
	provider, repoPath, _, err := s.provider(remoteName)
	if err != nil {
		return nil, err
	}
	if err := provider.Authenticate(); err != nil {
		return nil, err
	}
	return provider.ListReviews(repoPath, id)
}

func (s *PRService) ListComments(remoteName string, id int) ([]remote.Comment, error) {
	provider, repoPath, _, err := s.provider(remoteName)
	if err != nil {
		return nil, err
	}
	if err := provider.Authenticate(); err != nil {
		return nil, err
	}
	return provider.ListComments(repoPath, id)
}

func (s *PRService) AddComment(remoteName string, id int, body string) (*remote.Comment, error) {
	provider, repoPath, _, err := s.provider(remoteName)
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

func (s *PRService) SubmitReview(remoteName string, id int, input remote.SubmitReviewInput) error {
	provider, repoPath, _, err := s.provider(remoteName)
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

func (s *PRService) MergePR(remoteName string, id int, opts remote.MergeOpts) error {
	provider, repoPath, _, err := s.provider(remoteName)
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

func (s *PRService) ClosePR(remoteName string, id int) error {
	provider, repoPath, _, err := s.provider(remoteName)
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

func (s *PRService) provider(remoteName string) (remote.Provider, string, string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, "", "", err
	}
	if remoteName == "" {
		remoteName = "origin"
	}
	url := repo.RemoteURL(remoteName)
	if url == "" {
		return nil, "", "", fmt.Errorf("remote %q has no URL", remoteName)
	}
	provider, repoPath, err := remote.DetectFromURL(url)
	return provider, repoPath, url, err
}
