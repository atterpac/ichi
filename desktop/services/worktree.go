package services

import "github.com/atterpac/ichi/internal/git"

type WorktreeService struct {
	state *State
}

func (s *WorktreeService) Status() ([]git.StatusEntry, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.Status()
}

func (s *WorktreeService) StagedFiles() ([]git.StatusEntry, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.StagedFiles()
}

func (s *WorktreeService) UnstagedFiles() ([]git.StatusEntry, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.UnstagedFiles()
}

func (s *WorktreeService) UntrackedFiles() ([]git.StatusEntry, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.UntrackedFiles()
}

func (s *WorktreeService) StageFile(path string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.StageFile(path) })
}

func (s *WorktreeService) StageAll() error {
	return s.mutate(func(repo *git.Repository) error { return repo.StageAll() })
}

func (s *WorktreeService) UnstageFile(path string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.UnstageFile(path) })
}

func (s *WorktreeService) UnstageAll() error {
	return s.mutate(func(repo *git.Repository) error { return repo.UnstageAll() })
}

func (s *WorktreeService) DiscardFileChanges(path string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.DiscardFileChanges(path) })
}

func (s *WorktreeService) Commit(message string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.Commit(message) })
}

func (s *WorktreeService) CommitAmend(message string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.CommitAmend(message) })
}

func (s *WorktreeService) mutate(fn func(*git.Repository) error) error {
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
