package services

import (
	"context"

	"github.com/atterpac/ichi/internal/git"
)

type RefService struct {
	state *State
}

func (s *RefService) ListBranches(ctx context.Context) ([]git.Branch, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.ListBranches()
}

func (s *RefService) ListLocalBranches(ctx context.Context) ([]git.Branch, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.ListLocalBranches()
}

func (s *RefService) ListRemoteBranches(ctx context.Context) ([]git.Branch, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.ListRemoteBranches()
}

func (s *RefService) Checkout(ctx context.Context, ref string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.Checkout(ref) })
}

func (s *RefService) CheckoutBranch(ctx context.Context, branch string, create bool) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.CheckoutBranch(branch, create) })
}

func (s *RefService) CreateBranch(ctx context.Context, name string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.CreateBranch(name) })
}

func (s *RefService) CreateBranchAt(ctx context.Context, name, ref string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.CreateBranchAt(name, ref) })
}

func (s *RefService) DeleteBranch(ctx context.Context, name string, force bool) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.DeleteBranch(name, force) })
}

func (s *RefService) DeleteRemoteBranch(ctx context.Context, remote, branch string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.DeleteRemoteBranch(remote, branch) })
}

func (s *RefService) RenameBranch(ctx context.Context, oldName, newName string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.RenameBranch(oldName, newName) })
}

func (s *RefService) SetUpstream(ctx context.Context, local, remote string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.SetUpstream(local, remote) })
}

func (s *RefService) MergeBranch(ctx context.Context, branch string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.MergeBranch(branch) })
}

func (s *RefService) RebaseBranch(ctx context.Context, onto string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.RebaseBranch(onto) })
}

func (s *RefService) ListTags(ctx context.Context) ([]git.Tag, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.ListTags()
}

func (s *RefService) CreateTag(ctx context.Context, name, ref, message string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.CreateTag(name, ref, message) })
}

func (s *RefService) DeleteTag(ctx context.Context, name string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.DeleteTag(name) })
}

func (s *RefService) PushTag(ctx context.Context, remote, tag string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.PushTag(remote, tag) })
}

func (s *RefService) CherryPick(ctx context.Context, hash string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.CherryPick(hash) })
}

func (s *RefService) Revert(ctx context.Context, hash string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.Revert(hash) })
}

func (s *RefService) ResetSoft(ctx context.Context, ref string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.ResetSoft(ref) })
}

func (s *RefService) ResetMixed(ctx context.Context, ref string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.ResetMixed(ref) })
}

func (s *RefService) ResetHard(ctx context.Context, ref string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.ResetHard(ref) })
}

func (s *RefService) BranchDivergence(ctx context.Context, a, b string) (*git.Divergence, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.BranchDivergence(a, b)
}

func (s *RefService) LogRef(ctx context.Context, ref string, limit int) ([]git.RefCommit, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.LogRef(ref, limit)
}

func (s *RefService) DiffFiles(ctx context.Context, a, b string) ([]git.FileChurn, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.DiffFiles(a, b)
}
