package services

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/atterpac/ichi/internal/git"
)

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
	return s.mutate(func(repo *git.Repository) error { return discardWorktreeFile(repo.Path(), path) })
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

// discardWorktreeFile handles one literal path. A folded group invokes this for
// each displayed descendant, never as a recursive directory-wide clean.
func discardWorktreeFile(root, path string) error {
	if !filepath.IsLocal(path) || filepath.Clean(path) == "." {
		return fmt.Errorf("discard requires a file path inside the worktree")
	}
	path = filepath.ToSlash(filepath.Clean(path))
	if path == ".git" || strings.HasPrefix(path, ".git/") {
		return fmt.Errorf("cannot discard Git metadata")
	}
	info, err := os.Lstat(filepath.Join(root, path))
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	if err == nil && info.IsDir() {
		return fmt.Errorf("discard requires an individual file, not a directory")
	}
	run := func(args ...string) ([]byte, error) {
		args = append([]string{"-C", root, "--literal-pathspecs"}, args...)
		out, err := exec.Command("git", args...).CombinedOutput()
		if err != nil {
			return nil, fmt.Errorf("discard %s: %w: %s", path, err, strings.TrimSpace(string(out)))
		}
		return out, nil
	}
	// -z preserves spaces, newlines and quotes without porcelain path escaping.
	status, err := run("status", "--porcelain=v1", "-z", "--untracked-files=all", "--", path)
	if err != nil {
		return err
	}
	if string(status) == "?? "+path+"\x00" {
		// Git clean rechecks the index and respects ignores. Do not use -d, -x or
		// recursive filesystem removal: siblings and newly tracked files stay safe.
		_, err = run("clean", "-f", "--", path)
	} else {
		// Restore from the index, preserving any staged version of this file.
		_, err = run("checkout", "--", path)
	}
	return err
}
