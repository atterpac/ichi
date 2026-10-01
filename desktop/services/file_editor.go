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
// In-worktree symlinks are followed; the link itself is preserved on save.
func editorPath(root, file string) (string, error) {
	if strings.ContainsRune(file, 0) || !filepath.IsLocal(file) || filepath.Clean(file) == "." {
		return "", fmt.Errorf("editing requires a file path inside the worktree")
	}
	if containsGitMetadata(file) {
		return "", fmt.Errorf("cannot edit Git metadata")
	}
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
	if containsGitMetadata(rel) {
		return "", fmt.Errorf("cannot edit Git metadata")
	}
	return path, nil
}

func containsGitMetadata(path string) bool {
	for _, part := range strings.Split(filepath.Clean(path), string(filepath.Separator)) {
		if strings.EqualFold(part, ".git") {
			return true
		}
	}
	return false
}

func readEditorFile(path string) (string, error) {
	// Reject FIFOs/devices before open: opening a FIFO can block indefinitely.
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("only regular files can be edited")
	}
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	info, err = f.Stat()
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
	if info.Mode().Perm()&0222 == 0 {
		return fmt.Errorf("file is read-only")
	}
	// Check target write permission as well as directory permission: replacing a
	// directory entry must not silently bypass a read-only source file/ACL.
	f, err := os.OpenFile(path, os.O_WRONLY, 0)
	if err != nil {
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return atomicReplaceFile(path, info.Mode().Perm(), func(f *os.File) error {
		_, err := f.WriteString(replacement)
		return err
	})
}

// atomicReplaceFile publishes only a complete, synced file and preserves its
// permission bits. The preceding content comparison is a stale-buffer check,
// not a filesystem compare-and-swap: an external writer can still race the
// comparison/rename. Existing open handles/hard links keep the old inode.
func atomicReplaceFile(path string, mode os.FileMode, write func(*os.File) error) error {
	f, err := os.CreateTemp(filepath.Dir(path), ".ichi-save-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	if err := write(f); err != nil {
		return err
	}
	if err := f.Chmod(mode); err != nil {
		return err
	}
	if err := f.Sync(); err != nil {
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), path)
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
