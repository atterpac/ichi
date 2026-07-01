package services

import "github.com/atterpac/ichi/internal/git"

type InspectService struct {
	state *State
}

func (s *InspectService) Blame(file string) ([]git.BlameLine, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.Blame(file)
}

func (s *InspectService) BlameAtCommit(file, hash string) ([]git.BlameLine, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.BlameAtCommit(file, hash)
}

func (s *InspectService) FileLog(file string, limit int) ([]git.FileLogEntry, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.FileLog(file, limit)
}

func (s *InspectService) FileContent(ref, file string) (string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return "", err
	}
	return repo.FileContent(ref, file)
}

func (s *InspectService) WorkingFileContent(file string) (string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return "", err
	}
	return repo.WorkingFileContent(file)
}
