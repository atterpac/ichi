package services

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// GitProfile describes identity settings, never credentials or private key material.
type GitProfile struct {
	ID             string
	Label          string
	Name           string
	Email          string
	SigningKey     string
	SigningEnabled string
	SigningFormat  string
	Source         string
}
type GitProfileCatalog struct {
	Profiles []GitProfile
	Warnings []string
}

var identityKeys = []string{"user.name", "user.email", "user.signingkey", "commit.gpgsign", "tag.gpgsign", "gpg.format"}

func profilePath(path, base string) (string, error) {
	if strings.HasPrefix(path, "~/") || path == "~" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		if path == "~" {
			path = home
		} else {
			path = filepath.Join(home, path[2:])
		}
	}
	if !filepath.IsAbs(path) {
		path = filepath.Join(base, path)
	}
	return filepath.Abs(path)
}
func readProfileConfig(args ...string) (map[string]string, []string, error) {
	out, err := exec.Command("git", append([]string{"config", "--no-includes", "--null", "--list"}, args...)...).Output()
	if err != nil {
		return nil, nil, fmt.Errorf("cannot read Git identity config: %w", err)
	}
	values := map[string]string{}
	includes := []string{}
	for _, record := range strings.Split(string(out), "\x00") {
		key, value, ok := strings.Cut(record, "\n")
		if !ok {
			continue
		}
		lower := strings.ToLower(key)
		for _, allowed := range identityKeys {
			if lower == allowed {
				values[allowed] = value
			}
		}
		if lower == "include.path" || strings.HasPrefix(lower, "includeif.") && strings.HasSuffix(lower, ".path") {
			includes = append(includes, value)
		}
	}
	return values, includes, nil
}
func globalProfileConfig() (map[string]string, error) {
	values, _, err := readProfileConfig("--global")
	if err != nil {
		return map[string]string{}, nil
	} // A missing global file is valid.
	return values, nil
}
func profileValues(id string) (map[string]string, error) {
	base, _ := globalProfileConfig()
	if id != "global" {
		own, _, err := readProfileConfig("--file", id)
		if err != nil {
			return nil, fmt.Errorf("profile %s is unavailable: %w", id, err)
		}
		for key, value := range own {
			base[key] = value
		}
	}
	if strings.TrimSpace(base["user.name"]) == "" || strings.TrimSpace(base["user.email"]) == "" {
		return nil, fmt.Errorf("profile needs both a user.name and user.email")
	}
	// An explicit identity must not inherit another repository's signing key.
	if _, ok := base["user.signingkey"]; !ok {
		base["user.signingkey"] = ""
	}
	if _, ok := base["commit.gpgsign"]; !ok {
		base["commit.gpgsign"] = "false"
	}
	if _, ok := base["tag.gpgsign"]; !ok {
		base["tag.gpgsign"] = "false"
	}
	if _, ok := base["gpg.format"]; !ok {
		base["gpg.format"] = "openpgp"
	}
	base["author.name"], base["committer.name"] = base["user.name"], base["user.name"]
	base["author.email"], base["committer.email"] = base["user.email"], base["user.email"]
	return base, nil
}
func (s *RepoService) ListGitProfiles(extraFiles []string) GitProfileCatalog {
	catalog := GitProfileCatalog{Profiles: []GitProfile{}, Warnings: []string{}}
	add := func(id, label, source string) {
		values, err := profileValues(id)
		if err != nil {
			catalog.Warnings = append(catalog.Warnings, source+": "+err.Error())
			return
		}
		catalog.Profiles = append(catalog.Profiles, GitProfile{ID: id, Label: label, Source: source, Name: values["user.name"], Email: values["user.email"], SigningKey: values["user.signingkey"], SigningEnabled: values["commit.gpgsign"], SigningFormat: values["gpg.format"]})
	}
	if values, _ := globalProfileConfig(); values["user.name"] != "" && values["user.email"] != "" {
		add("global", "Global Git identity", "Global Git config")
	}
	home, _ := os.UserHomeDir()
	configHome := os.Getenv("XDG_CONFIG_HOME")
	if configHome == "" {
		configHome = filepath.Join(home, ".config")
	}
	roots := []string{filepath.Join(configHome, "git", "config"), filepath.Join(home, ".gitconfig")}
	if global := os.Getenv("GIT_CONFIG_GLOBAL"); global != "" {
		roots = []string{global}
	}
	seen := map[string]bool{}
	var visit func(string, bool, int)
	visit = func(path string, root bool, depth int) {
		if depth > 16 {
			catalog.Warnings = append(catalog.Warnings, "Git config include nesting exceeds 16 files")
			return
		}
		path, err := profilePath(path, home)
		if err != nil || seen[path] {
			return
		}
		seen[path] = true
		values, includes, err := readProfileConfig("--file", path)
		if err != nil {
			if !root {
				catalog.Warnings = append(catalog.Warnings, path+": "+err.Error())
			}
			return
		}
		if !root && (values["user.name"] != "" || values["user.email"] != "") {
			add(path, filepath.Base(path), path)
		}
		for _, include := range includes {
			expanded, err := profilePath(include, filepath.Dir(path))
			if err != nil {
				continue
			}
			visit(expanded, false, depth+1)
		}
	}
	for _, root := range roots {
		visit(root, true, 0)
	}
	for _, path := range extraFiles {
		visit(path, false, 0)
	}
	return catalog
}

func profilesStoragePath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "ichi", "desktop-profiles.json"), nil
}
func loadProfileAssignments() (map[string]string, error) {
	path, err := profilesStoragePath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return map[string]string{}, nil
	}
	if err != nil {
		return nil, err
	}
	assignments := map[string]string{}
	if err := json.Unmarshal(data, &assignments); err != nil {
		return nil, err
	}
	return assignments, nil
}

// SyncWorkspaceProfiles persists the repo-to-profile projection. It never edits
// .gitconfig or .git/config, and rejects unavailable identities before saving.
func (s *RepoService) SyncWorkspaceProfiles(assignments map[string]string) error {
	s.state.profileSync.Lock()
	defer s.state.profileSync.Unlock()
	next := map[string]string{}
	for path, id := range assignments {
		if id == "" {
			continue
		}
		absolute, err := profilePath(path, "")
		if err != nil {
			return err
		}
		if id != "global" {
			id, err = profilePath(id, "")
			if err != nil {
				return err
			}
		}
		if _, err := profileValues(id); err != nil {
			return err
		}
		// Match the same worktree root that Open uses, including saved subfolders.
		if root, err := exec.Command("git", "-C", absolute, "rev-parse", "--show-toplevel").Output(); err == nil {
			absolute = strings.TrimSpace(string(root))
		}
		if previous, ok := next[absolute]; ok && previous != id {
			return fmt.Errorf("repository %s is assigned conflicting workspace profiles", absolute)
		}
		next[absolute] = id
	}
	path, err := profilesStoragePath()
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(next, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".profiles-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		return err
	}
	s.state.mu.Lock()
	s.state.profiles = next
	s.state.profileError = nil
	s.state.mu.Unlock()
	s.state.Emit(EventRepoChanged, nil)
	return nil
}

// RepositoryProfile reports the effective identity and the selected source.
func (s *RepoService) RepositoryProfile() (*GitProfile, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	values := map[string]string{}
	// Read through the same configured command context used by Git operations.
	for _, key := range identityKeys {
		value, _ := repo.ConfigValue(key)
		values[key] = value
	}
	s.state.mu.RLock()
	id := s.state.profiles[repo.Path()]
	s.state.mu.RUnlock()
	label := "Repository defaults"
	if id == "global" {
		label = "Global Git identity"
	} else if id != "" {
		label = filepath.Base(id)
	}
	return &GitProfile{ID: id, Label: label, Source: id, Name: values["user.name"], Email: values["user.email"], SigningKey: values["user.signingkey"], SigningEnabled: values["commit.gpgsign"], SigningFormat: values["gpg.format"]}, nil
}
