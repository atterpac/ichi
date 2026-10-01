package services

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/atterpac/ichi/internal/git"
)

type ConflictEntry struct {
	Path string
	Kind string
}
type ConflictStep struct {
	Hash    string
	Subject string
	State   string
}
type ConflictWorkspace struct {
	RepoPath      string
	Token         string
	Kind          string
	CurrentLabel  string
	IncomingLabel string
	Branch        string
	Onto          string
	Commit        string
	Subject       string
	Author        string
	OriginalHead  string
	Step          int
	Total         int
	Files         []ConflictEntry
	Staged        []string
	Steps         []ConflictStep
}
type ConflictVersion struct {
	Exists   bool
	Content  string
	Mode     string
	Editable bool
}
type ConflictDocument struct {
	MarkerSize int
	RepoPath   string
	Path       string
	Token      string
	Base       ConflictVersion
	Current    ConflictVersion
	Incoming   ConflictVersion
	Result     string
	Exists     bool
	Editable   bool
	Reason     string
}
type conflictIndexEntry struct {
	mode, hash string
	stage      int
}

func conflictRead(repo *git.Repository, args ...string) ([]byte, error) {
	cmd := repo.Command(append([]string{"--literal-pathspecs"}, args...)...)
	out, err := cmd.Output()
	if err != nil {
		if e, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("git %s: %s", args[0], strings.TrimSpace(string(e.Stderr)))
		}
		return nil, err
	}
	return out, nil
}
func conflictText(repo *git.Repository, args ...string) string {
	b, _ := conflictRead(repo, args...)
	return strings.TrimSpace(string(b))
}
func conflictHash(parts ...[]byte) string {
	h := sha256.New()
	for _, p := range parts {
		h.Write(p)
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))
}
func readOperationFile(dir, name string) string {
	b, _ := os.ReadFile(filepath.Join(dir, name))
	return strings.TrimSpace(string(b))
}

func conflictIndex(repo *git.Repository) (map[string][]conflictIndexEntry, error) {
	out, err := conflictRead(repo, "ls-files", "--unmerged", "-z")
	if err != nil {
		return nil, err
	}
	result := map[string][]conflictIndexEntry{}
	for _, record := range bytes.Split(out, []byte{0}) {
		if len(record) == 0 {
			continue
		}
		header, path, ok := strings.Cut(string(record), "\t")
		fields := strings.Fields(header)
		if !ok || len(fields) != 3 {
			return nil, fmt.Errorf("invalid unmerged index entry")
		}
		stage, err := strconv.Atoi(fields[2])
		if err != nil {
			return nil, err
		}
		result[path] = append(result[path], conflictIndexEntry{fields[0], fields[1], stage})
	}
	return result, nil
}
func workspaceFor(repo *git.Repository) (*ConflictWorkspace, error) {
	root := repo.Path()
	dirBytes, err := conflictRead(repo, "rev-parse", "--absolute-git-dir")
	if err != nil {
		return nil, err
	}
	dir := strings.TrimSpace(string(dirBytes))
	w := &ConflictWorkspace{RepoPath: root, Files: []ConflictEntry{}, Staged: []string{}, Steps: []ConflictStep{}, CurrentLabel: "Current version (HEAD)", IncomingLabel: "Incoming version"}
	w.Branch = conflictText(repo, "symbolic-ref", "--short", "-q", "HEAD")
	head := conflictText(repo, "rev-parse", "--verify", "HEAD")
	operationDir := ""
	for _, name := range []string{"rebase-merge", "rebase-apply"} {
		if info, e := os.Stat(filepath.Join(dir, name)); e == nil && info.IsDir() {
			operationDir = filepath.Join(dir, name)
			w.Kind = "rebase"
			break
		}
	}
	if operationDir != "" {
		w.Branch = strings.TrimPrefix(readOperationFile(operationDir, "head-name"), "refs/heads/")
		w.Onto = readOperationFile(operationDir, "onto")
		w.OriginalHead = readOperationFile(operationDir, "orig-head")
		w.Commit = readOperationFile(operationDir, "stopped-sha")
		if w.Commit == "" {
			w.Commit = readOperationFile(dir, "REBASE_HEAD")
		}
		w.Step, _ = strconv.Atoi(readOperationFile(operationDir, "msgnum"))
		w.Total, _ = strconv.Atoi(readOperationFile(operationDir, "end"))
		if w.Step == 0 {
			w.Step, _ = strconv.Atoi(readOperationFile(operationDir, "next"))
			w.Total, _ = strconv.Atoi(readOperationFile(operationDir, "last"))
		}
		if _, e := os.Stat(filepath.Join(operationDir, "applying")); e == nil {
			w.Kind = "am"
		}
		w.CurrentLabel = "Rebased version (HEAD)"
		w.IncomingLabel = "Commit being replayed"
		w.Steps = readRebaseSteps(operationDir, w.Commit)
	} else {
		for _, op := range []struct{ file, kind, label string }{{"MERGE_HEAD", "merge", "Branch being merged"}, {"CHERRY_PICK_HEAD", "cherry-pick", "Commit being cherry-picked"}, {"REVERT_HEAD", "revert", "Reverted version"}} {
			if value := readOperationFile(dir, op.file); value != "" {
				w.Kind = op.kind
				w.Commit = strings.Fields(value)[0]
				w.IncomingLabel = op.label
				break
			}
		}
		// Sequencer operations may be paused between commits without *_HEAD.
		if w.Kind == "" {
			todo := strings.Fields(readOperationFile(dir, "sequencer/todo"))
			if len(todo) > 1 {
				if todo[0] == "pick" {
					w.Kind = "cherry-pick"
				} else if todo[0] == "revert" {
					w.Kind = "revert"
				}
				w.Commit = todo[1]
			}
		}
		if w.Kind != "" {
			w.OriginalHead = head
			if w.Kind == "merge" {
				w.OriginalHead = readOperationFile(dir, "ORIG_HEAD")
			}
			if original := readOperationFile(dir, "sequencer/head"); original != "" {
				w.OriginalHead = original
			}
		}
	}
	if w.Commit != "" {
		out, _ := conflictRead(repo, "show", "-s", "--format=%H%x00%s%x00%an", w.Commit, "--")
		p := strings.SplitN(strings.TrimSuffix(string(out), "\n"), "\x00", 3)
		if len(p) == 3 {
			w.Commit = p[0]
			w.Subject = p[1]
			w.Author = p[2]
		}
	}
	index, err := conflictIndex(repo)
	if err != nil {
		return nil, err
	}
	for path, entries := range index {
		has := map[int]bool{}
		for _, e := range entries {
			has[e.stage] = true
		}
		kind := "Both modified"
		if !has[2] {
			kind = "Deleted in current version"
		} else if !has[3] {
			kind = "Deleted in incoming version"
		} else if !has[1] {
			kind = "Added in both versions"
		}
		w.Files = append(w.Files, ConflictEntry{path, kind})
	}
	sort.Slice(w.Files, func(i, j int) bool { return w.Files[i].Path < w.Files[j].Path })
	staged, err := conflictRead(repo, "diff", "--cached", "--name-only", "--diff-filter=ACDMRT", "-z")
	if err != nil {
		return nil, err
	}
	for _, p := range bytes.Split(staged, []byte{0}) {
		if len(p) > 0 {
			w.Staged = append(w.Staged, string(p))
		}
	}
	w.Token = conflictHash([]byte(root), []byte(head), []byte(w.Kind), []byte(w.Commit), []byte(w.OriginalHead), []byte(strconv.Itoa(w.Step)))
	return w, nil
}
func readRebaseSteps(dir, current string) []ConflictStep {
	result := []ConflictStep{}
	for _, name := range []string{"done", "git-rebase-todo"} {
		lines := strings.Split(readOperationFile(dir, name), "\n")
		for _, line := range lines {
			fields := strings.Fields(line)
			if len(fields) < 2 || strings.HasPrefix(fields[0], "#") {
				continue
			}
			switch fields[0] {
			case "pick", "p", "reword", "r", "edit", "e", "squash", "s", "fixup", "f":
			default:
				continue
			}
			hashIndex := 1
			if strings.HasPrefix(fields[1], "-") {
				hashIndex = 2
			}
			if len(fields) <= hashIndex {
				continue
			}
			state := "pending"
			if name == "done" {
				state = "done"
			}
			hash := fields[hashIndex]
			if current != "" && (strings.HasPrefix(current, hash) || strings.HasPrefix(hash, current)) {
				state = "current"
			}
			result = append(result, ConflictStep{hash, strings.Join(fields[hashIndex+1:], " "), state})
		}
	}
	// Keep the inspector bounded while retaining the area around the stopped commit.
	if len(result) > 100 {
		start := 0
		for i, s := range result {
			if s.State == "current" {
				start = max(0, i-20)
				break
			}
		}
		result = result[start:min(len(result), start+100)]
	}
	return result
}
func (s *ConflictService) Workspace(ctx context.Context) (*ConflictWorkspace, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	return workspaceFor(repo)
}

// conflictFilePath rejects traversal and all symlinks, including parent directories.
// The path must also be an exact unmerged index entry before any resolution writes.
func conflictFilePath(root, path string) (string, error) {
	if path == "" || filepath.IsAbs(path) || strings.ContainsRune(path, 0) {
		return "", fmt.Errorf("invalid conflict path")
	}
	clean := filepath.Clean(filepath.FromSlash(path))
	if clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("conflict path is outside the worktree")
	}
	if containsGitMetadata(clean) {
		return "", fmt.Errorf("cannot edit Git metadata")
	}
	current := root
	parts := strings.Split(clean, string(filepath.Separator))
	for i, part := range parts {
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if os.IsNotExist(err) && i == len(parts)-1 {
			return current, nil
		}
		if err != nil {
			return "", err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("resolve symlink conflicts with an external tool")
		}
		if i < len(parts)-1 && !info.IsDir() {
			return "", fmt.Errorf("conflict parent is not a directory")
		}
		if i == len(parts)-1 && !info.Mode().IsRegular() {
			return "", fmt.Errorf("resolve directory or submodule conflicts with an external tool")
		}
	}
	return current, nil
}
func readConflictWorktree(path string) ([]byte, os.FileMode, bool, error) {
	f, err := os.Open(path)
	if os.IsNotExist(err) {
		return nil, 0644, false, nil
	}
	if err != nil {
		return nil, 0, false, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil, 0, false, err
	}
	if !info.Mode().IsRegular() {
		return nil, 0, false, fmt.Errorf("not a regular file")
	}
	data, err := io.ReadAll(io.LimitReader(f, editorMaxBytes+1))
	if len(data) > editorMaxBytes {
		return nil, info.Mode().Perm(), true, fmt.Errorf("conflict preview is limited to 1 MiB; resolve this file externally")
	}
	return data, info.Mode().Perm(), true, err
}
func conflictBlob(repo *git.Repository, e conflictIndexEntry) ([]byte, error) {
	size, err := conflictRead(repo, "cat-file", "-s", e.hash)
	if err != nil {
		return nil, err
	}
	n, _ := strconv.ParseInt(strings.TrimSpace(string(size)), 10, 64)
	if n > editorMaxBytes {
		return nil, fmt.Errorf("conflict preview is limited to 1 MiB; resolve this file externally")
	}
	return conflictRead(repo, "cat-file", "blob", e.hash)
}
func editableConflict(data []byte) bool {
	return utf8.Valid(data) && !bytes.ContainsRune(data, 0) && strings.Count(string(data), "\n") < editorMaxLines
}
func conflictDocument(repo *git.Repository, path string) (*ConflictDocument, error) {
	index, err := conflictIndex(repo)
	if err != nil {
		return nil, err
	}
	entries := index[path]
	if len(entries) == 0 {
		return nil, fmt.Errorf("this file is no longer conflicted; refresh the view")
	}
	absolute, err := conflictFilePath(repo.Path(), path)
	if err != nil {
		return nil, err
	}
	current, mode, exists, err := readConflictWorktree(absolute)
	if err != nil {
		return nil, err
	}
	w, err := workspaceFor(repo)
	if err != nil {
		return nil, err
	}
	doc := &ConflictDocument{MarkerSize: conflictMarkerSize(repo, path), RepoPath: repo.Path(), Path: path, Exists: exists, Editable: editableConflict(current)}
	parts := [][]byte{[]byte(w.Token), current, []byte(fmt.Sprint(mode, exists)), []byte(strconv.Itoa(doc.MarkerSize))}
	for _, e := range entries {
		if e.mode != "100644" && e.mode != "100755" {
			return nil, fmt.Errorf("resolve symlink or submodule conflicts with an external tool")
		}
		data, err := conflictBlob(repo, e)
		if err != nil {
			return nil, err
		}
		v := ConflictVersion{Exists: true, Mode: e.mode, Editable: editableConflict(data)}
		if v.Editable {
			v.Content = string(data)
		}
		if !v.Editable {
			doc.Editable = false
		}
		switch e.stage {
		case 1:
			doc.Base = v
		case 2:
			doc.Current = v
		case 3:
			doc.Incoming = v
		}
		parts = append(parts, []byte(fmt.Sprintf("%d %s %s", e.stage, e.mode, e.hash)))
	}
	if doc.Editable {
		doc.Result = string(current)
	} else {
		doc.Reason = "Binary or non-UTF-8 content. Choose a complete version, keep a deletion, or resolve externally."
	}
	doc.Token = conflictHash(parts...)
	return doc, nil
}
func (s *ConflictService) LoadConflict(ctx context.Context, repoPath, path string) (*ConflictDocument, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	if repo.Path() != repoPath {
		return nil, fmt.Errorf("repository changed; reload conflicts")
	}
	return conflictDocument(repo, path)
}

func conflictMarkerSize(repo *git.Repository, path string) int {
	out, err := conflictRead(repo, "check-attr", "-z", "conflict-marker-size", "--", path)
	if err == nil {
		fields := bytes.Split(out, []byte{0})
		if len(fields) >= 3 {
			n, _ := strconv.Atoi(string(fields[2]))
			if n > 0 && n <= 1024 {
				return n
			}
		}
	}
	return 7
}
func unresolvedMarkers(content string, size int) bool {
	markers := []string{strings.Repeat("<", size), strings.Repeat("|", size), strings.Repeat("=", size), strings.Repeat(">", size)}
	for _, line := range strings.Split(content, "\n") {
		for _, marker := range markers {
			if strings.HasPrefix(line, marker) {
				return true
			}
		}
	}
	return false
}

// ResolveConflict verifies the worktree and index snapshot before saving and staging
// exactly one path. Whole-version choices also support binary blobs and deletions.
func (s *ConflictService) ResolveConflict(ctx context.Context, repoPath, path, token, choice, content string) error {
	s.state.conflictMu.Lock()
	defer s.state.conflictMu.Unlock()
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return err
	}
	if repo.Path() != repoPath {
		return fmt.Errorf("repository changed; reload conflicts")
	}
	doc, err := conflictDocument(repo, path)
	if err != nil {
		return err
	}
	if doc.Token != token {
		return fmt.Errorf("file or Git operation changed externally; your draft has been kept. Reload before saving")
	}
	absolute, err := conflictFilePath(repoPath, path)
	if err != nil {
		return err
	}
	previous, mode, existed, err := readConflictWorktree(absolute)
	if err != nil {
		return err
	}
	var data []byte
	remove := false
	switch choice {
	case "edit":
		if !doc.Editable {
			return fmt.Errorf("this conflict cannot be edited as text")
		}
		if err := validateEditorContent(content); err != nil {
			return err
		}
		if unresolvedMarkers(content, doc.MarkerSize) {
			return fmt.Errorf("resolve all conflict markers before staging")
		}
		data = []byte(content)
	case "current", "incoming":
		stage := 2
		if choice == "incoming" {
			stage = 3
		}
		index, err := conflictIndex(repo)
		if err != nil {
			return err
		}
		remove = true
		for _, e := range index[path] {
			if e.stage == stage {
				remove = false
				data, err = conflictBlob(repo, e)
				if err != nil {
					return err
				}
				mode = 0644
				if e.mode == "100755" {
					mode = 0755
				}
			}
		}
	case "working":
		if !existed {
			return fmt.Errorf("file is absent; explicitly select the deleted version")
		}
		data = previous
		if editableConflict(data) && unresolvedMarkers(string(data), doc.MarkerSize) {
			return fmt.Errorf("resolve all conflict markers before staging")
		}
	default:
		return fmt.Errorf("unknown conflict resolution")
	}
	// Textareas normalize newlines. Preserve a consistently CRLF working file.
	if !remove && editableConflict(data) && editableConflict(previous) && bytes.Contains(previous, []byte("\r\n")) && !bytes.Contains(bytes.ReplaceAll(previous, []byte("\r\n"), nil), []byte("\n")) {
		data = bytes.ReplaceAll(bytes.ReplaceAll(data, []byte("\r\n"), []byte("\n")), []byte("\n"), []byte("\r\n"))
	}
	// Respect an existing executable bit for manual edits.
	if choice == "edit" && !existed && (doc.Current.Mode == "100755" || doc.Incoming.Mode == "100755") {
		mode = 0755
	}
	if remove {
		err = os.Remove(absolute)
		if os.IsNotExist(err) {
			err = nil
		}
	} else if !bytes.Equal(previous, data) || !existed || choice == "current" || choice == "incoming" {
		err = atomicReplaceFile(absolute, mode, func(f *os.File) error {
			_, err := f.Write(data)
			return err
		})
	}
	if err != nil {
		return err
	}
	defer s.state.emitStatusChanged()
	if _, err := conflictRead(repo, "add", "-A", "--", path); err != nil {
		return fmt.Errorf("resolution saved, but staging failed: %w. Reload to retry", err)
	}
	return nil
}

func (s *ConflictService) ControlConflict(ctx context.Context, repoPath, token, action string) error {
	s.state.conflictMu.Lock()
	defer s.state.conflictMu.Unlock()
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return err
	}
	if repo.Path() != repoPath {
		return fmt.Errorf("repository changed; reload conflicts")
	}
	w, err := workspaceFor(repo)
	if err != nil {
		return err
	}
	if w.Token != token {
		return fmt.Errorf("Git operation changed; refresh before continuing")
	}
	switch w.Kind {
	case "merge", "rebase", "cherry-pick", "revert", "am":
	default:
		return fmt.Errorf("no supported Git operation is in progress")
	}
	if action != "continue" && action != "abort" && action != "skip" {
		return fmt.Errorf("unknown operation action")
	}
	if action == "continue" && len(w.Files) > 0 {
		return fmt.Errorf("resolve and stage all conflicted files first")
	}
	if action == "skip" && w.Kind == "merge" {
		return fmt.Errorf("merge does not support skipping a commit")
	}
	cmd := repo.Command("-c", "core.editor=true", w.Kind, "--"+action)
	for _, value := range os.Environ() {
		if !strings.HasPrefix(value, "GIT_EDITOR=") && !strings.HasPrefix(value, "GIT_SEQUENCE_EDITOR=") && !strings.HasPrefix(value, "GIT_TERMINAL_PROMPT=") {
			cmd.Env = append(cmd.Env, value)
		}
	}
	cmd.Env = append(cmd.Env, "GIT_EDITOR=true", "GIT_SEQUENCE_EDITOR=true", "GIT_TERMINAL_PROMPT=0")
	out, err := cmd.CombinedOutput()
	s.state.emitStatusChanged()
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if err != nil {
		return fmt.Errorf("%s %s: %s", w.Kind, action, strings.TrimSpace(string(out)))
	}
	return nil
}
