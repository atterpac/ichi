package services

import "github.com/atterpac/ichi/internal/git"

type GraphService struct {
	state *State
}

func (s *GraphService) LoadGraph(limit int) (*git.Graph, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.LoadGraph(limit)
}

func (s *GraphService) LoadCommit(hash string) (*git.CommitDetail, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.LoadCommit(hash)
}

func (s *GraphService) SearchCommits(query string, limit int) ([]*git.Commit, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.SearchCommits(query, limit)
}

func (s *GraphService) LoadGraphStashes() ([]*git.Commit, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.LoadStashes()
}

func (s *GraphService) GetCommitMessage(hash string) (string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return "", err
	}
	return repo.GetCommitMessage(hash)
}

func (s *GraphService) RenameCommit(hash, message string) error {
	repo, err := s.state.Repo()
	if err != nil {
		return err
	}
	err = repo.RenameCommit(hash, message)
	if err == nil {
		s.state.emitStatusChanged()
	}
	return err
}

func (s *GraphService) DropCommit(hash string) error {
	repo, err := s.state.Repo()
	if err != nil {
		return err
	}
	err = repo.DropCommit(hash)
	if err == nil {
		s.state.emitStatusChanged()
	}
	return err
}

func (s *GraphService) IsCommitPushed(hash string) (bool, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return false, err
	}
	return repo.IsCommitPushed(hash), nil
}
