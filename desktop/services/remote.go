package services

import "github.com/atterpac/ichi/internal/git"

type RemoteService struct {
	state *State
}

func (s *RemoteService) Fetch(remote string) error {
	return s.mutate("fetch", func(repo *git.Repository) error { return repo.Fetch(remote) })
}

func (s *RemoteService) FetchAll() error {
	return s.mutate("fetch", func(repo *git.Repository) error { return repo.FetchAll() })
}

func (s *RemoteService) Pull() error {
	return s.mutate("pull", func(repo *git.Repository) error { return repo.Pull() })
}

func (s *RemoteService) Push() error {
	return s.mutate("push", func(repo *git.Repository) error { return repo.Push() })
}

func (s *RemoteService) HasUpstream() (bool, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return false, err
	}
	return repo.HasUpstream(), nil
}

func (s *RemoteService) PushSetUpstream(remote, branch string) error {
	return s.mutate("push", func(repo *git.Repository) error { return repo.PushSetUpstream(remote, branch) })
}

func (s *RemoteService) mutate(op string, fn func(*git.Repository) error) error {
	repo, err := s.state.Repo()
	if err != nil {
		return err
	}
	s.state.Emit(EventProgress, map[string]any{"op": op, "phase": "start"})
	if err := fn(repo); err != nil {
		s.state.Emit(EventOperationErr, map[string]any{"op": op, "error": err.Error()})
		return err
	}
	s.state.Emit(EventProgress, map[string]any{"op": op, "phase": "done"})
	s.state.emitStatusChanged()
	return nil
}
