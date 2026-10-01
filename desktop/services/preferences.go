package services

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const preferenceMaxBytes = 1024 * 1024

var preferenceFileMu sync.Mutex

// PreferencesService persists application customization independently of Git state.
type PreferencesService struct{ path string }

// PreferenceSaveOutcome distinguishes a revision conflict from validation or I/O
// failure without requiring clients to classify Go error text.
type PreferenceSaveOutcome struct {
	Code     string
	Snapshot *PreferenceSnapshot
	Message  string
}

type PreferenceSnapshot struct {
	Content  string
	Revision string
	Path     string
}

func (s *PreferencesService) filename() (string, error) {
	if s.path != "" {
		return s.path, nil
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "ichi", "preferences.json"), nil
}

func preferenceRevision(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func readPreferenceSnapshot(path string) (*PreferenceSnapshot, error) {
	file, err := os.Open(path)
	if os.IsNotExist(err) {
		return &PreferenceSnapshot{Content: `{"version":1,"user":{},"workspaces":{},"repositories":{},"profiles":{},"selectedProfile":null,"extensions":{}}`, Revision: "missing", Path: path}, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, preferenceMaxBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > preferenceMaxBytes {
		return nil, fmt.Errorf("preferences exceed 1 MiB")
	}
	// Return malformed content unchanged so the UI can diagnose it without overwriting it.
	return &PreferenceSnapshot{Content: string(data), Revision: preferenceRevision(data), Path: path}, nil
}

func (s *PreferencesService) Load() (*PreferenceSnapshot, error) {
	preferenceFileMu.Lock()
	defer preferenceFileMu.Unlock()
	path, err := s.filename()
	if err != nil {
		return nil, err
	}
	return readPreferenceSnapshot(path)
}

// Save compares the exact file revision before atomically replacing the document.
func (s *PreferencesService) Save(expectedRevision, content string) (*PreferenceSaveOutcome, error) {
	if len(content) > preferenceMaxBytes {
		return nil, fmt.Errorf("preferences exceed 1 MiB")
	}
	var envelope struct {
		Version int `json:"version"`
	}
	if err := json.Unmarshal([]byte(content), &envelope); err != nil {
		return nil, fmt.Errorf("invalid preferences JSON: %w", err)
	}
	if envelope.Version != 1 {
		return nil, fmt.Errorf("unsupported preferences version %d", envelope.Version)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal([]byte(content), &fields); err != nil {
		return nil, err
	}
	for _, name := range []string{"user", "workspaces", "repositories", "profiles", "extensions"} {
		var value map[string]json.RawMessage
		if err := json.Unmarshal(fields[name], &value); err != nil || value == nil {
			return nil, fmt.Errorf("%s: expected an object", name)
		}
	}
	selected, ok := fields["selectedProfile"]
	if !ok {
		return nil, fmt.Errorf("selectedProfile: expected a string or null")
	}
	if string(selected) != "null" {
		var name string
		if err := json.Unmarshal(selected, &name); err != nil || strings.TrimSpace(name) == "" {
			return nil, fmt.Errorf("selectedProfile: expected a nonempty string or null")
		}
	}
	preferenceFileMu.Lock()
	defer preferenceFileMu.Unlock()
	path, err := s.filename()
	if err != nil {
		return nil, err
	}
	if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	unlock, err := lockPreferenceFile(filepath.Join(filepath.Dir(path), ".preferences.lock"))
	if err != nil {
		return nil, err
	}
	defer unlock()
	current, err := readPreferenceSnapshot(path)
	if err != nil {
		return nil, err
	}
	if current.Revision != expectedRevision {
		return &PreferenceSaveOutcome{Code: "conflict", Snapshot: current, Message: "Preferences changed since they were loaded. Review the current document before retrying."}, nil
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".preferences-*")
	if err != nil {
		return nil, err
	}
	temp := file.Name()
	defer os.Remove(temp)
	if _, err = file.WriteString(content); err != nil {
		file.Close()
		return nil, err
	}
	if err = file.Sync(); err != nil {
		file.Close()
		return nil, err
	}
	if err = file.Close(); err != nil {
		return nil, err
	}
	if err = os.Rename(temp, path); err != nil {
		return nil, err
	}
	return &PreferenceSaveOutcome{Code: "saved", Snapshot: &PreferenceSnapshot{Content: content, Revision: preferenceRevision([]byte(content)), Path: path}}, nil
}
