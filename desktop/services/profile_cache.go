package services

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type profileReadCache struct {
	mu      sync.Mutex
	entries map[string]cachedProfile
}
type cachedProfile struct {
	fingerprint string
	values      map[string]string
	read        time.Time
}

func profileFingerprint(id string) string {
	home, _ := os.UserHomeDir()
	xdg := os.Getenv("XDG_CONFIG_HOME")
	if xdg == "" {
		xdg = filepath.Join(home, ".config")
	}
	paths := []string{filepath.Join(home, ".gitconfig"), filepath.Join(xdg, "git", "config")}
	if path := os.Getenv("GIT_CONFIG_GLOBAL"); path != "" {
		paths = []string{path}
	}
	if id != "global" {
		paths = append(paths, id)
	}
	var key strings.Builder
	for _, path := range paths {
		info, err := os.Stat(path)
		if err != nil {
			fmt.Fprintf(&key, "%s:%v;", path, err)
			continue
		}
		fmt.Fprintf(&key, "%s:%d:%d:%v;", path, info.Size(), info.ModTime().UnixNano(), info.Mode())
	}
	return key.String()
}

func (c *profileReadCache) read(ctx context.Context, id string) (map[string]string, error) {
	key := profileFingerprint(id)
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if cached, ok := c.entries[id]; ok && cached.fingerprint == key && time.Since(cached.read) < 30*time.Second {
		return cached.values, nil
	}
	values, err := profileValuesContext(ctx, id)
	if err != nil {
		return nil, err
	}
	if c.entries == nil {
		c.entries = make(map[string]cachedProfile)
	}
	if len(c.entries) >= 8 {
		oldestID, oldest := "", time.Now()
		for id, entry := range c.entries {
			if entry.read.Before(oldest) {
				oldestID, oldest = id, entry.read
			}
		}
		delete(c.entries, oldestID)
	}
	c.entries[id] = cachedProfile{fingerprint: key, values: values, read: time.Now()}
	return values, nil
}
