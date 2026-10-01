package services

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/atterpac/ichi/internal/config"
	"github.com/atterpac/ichi/internal/git"
)

type RepoInfo struct {
	worktree       *git.WorktreeSummary // Shared with Summary; never serialized into Info.
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

func (s *RepoService) Open(ctx context.Context, path string) (*RepoInfo, error) {
	s.state.conflictMu.Lock()
	defer s.state.conflictMu.Unlock()
	path = strings.TrimSpace(path)
	if path == "" {
		return nil, fmt.Errorf("choose a repository folder")
	}
	if path == "~" || strings.HasPrefix(path, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, err
		}
		if path == "~" {
			path = home
		} else {
			path = filepath.Join(home, strings.TrimPrefix(path, "~/"))
		}
	}
	// Raw discovery precedes Repository construction and profile selection.
	discovery := exec.CommandContext(ctx, "git", "-C", path, "rev-parse", "--show-toplevel")
	discovery.WaitDelay = time.Second
	root, err := discovery.Output()
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("not a Git working tree: %s", path)
	}
	repo, err := git.OpenRepositoryContext(ctx, strings.TrimSpace(string(root)))
	if err != nil {
		return nil, err
	}
	candidate, err := s.state.configuredRepoContext(ctx, repo)
	if err != nil {
		return nil, err
	}
	// Finish the read before publishing: a failed snapshot must never leave the
	// backend targeting a repository the frontend failed to open.
	info, err := loadRepoInfo(candidate.WithContext(ctx))
	if err != nil {
		return nil, err
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	s.state.SetRepo(repo)
	rememberRepository(repo.Path())
	return info, nil
}

func (s *RepoService) SetPath(ctx context.Context, path string) (*RepoInfo, error) {
	return s.Open(ctx, path)
}

func (s *RepoService) Info(ctx context.Context) (*RepoInfo, error) {
	return s.state.infoReads.readContext(ctx, s.loadInfo)
}

func (s *RepoService) loadInfo(ctx context.Context) (*RepoInfo, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return loadRepoInfo(repo)
}

func loadRepoInfo(repo *git.Repository) (*RepoInfo, error) {
	snapshot, err := repo.LoadRepositorySnapshot()
	if err != nil {
		return nil, err
	}
	staged, unstaged := snapshot.Worktree.ChangeCounts()
	info := &RepoInfo{
		worktree: snapshot.Worktree,
		Path:     repo.Path(), Name: filepath.Base(repo.Path()), Branch: snapshot.Branch,
		Head: snapshot.Head, ShortHead: snapshot.ShortHead, DetachedHead: snapshot.DetachedHead,
		HasUpstream: snapshot.HasUpstream, HasUncommitted: len(snapshot.Worktree.Entries) > 0,
		Ahead: snapshot.Ahead, Behind: snapshot.Behind, Staged: staged, Unstaged: unstaged,
		StashCount: snapshot.StashCount, Remotes: make([]RemoteInfo, 0, len(snapshot.Remotes)),
	}
	for _, remote := range snapshot.Remotes {
		info.Remotes = append(info.Remotes, RemoteInfo{Name: remote.Name, URL: remote.URL})
	}
	return info, nil
}

func (s *RepoService) ListSavedRepos() []config.Repo {
	return config.GetRepos()
}

func (s *RepoService) SaveRepo(oldName string, repo config.Repo) error {
	return config.SaveRepo(oldName, repo)
}

func (s *RepoService) DeleteRepo(name string) error {
	return config.DeleteRepo(name)
}

func (s *RepoService) ListRemotes() ([]string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.ReadRemoteNames()
}

func (s *RepoService) RemoteURL(name string) (string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return "", err
	}
	return repo.ReadRemoteURL(name)
}
