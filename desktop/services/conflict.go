package services

import (
	"context"
	"fmt"
	"github.com/atterpac/ichi/internal/git"
	"strings"
)

type ConflictFile struct {
	Regions []*git.ConflictRegion
	Lines   []string
}
type ConflictService struct{ state *State }

// Compatibility API; the desktop resolver uses Workspace and snapshot-checked writes.
func (s *ConflictService) GetConflictState() (*git.ConflictState, error) {
	w, err := s.Workspace(context.Background())
	if err != nil {
		return nil, err
	}
	kind := git.ConflictNone
	switch w.Kind {
	case "merge":
		kind = git.ConflictMerge
	case "rebase", "am":
		kind = git.ConflictRebase
	case "cherry-pick", "revert":
		kind = git.ConflictCherryPick
	}
	files := []string{}
	for _, f := range w.Files {
		files = append(files, f.Path)
	}
	source, target := w.Commit, w.Branch
	if w.Kind == "rebase" || w.Kind == "am" {
		source, target = w.Branch, w.Onto
	}
	return &git.ConflictState{Type: kind, InProgress: w.Kind != "", TargetBranch: target, SourceBranch: source, Files: files}, nil
}
func (s *ConflictService) ConflictFiles() ([]git.StatusEntry, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return repo.ConflictFiles()
}
func (s *ConflictService) ParseConflictFile(path string) (*ConflictFile, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	doc, err := conflictDocument(repo, path)
	if err != nil {
		return nil, err
	}
	if !doc.Editable {
		return nil, fmt.Errorf("only text conflicts can be parsed")
	}
	regions, lines, err := repo.ParseConflictFile(path)
	if err != nil {
		return nil, err
	}
	return &ConflictFile{Regions: regions, Lines: lines}, nil
}
func (s *ConflictService) WriteResolvedFile(path string, lines []string) error {
	s.state.conflictMu.Lock()
	defer s.state.conflictMu.Unlock()
	repo, err := s.state.Repo()
	if err != nil {
		return err
	}
	doc, err := conflictDocument(repo, path)
	if err != nil {
		return err
	}
	if !doc.Editable {
		return fmt.Errorf("only text conflicts can be edited")
	}
	absolute, err := conflictFilePath(repo.Path(), path)
	if err != nil {
		return err
	}
	if err := saveEditorFile(absolute, doc.Result, strings.Join(lines, "\n")); err != nil {
		return err
	}
	s.state.emitStatusChanged()
	return nil
}
func (s *ConflictService) StageResolvedFile(path string) error {
	repo, err := s.state.Repo()
	if err != nil {
		return err
	}
	doc, err := conflictDocument(repo, path)
	if err != nil {
		return err
	}
	return s.ResolveConflict(context.Background(), repo.Path(), path, doc.Token, "working", "")
}
func (s *ConflictService) legacyControl(kind, action string) error {
	w, err := s.Workspace(context.Background())
	if err != nil {
		return err
	}
	if kind != "" && w.Kind != kind {
		return fmt.Errorf("no %s is in progress", kind)
	}
	return s.ControlConflict(context.Background(), w.RepoPath, w.Token, action)
}
func (s *ConflictService) MergeContinue() error    { return s.legacyControl("merge", "continue") }
func (s *ConflictService) MergeAbort() error       { return s.legacyControl("merge", "abort") }
func (s *ConflictService) RebaseContinue() error   { return s.legacyControl("rebase", "continue") }
func (s *ConflictService) RebaseAbort() error      { return s.legacyControl("rebase", "abort") }
func (s *ConflictService) ContinueConflict() error { return s.legacyControl("", "continue") }
func (s *ConflictService) AbortConflict() error    { return s.legacyControl("", "abort") }
