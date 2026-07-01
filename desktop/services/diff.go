package services

import "github.com/atterpac/ichi/internal/git"

type DiffService struct {
	state *State
}

func (s *DiffService) WorkingDiff() (string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return "", err
	}
	return repo.GetWorkingDiff()
}

func (s *DiffService) WorkingFileDiff(path string) (string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return "", err
	}
	return repo.GetWorkingFileDiff(path)
}

func (s *DiffService) StagedDiff() (string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return "", err
	}
	return repo.GetStagedDiff()
}

func (s *DiffService) StagedFileDiff(path string) (string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return "", err
	}
	return repo.GetStagedFileDiff(path)
}

func (s *DiffService) CommitDiff(hash string) (string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return "", err
	}
	return repo.GetCommitDiff(hash)
}

func (s *DiffService) FileDiff(hash, path string) (string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return "", err
	}
	return repo.GetFileDiff(hash, path)
}

func (s *DiffService) DiffBetween(from, to string) (string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return "", err
	}
	return repo.GetDiffBetween(from, to)
}

func (s *DiffService) DiffStats(from, to string) (string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return "", err
	}
	return repo.GetDiffStats(from, to)
}

func (s *DiffService) ParseDiff(raw string) ([]*git.FileDiff, error) {
	return git.ParseDiff(raw)
}

func (s *DiffService) StageHunk(path string, hunk *git.DiffHunk) error {
	return s.mutate(func(repo *git.Repository) error { return repo.StageHunk(path, hunk) })
}

func (s *DiffService) StageLines(path string, hunk *git.DiffHunk, lines []*git.DiffLine) error {
	return s.mutate(func(repo *git.Repository) error { return repo.StageLines(path, hunk, lines) })
}

func (s *DiffService) UnstageHunk(path string, hunk *git.DiffHunk) error {
	return s.mutate(func(repo *git.Repository) error { return repo.UnstageHunk(path, hunk) })
}

func (s *DiffService) UnstageLines(path string, hunk *git.DiffHunk, lines []*git.DiffLine) error {
	return s.mutate(func(repo *git.Repository) error { return repo.UnstageLines(path, hunk, lines) })
}

func (s *DiffService) DiscardHunk(path string, hunk *git.DiffHunk) error {
	return s.mutate(func(repo *git.Repository) error { return repo.DiscardHunk(path, hunk) })
}

func (s *DiffService) mutate(fn func(*git.Repository) error) error {
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
