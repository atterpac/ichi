package services

import "github.com/atterpac/ichi/internal/git"

type RefService struct {
	state *State
}

func (s *RefService) ListBranches() ([]git.Branch, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.ListBranches()
}

func (s *RefService) ListLocalBranches() ([]git.Branch, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.ListLocalBranches()
}

func (s *RefService) ListRemoteBranches() ([]git.Branch, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.ListRemoteBranches()
}

func (s *RefService) Checkout(ref string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.Checkout(ref) })
}

func (s *RefService) CheckoutBranch(branch string, create bool) error {
	return s.mutate(func(repo *git.Repository) error { return repo.CheckoutBranch(branch, create) })
}

func (s *RefService) CreateBranch(name string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.CreateBranch(name) })
}

func (s *RefService) CreateBranchAt(name, ref string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.CreateBranchAt(name, ref) })
}

func (s *RefService) DeleteBranch(name string, force bool) error {
	return s.mutate(func(repo *git.Repository) error { return repo.DeleteBranch(name, force) })
}

func (s *RefService) DeleteRemoteBranch(remote, branch string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.DeleteRemoteBranch(remote, branch) })
}

func (s *RefService) RenameBranch(oldName, newName string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.RenameBranch(oldName, newName) })
}

func (s *RefService) SetUpstream(local, remote string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.SetUpstream(local, remote) })
}

func (s *RefService) MergeBranch(branch string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.MergeBranch(branch) })
}

func (s *RefService) RebaseBranch(onto string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.RebaseBranch(onto) })
}

func (s *RefService) ListTags() ([]git.Tag, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.ListTags()
}

func (s *RefService) CreateTag(name, ref, message string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.CreateTag(name, ref, message) })
}

func (s *RefService) DeleteTag(name string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.DeleteTag(name) })
}

func (s *RefService) PushTag(remote, tag string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.PushTag(remote, tag) })
}

func (s *RefService) CherryPick(hash string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.CherryPick(hash) })
}

func (s *RefService) Revert(hash string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.Revert(hash) })
}

func (s *RefService) ResetSoft(ref string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.ResetSoft(ref) })
}

func (s *RefService) ResetHard(ref string) error {
	return s.mutate(func(repo *git.Repository) error { return repo.ResetHard(ref) })
}

func (s *RefService) mutate(fn func(*git.Repository) error) error {
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
