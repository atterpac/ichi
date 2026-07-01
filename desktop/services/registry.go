package services

import (
	"fmt"
	"sync"

	"github.com/atterpac/ichi/internal/git"
)

const (
	EventRepoChanged   = "git:repo-changed"
	EventStatusChanged = "git:status-changed"
	EventProgress      = "git:progress"
	EventOperationErr  = "git:operation-error"
	EventPRChanged     = "pr:changed"
)

// EventEmitter is the small part of Wails' event API the services need.
// Keeping it local makes these services testable without importing Wails.
type EventEmitter interface {
	Emit(eventName string, data ...any)
}

type State struct {
	mu      sync.RWMutex
	repo    *git.Repository
	emitter EventEmitter
}

func NewState(repo *git.Repository, emitter EventEmitter) *State {
	return &State{repo: repo, emitter: emitter}
}

func (s *State) Repo() (*git.Repository, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.repo == nil {
		return nil, fmt.Errorf("no repository is open")
	}
	return s.repo, nil
}

func (s *State) SetRepo(repo *git.Repository) {
	s.mu.Lock()
	s.repo = repo
	s.mu.Unlock()
	s.Emit(EventRepoChanged, nil)
}

func (s *State) Emit(name string, data any) {
	if s.emitter != nil {
		s.emitter.Emit(name, data)
	}
}

func (s *State) emitStatusChanged() {
	s.Emit(EventStatusChanged, nil)
	s.Emit(EventRepoChanged, nil)
}

type Registry struct {
	Repo       *RepoService
	Graph      *GraphService
	Worktree   *WorktreeService
	Diff       *DiffService
	Refs       *RefService
	Remote     *RemoteService
	Stash      *StashService
	Conflict   *ConflictService
	Inspect    *InspectService
	Completion *CompletionService
	PR         *PRService
}

func NewRegistry(repo *git.Repository, emitter EventEmitter) *Registry {
	state := NewState(repo, emitter)
	return &Registry{
		Repo:       &RepoService{state: state},
		Graph:      &GraphService{state: state},
		Worktree:   &WorktreeService{state: state},
		Diff:       &DiffService{state: state},
		Refs:       &RefService{state: state},
		Remote:     &RemoteService{state: state},
		Stash:      &StashService{state: state},
		Conflict:   &ConflictService{state: state},
		Inspect:    &InspectService{state: state},
		Completion: &CompletionService{state: state},
		PR:         &PRService{state: state},
	}
}
