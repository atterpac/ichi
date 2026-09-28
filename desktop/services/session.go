package services

import (
	"encoding/json"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/atterpac/ichi/internal/git"
)

type desktopSession struct {
	LastRepository string `json:"lastRepository"`
}

func sessionPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "ichi", "desktop-session.json"), nil
}

func openWorkingTree(path string) (*git.Repository, error) {
	root, err := exec.Command("git", "-C", path, "rev-parse", "--show-toplevel").Output()
	if err != nil {
		return nil, err
	}
	return git.OpenRepository(strings.TrimSpace(string(root)))
}

// OpenStartupRepository restores the last active worktree before views load.
// Missing or invalid session data falls back to the launch directory.
func OpenStartupRepository(fallback string) (*git.Repository, error) {
	if path, err := sessionPath(); err == nil {
		if data, err := os.ReadFile(path); err == nil {
			var session desktopSession
			if json.Unmarshal(data, &session) == nil && session.LastRepository != "" {
				if repo, err := openWorkingTree(session.LastRepository); err == nil {
					return repo, nil
				}
			}
		}
	}
	repo, err := openWorkingTree(fallback)
	if err == nil {
		rememberRepository(repo.Path())
	}
	return repo, err
}

func rememberRepository(repoPath string) {
	if err := saveSession(desktopSession{LastRepository: repoPath}); err != nil {
		log.Printf("could not remember active repository: %v", err)
	}
}

func saveSession(session desktopSession) error {
	path, err := sessionPath()
	if err != nil {
		return err
	}
	data, err := json.Marshal(session)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".session-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err := file.Write(data); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}
