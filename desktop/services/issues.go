package services

import (
	"context"
	"fmt"
	"github.com/atterpac/ichi/internal/remote"
	"time"
)

type IssueService struct{ state *State }

func (s *IssueService) ProviderStatus(ctx context.Context, name string) (*PRProviderStatus, error) {
	return (&PRService{state: s.state}).ProviderStatus(ctx, name)
}
func (s *IssueService) List(ctx context.Context, name, state, search string, limit int) ([]remote.Issue, error) {
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	p, repo, _, err := (&PRService{state: s.state}).provider(ctx, name)
	if err != nil {
		return nil, err
	}
	issues, ok := p.(remote.IssueProvider)
	if !ok {
		return nil, fmt.Errorf("issues are currently supported for GitHub remotes")
	}
	return issues.ListIssues(repo, state, search, limit)
}
func (s *IssueService) Get(ctx context.Context, name string, number int) (*remote.Issue, error) {
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	p, repo, _, err := (&PRService{state: s.state}).provider(ctx, name)
	if err != nil {
		return nil, err
	}
	issues, ok := p.(remote.IssueProvider)
	if !ok {
		return nil, fmt.Errorf("issues are currently supported for GitHub remotes")
	}
	return issues.GetIssue(repo, number)
}
