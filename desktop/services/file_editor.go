package services

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

const editorMaxBytes = 1024 * 1024
const editorMaxLines = 20000

func validateEditorContent(content string) error {
	if len(content) > editorMaxBytes || strings.Count(content, "\n")+1 > editorMaxLines {
		return fmt.Errorf("editing is limited to 1 MiB and 20,000 lines")
	}
	if !utf8.ValidString(content) || strings.ContainsRune(content, 0) {
		return fmt.Errorf("only UTF-8 text files can be edited")
	}
	return nil
}

// editorPath confines edits to regular files within the active worktree.
func editorPath(root, file string) (string, error) {
	root, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "", err
	}
	path, err := filepath.EvalSymlinks(filepath.Join(root, file))
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(root, path)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return "", fmt.Errorf("file is outside the worktree")
	}
	return path, nil
}

func readEditorFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("only regular files can be edited")
	}
	data, err := io.ReadAll(io.LimitReader(f, editorMaxBytes+1))
	if err != nil {
		return "", err
	}
	return string(data), validateEditorContent(string(data))
}

func (s *DiffService) LoadEditorFile(file string) (string, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return "", err
	}
	path, err := editorPath(repo.Path(), file)
	if err != nil {
		return "", err
	}
	return readEditorFile(path)
}

func saveEditorFile(path, original, replacement string) error {
	if err := validateEditorContent(replacement); err != nil {
		return err
	}
	current, err := readEditorFile(path)
	if err != nil {
		return err
	}
	if !bytes.Equal([]byte(current), []byte(original)) {
		return fmt.Errorf("file changed on disk; your draft has been kept. Reopen the file before saving")
	}
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	return os.WriteFile(path, []byte(replacement), info.Mode().Perm())
}

func (s *DiffService) SaveEditorFile(file, original, replacement string) error {
	repo, err := s.state.Repo()
	if err != nil {
		return err
	}
	path, err := editorPath(repo.Path(), file)
	if err != nil {
		return err
	}
	if err = saveEditorFile(path, original, replacement); err != nil {
		return err
	}
	s.state.emitStatusChanged()
	return nil
}
