package services

import (
	"path/filepath"

	"github.com/atterpac/ichi/internal/config"
	"github.com/atterpac/ichi/internal/git"
)

type RepoInfo struct {
	Path           string
	Name           string
	Branch         string
	Head           string
	ShortHead      string
	DetachedHead   bool
	HasUpstream    bool
	HasUncommitted bool
	Ahead          int
	Behind         int
	Staged         git.ChangeStats
	Unstaged       git.ChangeStats
	StashCount     int
	Remotes        []RemoteInfo
}

type RemoteInfo struct {
	Name string
	URL  string
}

type RepoService struct {
	state *State
}

func (s *RepoService) Open(path string) (*RepoInfo, error) {
	repo, err := git.OpenRepository(path)
	if err != nil {
		return nil, err
	}
	s.state.SetRepo(repo)
	return s.Info()
}

func (s *RepoService) SetPath(path string) (*RepoInfo, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	if err := repo.SetPath(path); err != nil {
		return nil, err
	}
	s.state.Emit(EventRepoChanged, nil)
	return s.Info()
}

func (s *RepoService) Info() (*RepoInfo, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	ahead, behind := repo.AheadBehind()
	staged, unstaged, stashCount := repo.StatusCounts()
	remotes := repo.ListRemotes()
	info := &RepoInfo{
		Path:           repo.Path(),
		Name:           filepath.Base(repo.Path()),
		Branch:         repo.CurrentBranch(),
		Head:           repo.HEAD(),
		ShortHead:      repo.ShortHEAD(),
		DetachedHead:   repo.IsDetachedHEAD(),
		HasUpstream:    repo.HasUpstream(),
		HasUncommitted: repo.HasUncommitted(),
		Ahead:          ahead,
		Behind:         behind,
		Staged:         staged,
		Unstaged:       unstaged,
		StashCount:     stashCount,
		Remotes:        make([]RemoteInfo, 0, len(remotes)),
	}
	for _, name := range remotes {
		info.Remotes = append(info.Remotes, RemoteInfo{Name: name, URL: repo.RemoteURL(name)})
	}
	return info, nil
}

func (s *RepoService) ListSavedRepos() []config.Repo {
	return config.GetRepos()
}

func (s *RepoService) SaveRepo(oldName string, repo config.Repo) {
	config.SaveRepo(oldName, repo)
}

func (s *RepoService) DeleteRepo(name string) {
	config.DeleteRepo(name)
}

func (s *RepoService) ListRemotes() ([]string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.ListRemotes(), nil
}

func (s *RepoService) RemoteURL(name string) (string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return "", err
	}
	return repo.RemoteURL(name), nil
}
