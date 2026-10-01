package services

import (
	"context"

	"github.com/atterpac/ichi/internal/commands"
)

type CompletionService struct {
	state *State
}

func (s *CompletionService) CommandNames() []string {
	return commands.NamesWithAliases()
}

func (s *CompletionService) Complete(ctx context.Context, input string) ([]string, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	// The commands package deliberately provides best-effort suggestions.
	// A missing completion stays empty, but request cancellation remains an error.
	values := commands.GetCompletions(repo, input)
	return values, ctx.Err()
}

func (s *CompletionService) Suggest(ctx context.Context, input string) (string, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return "", err
	}
	value := commands.GetSuggestion(repo, input)
	return value, ctx.Err()
}

func (s *CompletionService) ListFiles(ctx context.Context, prefix string) ([]string, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.ReadFiles(prefix)
}

func (s *CompletionService) ListBranchNames(ctx context.Context, prefix string) ([]string, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.ReadBranchNames(prefix)
}

func (s *CompletionService) ListTagNames(ctx context.Context, prefix string) ([]string, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.ReadTagNames(prefix)
}

func (s *CompletionService) ListRecentCommitHashes(ctx context.Context, prefix string, limit int) ([]string, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.ReadRecentCommitHashes(prefix, limit)
}

func (s *CompletionService) ListStashEntries(ctx context.Context, prefix string) ([]string, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return repo.ReadStashEntries(prefix)
}

func (s *CompletionService) ListRemotes(ctx context.Context, prefix string) ([]string, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	names, err := repo.ReadRemoteNames()
	if err != nil {
		return nil, err
	}
	return filterByPrefix(names, prefix), nil
}

func filterByPrefix(items []string, prefix string) []string {
	if prefix == "" {
		return items
	}
	out := items[:0]
	for _, item := range items {
		if len(item) >= len(prefix) && item[:len(prefix)] == prefix {
			out = append(out, item)
		}
	}
	return out
}
