package services

import (
	"context"

	"github.com/atterpac/ichi/internal/git"
)

type StashService struct {
	state *State
}

func (s *StashService) ListStashes(ctx context.Context) ([]git.Stash, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.ListStashes()
}

func (s *StashService) StashPush(ctx context.Context, message string, includeUntracked bool) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.StashPush(message, includeUntracked) })
}

func (s *StashService) StashStaged(ctx context.Context, message string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.StashStaged(message) })
}

func (s *StashService) StashApplyIndex(ctx context.Context, index int) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.StashApplyIndex(index) })
}

func (s *StashService) StashPopIndex(ctx context.Context, index int) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.StashPopIndex(index) })
}

func (s *StashService) StashDropIndex(ctx context.Context, index int) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.StashDropIndex(index) })
}

func (s *StashService) StashClear(ctx context.Context) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.StashClear() })
}

func (s *StashService) StashShow(ctx context.Context, index int) (string, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return "", err
	}
	return repo.StashShow(index)
}

func (s *StashService) StashFiles(ctx context.Context, index int) ([]git.FileChurn, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.StashFiles(index)
}

func (s *StashService) StashCheckoutFiles(ctx context.Context, index int, paths []string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.StashCheckoutFiles(index, paths) })
}

func (s *StashService) StashBranch(ctx context.Context, branchName string, index int) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.StashBranch(branchName, index) })
}
