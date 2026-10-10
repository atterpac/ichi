package services

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
	"time"
)

type ContributorCommit struct {
	Hash    string
	Message string
	Date    string
	URL     string
}

var contributorLogin = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9-]*(?:\[bot\])?$`)

// ContributorCommits reads GitHub-linked authorship on the remote default branch.
func (s *PRService) ContributorCommits(ctx context.Context, remoteName, login string, limit int) ([]ContributorCommit, error) {
	if !contributorLogin.MatchString(login) {
		return nil, fmt.Errorf("invalid GitHub login")
	}
	if limit < 1 || limit > 100 {
		limit = 30
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	provider, repo, _, err := s.provider(ctx, remoteName)
	if err != nil {
		return nil, err
	}
	if provider.Name() != "github" {
		return nil, fmt.Errorf("contributor history requires GitHub")
	}
	output, err := exec.CommandContext(ctx, "gh", "api", "--hostname", "github.com", "--method", "GET", "repos/"+repo+"/commits", "-f", "author="+login, "-f", fmt.Sprintf("per_page=%d", limit)).Output()
	if err != nil {
		return nil, fmt.Errorf("could not load GitHub commit history: %w", err)
	}
	var values []struct {
		SHA    string `json:"sha"`
		URL    string `json:"html_url"`
		Commit struct {
			Message string `json:"message"`
			Author  struct {
				Date string `json:"date"`
			} `json:"author"`
		} `json:"commit"`
	}
	if err := json.Unmarshal(output, &values); err != nil {
		return nil, err
	}
	result := make([]ContributorCommit, 0, len(values))
	for _, value := range values {
		result = append(result, ContributorCommit{value.SHA, value.Commit.Message, value.Commit.Author.Date, value.URL})
	}
	return result, nil
}

// ContributorLogin resolves GitHub's author attribution for a specific commit.
func (s *PRService) ContributorLogin(ctx context.Context, remoteName, hash string) (string, error) {
	if !regexp.MustCompile(`^(?:[a-f0-9]{40}|[a-f0-9]{64})$`).MatchString(hash) {
		return "", fmt.Errorf("invalid commit hash")
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	provider, repo, _, err := s.provider(ctx, remoteName)
	if err != nil {
		return "", err
	}
	if provider.Name() != "github" {
		return "", nil
	}
	output, err := exec.CommandContext(ctx, "gh", "api", "--hostname", "github.com", "repos/"+repo+"/commits/"+hash).Output()
	if err != nil {
		return "", fmt.Errorf("GitHub identity unavailable: %w", err)
	}
	var value struct {
		Author *struct {
			Login string `json:"login"`
		} `json:"author"`
	}
	if err := json.Unmarshal(output, &value); err != nil {
		return "", err
	}
	if value.Author == nil || !contributorLogin.MatchString(value.Author.Login) {
		return "", nil
	}
	return value.Author.Login, nil
}
