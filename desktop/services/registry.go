package services

import (
	"context"
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
	mu           sync.RWMutex
	repo         *git.Repository
	emitter      EventEmitter
	profiles     map[string]string
	profileError error
	profileSync  sync.Mutex
	conflictMu   sync.Mutex
	infoReads    repoInfoReads
	fileIndex    fileSearchIndex
	profileReads profileReadCache
}

func NewState(repo *git.Repository, emitter EventEmitter) *State {
	profiles, err := loadProfileAssignments()
	return &State{repo: repo, emitter: emitter, profiles: profiles, profileError: err}
}

func (s *State) Repo() (*git.Repository, error) {
	s.mu.RLock()
	repo := s.repo
	s.mu.RUnlock()
	return s.configuredRepo(repo)
}
func (s *State) repoContext(ctx context.Context) (*git.Repository, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	s.mu.RLock()
	repo := s.repo
	s.mu.RUnlock()
	configured, err := s.configuredRepoContext(ctx, repo)
	if err != nil {
		return nil, err
	}
	return configured.WithContext(ctx), nil
}
func (s *State) configuredRepo(repo *git.Repository) (*git.Repository, error) {
	return s.configuredRepoContext(context.Background(), repo)
}

// Resolve profile files outside State.mu: config subprocesses must not stall
// repository switching or unrelated operations holding the state lock.
func (s *State) configuredRepoContext(ctx context.Context, repo *git.Repository) (*git.Repository, error) {
	if repo == nil {
		return nil, fmt.Errorf("no repository is open")
	}
	s.mu.RLock()
	profileError, id := s.profileError, s.profiles[repo.Path()]
	s.mu.RUnlock()
	if profileError != nil {
		return nil, fmt.Errorf("cannot load workspace profiles: %w", profileError)
	}
	if id != "" {
		values, err := s.profileReads.read(ctx, id)
		if err != nil {
			return nil, err
		}
		return repo.WithConfig(values), nil
	}
	return repo, nil
}

func (s *State) SetRepo(repo *git.Repository) {
	s.mu.Lock()
	s.repo = repo
	s.infoReads.invalidate()
	s.mu.Unlock()
	s.fileIndex.invalidate()
	s.emit(EventRepoChanged, nil)
}

func (s *State) Emit(name string, data any) {
	if name == EventRepoChanged || name == EventStatusChanged {
		s.infoReads.invalidate()
		s.fileIndex.invalidate()
	}
	s.emit(name, data)
}

func (s *State) emit(name string, data any) {
	if s.emitter != nil {
		s.emitter.Emit(name, data)
	}
}

func (s *State) emitStatusChanged() {
	s.infoReads.invalidate()
	s.fileIndex.invalidate()
	s.emit(EventStatusChanged, nil)
	s.emit(EventRepoChanged, nil)
}

// mutate refreshes once after an attempted operation, including failures: Git
// hooks, filters and history rewrites can change observable state before failing.
// Rejection before an operation (no repository, invalid profile, empty batch)
// does not refresh. A nonempty op preserves remote progress/error payloads.
func (s *State) mutate(ctx context.Context, op string, fn func(*git.Repository) error) error {
	repo, err := s.repoContext(ctx)
	if err != nil {
		return err
	}
	if op != "" {
		s.Emit(EventProgress, map[string]any{"op": op, "phase": "start"})
	}
	defer s.emitStatusChanged()
	if err := fn(repo); err != nil {
		if op != "" {
			s.Emit(EventOperationErr, map[string]any{"op": op, "error": err.Error()})
		}
		return err
	}
	if op != "" {
		s.Emit(EventProgress, map[string]any{"op": op, "phase": "done"})
	}
	return nil
}

type Registry struct {
	Preferences *PreferencesService
	Repo        *RepoService
	Graph       *GraphService
	Worktree    *WorktreeService
	Diff        *DiffService
	Refs        *RefService
	Remote      *RemoteService
	Stash       *StashService
	Conflict    *ConflictService
	Inspect     *InspectService
	Completion  *CompletionService
	Search      *SearchService
	PR          *PRService
	Review      *ReviewService
}

func NewRegistry(repo *git.Repository, emitter EventEmitter) *Registry {
	state := NewState(repo, emitter)
	return &Registry{
		Preferences: &PreferencesService{},
		Repo:        &RepoService{state: state},
		Graph:       &GraphService{state: state},
		Worktree:    &WorktreeService{state: state},
		Diff:        &DiffService{state: state},
		Refs:        &RefService{state: state},
		Remote:      &RemoteService{state: state},
		Stash:       &StashService{state: state},
		Conflict:    &ConflictService{state: state},
		Inspect:     &InspectService{state: state},
		Completion:  &CompletionService{state: state},
		Search:      &SearchService{state: state},
		PR:          &PRService{state: state},
		Review:      &ReviewService{state: state},
	}
}
