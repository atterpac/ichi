package services

import "github.com/atterpac/ichi/internal/git"

type ConflictFile struct {
	Regions []*git.ConflictRegion
	Lines   []string
}

type ConflictService struct {
	state *State
}

func (s *ConflictService) GetConflictState() (*git.ConflictState, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.GetConflictState()
}

func (s *ConflictService) ConflictFiles() ([]git.StatusEntry, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.ConflictFiles()
}

func (s *ConflictService) ParseConflictFile(path string) (*ConflictFile, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	regions, lines, err := repo.ParseConflictFile(path)
	if err != nil {
		return nil, err
	}
	return &ConflictFile{Regions: regions, Lines: lines}, nil
}

func (s *ConflictService) WriteResolvedFile(path string, lines []string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.WriteResolvedFile(path, lines) })
}

func (s *ConflictService) StageResolvedFile(path string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.StageResolvedFile(path) })
}

func (s *ConflictService) MergeContinue() error {
	return s.mutate(func(repo *git.Repository) error { return repo.MergeContinue() })
}

func (s *ConflictService) MergeAbort() error {
	return s.mutate(func(repo *git.Repository) error { return repo.MergeAbort() })
}

func (s *ConflictService) RebaseContinue() error {
	return s.mutate(func(repo *git.Repository) error { return repo.RebaseContinue() })
}

func (s *ConflictService) RebaseAbort() error {
	return s.mutate(func(repo *git.Repository) error { return repo.RebaseAbort() })
}

func (s *ConflictService) ContinueConflict() error {
	repo, err := s.state.Repo()
	if err != nil {
		return err
	}
	state, err := repo.GetConflictState()
	if err != nil {
		return err
	}
	switch state.Type {
	case git.ConflictMerge:
		err = repo.MergeContinue()
	case git.ConflictRebase:
		err = repo.RebaseContinue()
	default:
		return nil
	}
	if err == nil {
		s.state.emitStatusChanged()
	}
	return err
}

func (s *ConflictService) AbortConflict() error {
	repo, err := s.state.Repo()
	if err != nil {
		return err
	}
	state, err := repo.GetConflictState()
	if err != nil {
		return err
	}
	switch state.Type {
	case git.ConflictMerge:
		err = repo.MergeAbort()
	case git.ConflictRebase:
		err = repo.RebaseAbort()
	default:
		return nil
	}
	if err == nil {
		s.state.emitStatusChanged()
	}
	return err
}

func (s *ConflictService) mutate(fn func(*git.Repository) error) error {
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
