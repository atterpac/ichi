package services

import "github.com/atterpac/ichi/internal/git"

type StashService struct {
	state *State
}

func (s *StashService) ListStashes() ([]git.Stash, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.ListStashes()
}

func (s *StashService) StashPush(message string, includeUntracked bool) error {
	return s.mutate(func(repo *git.Repository) error { return repo.StashPush(message, includeUntracked) })
}

func (s *StashService) StashStaged(message string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.StashStaged(message) })
}

func (s *StashService) StashApplyIndex(index int) error {
	return s.mutate(func(repo *git.Repository) error { return repo.StashApplyIndex(index) })
}

func (s *StashService) StashPopIndex(index int) error {
	return s.mutate(func(repo *git.Repository) error { return repo.StashPopIndex(index) })
}

func (s *StashService) StashDropIndex(index int) error {
	return s.mutate(func(repo *git.Repository) error { return repo.StashDropIndex(index) })
}

func (s *StashService) StashClear() error {
	return s.mutate(func(repo *git.Repository) error { return repo.StashClear() })
}

func (s *StashService) StashShow(index int) (string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return "", err
	}
	return repo.StashShow(index)
}

func (s *StashService) StashBranch(branchName string, index int) error {
	return s.mutate(func(repo *git.Repository) error { return repo.StashBranch(branchName, index) })
}

func (s *StashService) mutate(fn func(*git.Repository) error) error {
	repo, err := s.state.Repo()
	if err != nil {
		return err
	}
	if err := fn(repo); err != nil {
		return err
	}
	s.state.emitStatusChanged()
	return nil
}
