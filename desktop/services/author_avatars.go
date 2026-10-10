package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

func avatarEmailHash(email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return ""
	}
	digest := sha256.Sum256([]byte(email))
	return hex.EncodeToString(digest[:])
}

// AuthorAvatarHashes reads attribution only when author avatars are enabled.
// The client receives Gravatar identifiers, not raw author email addresses.
func (s *GraphService) authorAvatarEmails(commits []string) (map[string]string, error) {
	result := make(map[string]string)
	if len(commits) == 0 {
		return result, nil
	}
	if len(commits) > 256 {
		return nil, fmt.Errorf("too many avatar lookups")
	}
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	args := []string{"-C", repo.Path(), "show", "--no-patch", "--format=%H%x00%ae"}
	for _, commit := range commits {
		if len(commit) != 40 && len(commit) != 64 {
			return nil, fmt.Errorf("invalid commit hash")
		}
		if _, err := hex.DecodeString(commit); err != nil {
			return nil, fmt.Errorf("invalid commit hash")
		}
		args = append(args, commit)
	}
	args = append(args, "--")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, "git", args...).Output()
	if err != nil {
		return nil, err
	}
	for _, line := range strings.Split(string(output), "\n") {
		parts := strings.SplitN(line, "\x00", 2)
		if len(parts) == 2 {
			result[parts[0]] = strings.TrimSpace(parts[1])
		}
	}
	return result, nil
}

// AuthorAvatarHashes retains the original Gravatar-only interface.
func (s *GraphService) AuthorAvatarHashes(commits []string) (map[string]string, error) {
	emails, err := s.authorAvatarEmails(commits)
	if err != nil {
		return nil, err
	}
	for commit, email := range emails {
		emails[commit] = avatarEmailHash(email)
	}
	return emails, nil
}

var githubPrivateEmail = regexp.MustCompile(`(?i)^(?:([0-9]+)\+)?([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\[bot\])?)@users\.noreply\.github\.com$`)

func authorAvatarURL(email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	if match := githubPrivateEmail.FindStringSubmatch(email); match != nil {
		if match[1] != "" {
			return "https://avatars.githubusercontent.com/u/" + match[1] + "?s=64"
		}
		if !strings.HasSuffix(match[2], "[bot]") {
			return "https://avatars.githubusercontent.com/" + match[2] + "?s=64"
		}
	}
	hash := avatarEmailHash(email)
	if hash == "" {
		return ""
	}
	return "https://www.gravatar.com/avatar/" + hash + "?s=64&d=404&r=g"
}

// AuthorAvatarURLs resolves private GitHub identities without exposing email
// addresses or requiring a GitHub API call for each commit.
func (s *GraphService) AuthorAvatarURLs(commits []string) (map[string]string, error) {
	emails, err := s.authorAvatarEmails(commits)
	if err != nil {
		return nil, err
	}
	for commit, email := range emails {
		emails[commit] = authorAvatarURL(email)
	}
	return emails, nil
}
