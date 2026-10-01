package git

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

const WorktreePreviewMaxBytes = 64 * 1024
const WorktreePreviewMaxLines = 400

// FilePreview is bounded before serialization. Binary includes invalid UTF-8;
// binary previews contain no text. Truncated refers to the sampled prefix, not
// a promise that a later part of the file contains no binary bytes.
type FilePreview struct {
	Content   string
	Truncated bool
	Binary    bool
}

// IndexFileContent reads the staged blob at an exact repository-relative path.
// It does not fall back to the filesystem when the path is absent from the index.
func (r *Repository) IndexFileContent(file string) (string, error) {
	if !validSourcePath(file) {
		return "", fmt.Errorf("index content requires a worktree file path")
	}
	// Stage zero is explicit: a valid name such as "2:file" must never be
	// interpreted as stage two of a different path.
	return r.run("show", ":0:"+filepath.ToSlash(filepath.Clean(file)))
}

// WorkingFileContent reads the actual worktree file, independently of the index.
// Use WorkingFilePreview for display: this full-content API is intentionally
// unbounded and intended for consumers that require the complete document.
func (r *Repository) WorkingFileContent(file string) (string, error) {
	if err := r.operationContext().Err(); err != nil {
		return "", err
	}
	f, err := r.openWorktreeFile(file)
	if err != nil {
		return "", err
	}
	defer f.Close()
	data, err := io.ReadAll(f)
	if ctxErr := r.operationContext().Err(); ctxErr != nil {
		return "", ctxErr
	}
	return string(data), err
}

// WorkingFilePreview samples at most 64 KiB plus one lookahead byte, then limits
// text to 400 lines. Huge files never become huge bridge strings or line arrays.
func (r *Repository) WorkingFilePreview(file string) (*FilePreview, error) {
	if err := r.operationContext().Err(); err != nil {
		return nil, err
	}
	f, err := r.openWorktreeFile(file)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, WorktreePreviewMaxBytes+1))
	if ctxErr := r.operationContext().Err(); ctxErr != nil {
		return nil, ctxErr
	}
	if err != nil {
		return nil, err
	}
	preview := &FilePreview{Truncated: len(data) > WorktreePreviewMaxBytes}
	if preview.Truncated {
		data = data[:WorktreePreviewMaxBytes]
		// A valid rune split only by the byte cap is omitted, not classified binary.
		start := len(data) - 1
		for start > 0 && !utf8.RuneStart(data[start]) {
			start--
		}
		if !utf8.FullRune(data[start:]) {
			data = data[:start]
		}
	}
	if bytes.IndexByte(data, 0) >= 0 || !utf8.Valid(data) {
		preview.Binary = true
		return preview, nil
	}
	lines := 0
	for i, b := range data {
		if b == '\n' {
			lines++
		}
		if lines == WorktreePreviewMaxLines && i+1 < len(data) {
			data = data[:i+1]
			preview.Truncated = true
			break
		}
	}
	preview.Content = string(data)
	return preview, nil
}

func validSourcePath(file string) bool {
	if strings.ContainsRune(file, 0) || !filepath.IsLocal(file) || filepath.Clean(file) == "." {
		return false
	}
	for _, part := range strings.Split(filepath.Clean(file), string(filepath.Separator)) {
		if strings.EqualFold(part, ".git") {
			return false
		}
	}
	return true
}

// Source reads follow symlinks only to regular files inside this worktree, and
// reject Git metadata before and after resolution. This confines desktop reads;
// it is not protection against a concurrent filesystem path replacement.
func (r *Repository) openWorktreeFile(file string) (*os.File, error) {
	if !validSourcePath(file) {
		return nil, fmt.Errorf("content requires a file path inside the worktree")
	}
	root, err := filepath.EvalSymlinks(r.path)
	if err != nil {
		return nil, err
	}
	path, err := filepath.EvalSymlinks(filepath.Join(root, file))
	if err != nil {
		return nil, err
	}
	rel, err := filepath.Rel(root, path)
	if err != nil || !validSourcePath(rel) {
		return nil, fmt.Errorf("file is outside the worktree or is Git metadata")
	}
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	// Check before open as well: opening a FIFO can block indefinitely.
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("only regular worktree files can be read")
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	actual, err := f.Stat()
	if err != nil || !actual.Mode().IsRegular() {
		f.Close()
		if err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("only regular worktree files can be read")
	}
	return f, nil
}
