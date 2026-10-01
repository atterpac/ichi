package services

import (
	"context"

	"github.com/atterpac/ichi/internal/git"
)

type GraphService struct {
	state *State
}

func (s *GraphService) LoadGraph(ctx context.Context, limit int) (*git.Graph, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.LoadGraph(limit)
}

func (s *GraphService) LoadCommit(ctx context.Context, hash string) (*git.CommitDetail, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.LoadCommit(ctx, hash)
}

func (s *GraphService) SearchCommits(ctx context.Context, query string, limit int) ([]*git.Commit, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.SearchCommits(query, limit)
}

func (s *GraphService) LoadGraphStashes(ctx context.Context) ([]*git.Commit, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.LoadStashes()
}

func (s *GraphService) GetCommitMessage(ctx context.Context, hash string) (string, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return "", err
	}
	return repo.GetCommitMessage(hash)
}

func (s *GraphService) RenameCommit(ctx context.Context, hash, message string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.RenameCommit(hash, message) })
}

func (s *GraphService) DropCommit(ctx context.Context, hash string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.DropCommit(hash) })
}

func (s *GraphService) IsCommitPushed(ctx context.Context, hash string) (bool, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return false, err
	}
	return repo.ReadCommitPushed(hash)
}

func (s *GraphService) LoadCommitMetadata(ctx context.Context, hash string) (*git.CommitMetadata, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.LoadCommitMetadata(ctx, hash)
}
