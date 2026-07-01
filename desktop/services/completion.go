package services

import "github.com/atterpac/ichi/internal/commands"

type CompletionService struct {
	state *State
}

func (s *CompletionService) CommandNames() []string {
	return commands.NamesWithAliases()
}

func (s *CompletionService) Complete(input string) ([]string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return commands.GetCompletions(repo, input), nil
}

func (s *CompletionService) Suggest(input string) (string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return "", err
	}
	return commands.GetSuggestion(repo, input), nil
}

func (s *CompletionService) ListFiles(prefix string) ([]string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.ListFiles(prefix), nil
}

func (s *CompletionService) ListBranchNames(prefix string) ([]string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.ListBranchNames(prefix), nil
}

func (s *CompletionService) ListTagNames(prefix string) ([]string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.ListTagNames(prefix), nil
}

func (s *CompletionService) ListRecentCommitHashes(prefix string, limit int) ([]string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.ListRecentCommitHashes(prefix, limit), nil
}

func (s *CompletionService) ListStashEntries(prefix string) ([]string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.ListStashEntries(prefix), nil
}

func (s *CompletionService) ListRemotes(prefix string) ([]string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return filterByPrefix(repo.ListRemotes(), prefix), nil
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
