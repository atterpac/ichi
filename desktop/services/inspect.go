package services

import (
	"context"

	"github.com/atterpac/ichi/internal/git"
)

type InspectService struct {
	state *State
}

func (s *InspectService) Blame(ctx context.Context, file string) ([]git.BlameLine, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.WithReadLimit(16<<20, 100000).Blame(file)
}

func (s *InspectService) BlameAtCommit(ctx context.Context, file, hash string) ([]git.BlameLine, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.WithReadLimit(16<<20, 100000).BlameAtCommit(file, hash)
}

func (s *InspectService) FileLog(ctx context.Context, file string, limit int) ([]git.FileLogEntry, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.FileLog(file, limit)
}

func (s *InspectService) FileContent(ctx context.Context, ref, file string) (string, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return "", err
	}
	return repo.WithReadLimit(1<<20, 20000).FileContent(ref, file)
}

func (s *InspectService) WorkingFileContent(ctx context.Context, file string) (string, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return "", err
	}
	return repo.WorkingFileContent(file)
}

// IndexFileContent reads the staged document, without falling back to disk.
func (s *InspectService) IndexFileContent(ctx context.Context, file string) (string, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return "", err
	}
	return repo.WithReadLimit(1<<20, 20000).IndexFileContent(file)
}

// WorkingFilePreview is bounded to 64 KiB and 400 lines before the bridge.
func (s *InspectService) WorkingFilePreview(ctx context.Context, file string) (*git.FilePreview, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.WorkingFilePreview(file)
}
