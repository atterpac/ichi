package services

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/atterpac/ichi/internal/git"
)

type WorktreeService struct {
	state *State
}

type WorktreeSnapshot struct {
	Info    *RepoInfo
	Summary *git.WorktreeSummary
}

func (s *WorktreeService) Summary(ctx context.Context) (*WorktreeSnapshot, error) {
	info, err := (&RepoService{state: s.state}).Info(ctx)
	if err != nil {
		return nil, err
	}
	return &WorktreeSnapshot{Info: info, Summary: info.worktree}, nil
}

func (s *WorktreeService) Status(ctx context.Context) ([]git.StatusEntry, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.Status()
}

func (s *WorktreeService) StagedFiles(ctx context.Context) ([]git.StatusEntry, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.StagedFiles()
}

func (s *WorktreeService) UnstagedFiles(ctx context.Context) ([]git.StatusEntry, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.UnstagedFiles()
}

func (s *WorktreeService) UntrackedFiles(ctx context.Context) ([]git.StatusEntry, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.UntrackedFiles()
}

func (s *WorktreeService) StageFiles(ctx context.Context, paths []string) error {
	return s.mutatePaths(ctx, paths, (*git.Repository).StageFiles)
}

func (s *WorktreeService) StageAll(ctx context.Context) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.StageAll() })
}

func (s *WorktreeService) UnstageFiles(ctx context.Context, paths []string) error {
	return s.mutatePaths(ctx, paths, (*git.Repository).UnstageFiles)
}

func (s *WorktreeService) UnstageAll(ctx context.Context) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.UnstageAll() })
}

// DiscardResult reports partial completion without losing it in a bridge error.
// Processing stops on the first failure; Remaining paths were not attempted.
type DiscardResult struct {
	Completed  []string
	FailedPath string
	Error      string
	Remaining  []string
}

func (s *WorktreeService) DiscardFiles(ctx context.Context, paths []string) (*DiscardResult, error) {
	result := &DiscardResult{Completed: []string{}, Remaining: []string{}}
	if len(paths) == 0 {
		return result, nil
	}
	err := s.state.mutate(ctx, "", func(repo *git.Repository) error {
		// Normalize only for duplicate detection. Each original path still passes
		// individual-file validation immediately before its operation.
		unique := make([]string, 0, len(paths))
		seen := map[string]bool{}
		for _, path := range paths {
			key := filepath.Clean(path)
			if !seen[key] {
				seen[key] = true
				unique = append(unique, path)
			}
		}
		for i, path := range unique {
			if err := discardWorktreeFile(ctx, repo, path); err != nil {
				result.FailedPath = path
				result.Error = err.Error()
				result.Remaining = unique[i+1:]
				return nil
			}
			result.Completed = append(result.Completed, path)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (s *WorktreeService) Commit(ctx context.Context, message string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.Commit(message) })
}

func (s *WorktreeService) CommitAmend(ctx context.Context, message string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.CommitAmend(message) })
}

// discardWorktreeFile handles one literal path. A batch invokes this for
// each displayed descendant, never as a recursive directory-wide clean.
func discardWorktreeFile(ctx context.Context, repo *git.Repository, path string) error {
	if strings.ContainsRune(path, 0) || !filepath.IsLocal(path) || filepath.Clean(path) == "." {
		return fmt.Errorf("discard requires a file path inside the worktree")
	}
	path = filepath.ToSlash(filepath.Clean(path))
	if containsGitMetadata(filepath.FromSlash(path)) {
		return fmt.Errorf("cannot discard Git metadata")
	}
	info, err := os.Lstat(filepath.Join(repo.Path(), path))
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	if err == nil && info.IsDir() {
		return fmt.Errorf("discard requires an individual file, not a directory")
	}
	run := func(args ...string) ([]byte, error) {
		args = append([]string{"--literal-pathspecs"}, args...)
		out, err := repo.CommandContext(ctx, args...).CombinedOutput()
		if err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
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

// Refresh readers once after any attempted batch, including errors: Git filters
// and concurrent external updates may have changed observable state.
func (s *WorktreeService) mutatePaths(ctx context.Context, paths []string, fn func(*git.Repository, []string) error) error {
	if len(paths) == 0 {
		return nil
	}
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return fn(repo, paths) })
}
