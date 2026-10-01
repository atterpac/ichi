package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// GitProfile describes identity settings, never credentials or private key material.
type GitProfile struct {
	ID                string
	Label             string
	Name              string
	Email             string
	SigningKey        string
	SigningEnabled    string
	TagSigningEnabled string
	SigningFormat     string
	Source            string
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

// readProfileConfig deliberately reads raw source configuration: inherited
// workspace overrides would hide the defaults/profile contents being edited.
func readProfileConfig(args ...string) (map[string]string, []string, error) {
	return readProfileConfigContext(context.Background(), args...)
}
func readProfileConfigContext(ctx context.Context, args ...string) (map[string]string, []string, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "git", append([]string{"config", "--no-includes", "--null", "--list"}, args...)...).Output()
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
		if lower == "ichi.profilelabel" {
			values[lower] = value
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
	return profileValuesContext(context.Background(), id)
}
func profileValuesContext(ctx context.Context, id string) (map[string]string, error) {
	base, _, err := readProfileConfigContext(ctx, "--global")
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	if err != nil {
		base = map[string]string{}
	}
	if id != "global" {
		own, _, err := readProfileConfigContext(ctx, "--file", id)
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
		if values["ichi.profilelabel"] != "" && id != "global" {
			label = values["ichi.profilelabel"]
		}
		catalog.Profiles = append(catalog.Profiles, GitProfile{ID: id, Label: label, Source: source, Name: values["user.name"], Email: values["user.email"], SigningKey: values["user.signingkey"], SigningEnabled: values["commit.gpgsign"], TagSigningEnabled: values["tag.gpgsign"], SigningFormat: values["gpg.format"]})
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
	managedHome, _ := os.UserConfigDir()
	managed, _ := filepath.Glob(filepath.Join(managedHome, "ichi", "profiles", "*.gitconfig"))
	extraFiles = append(extraFiles, managed...)
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

// SyncWorkspaceProfiles applies workspace identities to native repository Git
// configuration and persists assignments. Removing an assignment restores defaults.
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
	s.state.mu.RLock()
	previous := s.state.profiles
	s.state.mu.RUnlock()
	rollback, err := applyNativeProfiles(previous, next)
	if err != nil {
		return err
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		return errors.Join(err, rollback())
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
		if profile, err := profileValues(id); err == nil && profile["ichi.profilelabel"] != "" {
			label = profile["ichi.profilelabel"]
		}
	}
	return &GitProfile{ID: id, Label: label, Source: id, Name: values["user.name"], Email: values["user.email"], SigningKey: values["user.signingkey"], SigningEnabled: values["commit.gpgsign"], TagSigningEnabled: values["tag.gpgsign"], SigningFormat: values["gpg.format"]}, nil
}

// SaveGitProfile edits an identity file, preserving its unrelated Git settings.
// Empty ID creates a managed file; global identities can be duplicated instead.
func (s *RepoService) SaveGitProfile(profile GitProfile) (*GitProfile, error) {
	s.state.profileSync.Lock()
	defer s.state.profileSync.Unlock()
	profile.Label = strings.TrimSpace(profile.Label)
	profile.Name = strings.TrimSpace(profile.Name)
	profile.Email = strings.TrimSpace(profile.Email)
	if profile.Label == "" || profile.Name == "" || profile.Email == "" {
		return nil, fmt.Errorf("profile needs a label, name, and email")
	}
	for _, v := range []string{profile.Label, profile.Name, profile.Email, profile.SigningKey} {
		if strings.ContainsAny(v, "\x00\r\n") {
			return nil, fmt.Errorf("profile fields must be single-line values")
		}
	}
	if profile.SigningFormat != "openpgp" && profile.SigningFormat != "ssh" && profile.SigningFormat != "x509" {
		return nil, fmt.Errorf("choose a valid signing format")
	}
	for _, v := range []string{profile.SigningEnabled, profile.TagSigningEnabled} {
		if v != "true" && v != "false" {
			return nil, fmt.Errorf("choose whether signing is enabled")
		}
	}
	if (profile.SigningEnabled == "true" || profile.TagSigningEnabled == "true") && strings.TrimSpace(profile.SigningKey) == "" {
		return nil, fmt.Errorf("enter a signing key when signing is enabled")
	}
	if profile.ID == "global" {
		return nil, fmt.Errorf("duplicate the global identity to create an editable workspace profile")
	}
	created := profile.ID == ""
	if created {
		dir, err := os.UserConfigDir()
		if err != nil {
			return nil, err
		}
		dir = filepath.Join(dir, "ichi", "profiles")
		if err := os.MkdirAll(dir, 0700); err != nil {
			return nil, err
		}
		f, err := os.CreateTemp(dir, "profile-*.gitconfig")
		if err != nil {
			return nil, err
		}
		profile.ID = f.Name()
		f.Close()
	} else {
		path, err := profilePath(profile.ID, "")
		if err != nil {
			return nil, err
		}
		profile.ID = path
		info, err := os.Lstat(path)
		if err != nil {
			return nil, err
		}
		if !info.Mode().IsRegular() {
			return nil, fmt.Errorf("profile must be a regular file")
		}
	}
	success := false
	defer func() {
		if created && !success {
			os.Remove(profile.ID)
		}
	}()
	c, err := lockConfig(profile.ID)
	if err != nil {
		return nil, err
	}
	defer c.release()
	values := map[string]string{"ichi.profilelabel": profile.Label, "user.name": profile.Name, "user.email": profile.Email, "user.signingkey": profile.SigningKey, "commit.gpgsign": profile.SigningEnabled, "tag.gpgsign": profile.TagSigningEnabled, "gpg.format": profile.SigningFormat}
	c.next, err = configValuesBytes(c.original, values)
	if err != nil {
		return nil, err
	}
	if err = c.write(); err != nil {
		return nil, err
	}
	s.state.mu.RLock()
	assignments := s.state.profiles
	s.state.mu.RUnlock()
	// Only refresh repositories that actually use the edited profile.
	affected := map[string]string{}
	for repo, id := range assignments {
		if id == profile.ID {
			affected[repo] = id
		}
	}
	if _, err = applyNativeProfiles(affected, affected); err != nil {
		return nil, errors.Join(err, c.restore())
	}
	success = true
	profile.Source = profile.ID
	s.state.Emit(EventRepoChanged, nil)
	return &profile, nil
}
