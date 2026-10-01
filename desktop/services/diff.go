package services

import (
	"context"
	"fmt"

	"github.com/atterpac/ichi/internal/git"
)

type DiffService struct {
	state *State
}

// Diff reads return structured files. Patch text stays inside Go; all desktop
// consumers receive the same parsed representation in one bridge call.
func (s *DiffService) WorktreeFile(ctx context.Context, path, oldPath string, staged bool) (*git.FileDiff, error) {
	if path == "" {
		return nil, fmt.Errorf("a file path is required")
	}
	files, err := s.readDiff(ctx, func(repo *git.Repository) (string, error) {
		return repo.GetWorktreeFileDiff(path, oldPath, staged)
	})
	if err != nil {
		return nil, err
	}
	for _, file := range files {
		if file.Path == path {
			return file, nil
		}
	}
	return nil, nil
}

func (s *DiffService) FileDiff(ctx context.Context, hash, path string) ([]*git.FileDiff, error) {
	return s.readDiff(ctx, func(repo *git.Repository) (string, error) {
		return repo.GetFileDiff(hash, path)
	})
}

func (s *DiffService) DiffBetween(ctx context.Context, from, to string) ([]*git.FileDiff, error) {
	return s.readDiff(ctx, func(repo *git.Repository) (string, error) {
		return repo.GetDiffBetween(from, to)
	})
}

// DiffBetweenFile returns only the selected file. An empty oldPath lets Git
// discover the rename source from the comparison's summary, without reading
// unrelated patches into the desktop process or bridge payload.
func (s *DiffService) DiffBetweenFile(ctx context.Context, from, to, path, oldPath string) (*git.FileDiff, error) {
	if path == "" {
		return nil, fmt.Errorf("a file path is required")
	}
	files, err := s.readDiff(ctx, func(repo *git.Repository) (string, error) {
		return repo.GetDiffBetweenFile(from, to, path, oldPath)
	})
	if err != nil {
		return nil, err
	}
	for _, file := range files {
		if file.Path == path {
			return file, nil
		}
	}
	return nil, nil
}

func (s *DiffService) readDiff(ctx context.Context, read func(*git.Repository) (string, error)) ([]*git.FileDiff, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	raw, err := read(repo.WithReadLimit(4<<20, 20000))
	if err != nil {
		return nil, err
	}
	return git.ParseDiff(raw)
}

func (s *DiffService) StageHunk(ctx context.Context, path string, hunk *git.DiffHunk) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.StageHunk(path, hunk) })
}

func (s *DiffService) StageLines(ctx context.Context, path string, hunk *git.DiffHunk, lines []*git.DiffLine) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.StageLines(path, hunk, lines) })
}

func (s *DiffService) ApplyHunkEdit(ctx context.Context, path string, hunk *git.DiffHunk, replacement []string) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.ApplyHunkEdit(path, hunk, replacement) })
}

func (s *DiffService) UnstageHunk(ctx context.Context, path string, hunk *git.DiffHunk) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.UnstageHunk(path, hunk) })
}

func (s *DiffService) UnstageLines(ctx context.Context, path string, hunk *git.DiffHunk, lines []*git.DiffLine) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.UnstageLines(path, hunk, lines) })
}

func (s *DiffService) DiscardHunk(ctx context.Context, path string, hunk *git.DiffHunk) error {
	return s.state.mutate(ctx, "", func(repo *git.Repository) error { return repo.DiscardHunk(path, hunk) })
}
