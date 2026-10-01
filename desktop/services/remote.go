package services

import (
	"context"

	"github.com/atterpac/ichi/internal/git"
)

type RemoteService struct {
	state *State
}

func (s *RemoteService) Fetch(ctx context.Context, remote string) error {
	return s.state.mutate(ctx, "fetch", func(repo *git.Repository) error { return repo.Fetch(remote) })
}

func (s *RemoteService) FetchAll(ctx context.Context) error {
	return s.state.mutate(ctx, "fetch", func(repo *git.Repository) error { return repo.FetchAll() })
}

func (s *RemoteService) Pull(ctx context.Context) error {
	return s.state.mutate(ctx, "pull", func(repo *git.Repository) error { return repo.Pull() })
}

func (s *RemoteService) Push(ctx context.Context) error {
	return s.state.mutate(ctx, "push", func(repo *git.Repository) error { return repo.Push() })
}

func (s *RemoteService) HasUpstream(ctx context.Context) (bool, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return false, err
	}
	status, err := repo.LoadRepositoryStatus()
	if err != nil {
		return false, err
	}
	return status.HasUpstream, nil
}

func (s *RemoteService) PushSetUpstream(ctx context.Context, remote, branch string) error {
	return s.state.mutate(ctx, "push", func(repo *git.Repository) error { return repo.PushSetUpstream(remote, branch) })
}
