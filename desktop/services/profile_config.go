package services

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

const profileBlockStart = "\n# BEGIN ICHI WORKSPACE PROFILE\n"
const profileBlockEnd = "# END ICHI WORKSPACE PROFILE\n"

// lockedConfig stages an edit using the lock name respected by Git.
type lockedConfig struct {
	path     string
	original []byte
	existed  bool
	held     bool
	mode     os.FileMode
	next     []byte
}

func lockConfig(path string) (*lockedConfig, error) {
	f, err := os.OpenFile(path+".lock", os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return nil, fmt.Errorf("lock %s: %w", path, err)
	}
	f.Close()
	c := &lockedConfig{path: path, mode: 0600, held: true}
	c.original, err = os.ReadFile(path)
	if err == nil {
		c.existed = true
		info, e := os.Stat(path)
		if e != nil {
			os.Remove(path + ".lock")
			return nil, e
		}
		c.mode = info.Mode().Perm()
	}
	if err != nil && !os.IsNotExist(err) {
		os.Remove(path + ".lock")
		return nil, err
	}
	c.next = c.original
	return c, nil
}
func (c *lockedConfig) release() {
	if c.held {
		os.Remove(c.path + ".lock")
		c.held = false
	}
}
func (c *lockedConfig) write() error {
	if err := os.WriteFile(c.path+".lock", c.next, c.mode); err != nil {
		return err
	}
	if err := os.Chmod(c.path+".lock", c.mode); err != nil {
		return err
	}
	if err := os.Rename(c.path+".lock", c.path); err != nil {
		return err
	}
	c.held = false
	return nil
}
func (c *lockedConfig) restore() error {
	// Reacquire the Git lock; never overwrite a concurrent external edit.
	locked, err := lockConfig(c.path)
	if err != nil {
		return err
	}
	defer locked.release()
	if !bytes.Equal(locked.original, c.next) {
		return fmt.Errorf("cannot roll back %s: config changed externally", c.path)
	}
	if !c.existed {
		return os.Remove(c.path)
	}
	locked.next = c.original
	locked.mode = c.mode
	return locked.write()
}
func stripProfileBlock(data []byte) ([]byte, error) {
	text := string(data)
	start := strings.Index(text, profileBlockStart)
	if start < 0 {
		if strings.Contains(text, profileBlockEnd) {
			return nil, fmt.Errorf("incomplete Ichi profile block")
		}
		return data, nil
	}
	end := strings.Index(text[start+len(profileBlockStart):], profileBlockEnd)
	if end < 0 {
		return nil, fmt.Errorf("incomplete Ichi profile block")
	}
	end += start + len(profileBlockStart) + len(profileBlockEnd)
	rest := text[:start] + text[end:]
	if strings.Contains(rest, profileBlockStart) || strings.Contains(rest, profileBlockEnd) {
		return nil, fmt.Errorf("multiple Ichi profile blocks")
	}
	return []byte(rest), nil
}
func configValuesBytes(initial []byte, values map[string]string) ([]byte, error) {
	f, err := os.CreateTemp("", "ichi-config-*")
	if err != nil {
		return nil, err
	}
	path := f.Name()
	defer os.Remove(path)
	defer os.Remove(path + ".lock")
	if _, err = f.Write(initial); err != nil {
		f.Close()
		return nil, err
	}
	f.Close()
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if out, err := exec.Command("git", "config", "--file", path, "--replace-all", key, values[key]).CombinedOutput(); err != nil {
			return nil, fmt.Errorf("save %s: %s: %w", key, out, err)
		}
	}
	return os.ReadFile(path)
}
func repositoryConfigPath(repo string) (string, error) {
	// Raw discovery is intentional: locate the native config files whose
	// assignments are being changed, independently of effective profile values.
	run := func(args ...string) (string, error) {
		out, err := exec.Command("git", append([]string{"-C", repo}, args...)...).Output()
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) && len(exitErr.Stderr) > 0 {
			err = fmt.Errorf("%s: %w", strings.TrimSpace(string(exitErr.Stderr)), err)
		}
		return strings.TrimSpace(string(out)), err
	}
	enabled, _ := run("config", "--bool", "extensions.worktreeConfig")
	name := "config"
	if enabled == "true" {
		name = "config.worktree"
	}
	path, err := run("rev-parse", "--path-format=absolute", "--git-path", name)
	if err != nil {
		return "", fmt.Errorf("cannot locate Git config for %s: %w", repo, err)
	}
	// Canonicalize parent directories to detect repositories sharing a config.
	parent, err := filepath.EvalSymlinks(filepath.Dir(path))
	if err != nil {
		return "", err
	}
	path = filepath.Join(parent, filepath.Base(path))
	if info, err := os.Lstat(path); err == nil && info.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("Git config is a symlink: %s", path)
	}
	return path, nil
}

// applyNativeProfiles leaves the original config intact beneath a managed block.
// All configs are validated and locked before the first write. The caller can
// undo the transaction if persisting the assignment catalog fails.
func applyNativeProfiles(previous, next map[string]string) (func() error, error) {
	desired := map[string]string{}
	for repo, id := range next {
		// Saved workspaces can contain moved or temporarily unavailable repos.
		// Keep their assignments in the catalog and apply them on a later sync.
		if _, err := os.Stat(repo); os.IsNotExist(err) {
			continue
		}
		path, err := repositoryConfigPath(repo)
		if err != nil {
			return nil, err
		}
		if old, ok := desired[path]; ok && old != id {
			return nil, fmt.Errorf("linked worktrees sharing %s cannot use different profiles; enable Git worktree configuration first", path)
		}
		desired[path] = id
	}
	for repo := range previous {
		if _, err := os.Stat(repo); os.IsNotExist(err) {
			continue
		}
		path, err := repositoryConfigPath(repo)
		if err != nil {
			return nil, err
		}
		if _, ok := desired[path]; !ok {
			desired[path] = ""
		}
	}
	paths := make([]string, 0, len(desired))
	for path := range desired {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	staged := []*lockedConfig{}
	defer func() {
		for _, c := range staged {
			c.release()
		}
	}()
	for _, path := range paths {
		c, err := lockConfig(path)
		if err != nil {
			return nil, err
		}
		staged = append(staged, c)
		base, err := stripProfileBlock(c.original)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", path, err)
		}
		c.next = base
		if id := desired[path]; id != "" {
			values, err := profileValues(id)
			if err != nil {
				return nil, err
			}
			block, err := configValuesBytes(nil, values)
			if err != nil {
				return nil, err
			}
			c.next = append(append(append(bytes.Clone(base), []byte(profileBlockStart)...), block...), []byte(profileBlockEnd)...)
		}
	}
	written := []*lockedConfig{}
	rollback := func() error {
		var errs []error
		for i := len(written) - 1; i >= 0; i-- {
			if err := written[i].restore(); err != nil {
				errs = append(errs, err)
			}
		}
		return errors.Join(errs...)
	}
	for _, c := range staged {
		if bytes.Equal(c.original, c.next) {
			continue
		}
		if err := c.write(); err != nil {
			return nil, errors.Join(err, rollback())
		}
		written = append(written, c)
	}
	return rollback, nil
}
