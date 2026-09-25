package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os/exec"
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
func (s *GraphService) AuthorAvatarHashes(commits []string) (map[string]string, error) {
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
			result[parts[0]] = avatarEmailHash(parts[1])
		}
	}
	return result, nil
}
