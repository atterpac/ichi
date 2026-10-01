package services

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/atterpac/ichi/internal/git"
)

const searchIndexTTL = 5 * time.Second
const searchIndexBytes = 16 << 20
const searchIndexEntries = 250000

type SearchService struct{ state *State }
type SearchCapabilities struct{ ContentAvailable bool }
type FileMatch struct {
	Path  string
	Score int
}
type FileSearchResult struct {
	Matches []FileMatch
	Total   int
}
type ContentMatch struct {
	Path   string
	Line   int
	Column int // One-based byte offset, as reported by ripgrep.
	Text   string
}
type ContentSearchResult struct {
	Matches   []ContentMatch
	Truncated bool
}
type indexedPath struct{ path, lower, base string }
type fileSearchIndex struct {
	mu      sync.Mutex
	path    string
	built   time.Time
	entries []indexedPath
	pending *fileIndexRead
}

func (i *fileSearchIndex) invalidate() {
	i.mu.Lock()
	i.built = time.Time{}
	i.entries = nil
	i.pending = nil
	i.mu.Unlock()
}

// outputBudget stops capture before a child can grow the desktop heap without
// bound. Returning an error makes os/exec close the pipe; cancellation reaps it.
type outputBudget struct {
	buffer    bytes.Buffer
	remaining int
}

func (b *outputBudget) Write(p []byte) (int, error) {
	if len(p) > b.remaining {
		return 0, fmt.Errorf("search output exceeded its memory budget")
	}
	b.remaining -= len(p)
	return b.buffer.Write(p)
}

type fileIndexRead struct {
	path    string
	done    chan struct{}
	cancel  context.CancelFunc
	waiters int
	entries []indexedPath
	err     error
}

func (i *fileSearchIndex) read(ctx context.Context, repo *git.Repository) ([]indexedPath, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	i.mu.Lock()
	if i.path == repo.Path() && time.Since(i.built) < searchIndexTTL {
		entries := i.entries
		i.mu.Unlock()
		return entries, nil
	}
	pending := i.pending
	if pending == nil || pending.path != repo.Path() {
		runCtx, cancel := context.WithCancel(context.WithoutCancel(ctx))
		pending = &fileIndexRead{path: repo.Path(), done: make(chan struct{}), cancel: cancel}
		i.pending = pending
		go func() {
			pending.entries, pending.err = loadFileIndex(runCtx, repo)
			i.mu.Lock()
			if i.pending == pending {
				i.pending = nil
				if pending.err == nil {
					i.path, i.built, i.entries = repo.Path(), time.Now(), pending.entries
				}
			}
			close(pending.done)
			i.mu.Unlock()
			cancel()
		}()
	}
	pending.waiters++
	i.mu.Unlock()
	defer func() {
		i.mu.Lock()
		pending.waiters--
		if pending.waiters == 0 {
			pending.cancel()
			if i.pending == pending {
				i.pending = nil
			}
		}
		i.mu.Unlock()
	}()
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-pending.done:
		return pending.entries, pending.err
	}
}
func loadFileIndex(ctx context.Context, repo *git.Repository) ([]indexedPath, error) {
	buildCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	// Preserve Git's filename semantics: include tracked hidden/ignored files
	// and untracked nonignored files; -z preserves spaces and newline filenames.
	cmd := repo.CommandContext(buildCtx, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--deduplicate")
	out := &outputBudget{remaining: searchIndexBytes}
	stderr := &outputBudget{remaining: 64 << 10}
	cmd.Stdout, cmd.Stderr = out, stderr
	if err := cmd.Run(); err != nil {
		if buildCtx.Err() != nil {
			return nil, buildCtx.Err()
		}
		return nil, fmt.Errorf("index repository files: %w: %s", err, stderr.buffer.String())
	}
	entries := make([]indexedPath, 0, min(bytes.Count(out.buffer.Bytes(), []byte{0}), searchIndexEntries))
	// Splitting after the byte budget is checked cannot retain an unbounded
	// command buffer. A second budget includes lowercase strings and structs.
	retained := 0
	for _, path := range strings.Split(out.buffer.String(), "\x00") {
		if path == "" {
			continue
		}
		retained += 64 + 2*len(path)
		if len(entries) >= searchIndexEntries || retained > 32<<20 {
			return nil, fmt.Errorf("repository filename index exceeds 250,000 files or 32 MiB")
		}
		lower := strings.ToLower(path)
		base := lower[strings.LastIndexByte(lower, '/')+1:]
		entries = append(entries, indexedPath{path, lower, base})
	}
	sort.Slice(entries, func(a, b int) bool { return entries[a].path < entries[b].path })
	return entries, nil
}

func searchLimit(limit int) int {
	if limit <= 0 {
		return 8
	}
	return min(limit, 100)
}
func validateSearch(query string) error {
	if len(query) > 1024 || strings.ContainsAny(query, "\x00\r\n") {
		return fmt.Errorf("search must be a single line of at most 1,024 bytes")
	}
	return nil
}

// Files scans an immutable, normalized index and retains only the best K
// results. No per-keystroke subprocess or full file-list bridge transfer.
func (s *SearchService) Files(ctx context.Context, query string, limit int, recent []string) (*FileSearchResult, error) {
	if err := validateSearch(query); err != nil {
		return nil, err
	}
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	entries, err := s.state.fileIndex.read(ctx, repo)
	if err != nil {
		return nil, err
	}
	query = strings.ToLower(strings.TrimSpace(query))
	limit = searchLimit(limit)
	best := make([]FileMatch, 0, limit)
	for n, entry := range entries {
		if n%1024 == 0 {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
		}
		score, matched := pathScore(entry, query)
		if !matched {
			continue
		}
		if query == "" {
			for rank, path := range recent[:min(len(recent), 100)] {
				if path == entry.path {
					score = rank - 101
					break
				}
			}
		}
		candidate := FileMatch{Path: entry.path, Score: score}
		at := sort.Search(len(best), func(n int) bool { return score < best[n].Score || score == best[n].Score && entry.path < best[n].Path })
		if at >= limit {
			continue
		}
		if len(best) < limit {
			best = append(best, FileMatch{})
		}
		copy(best[at+1:], best[at:len(best)-1])
		best[at] = candidate
	}
	return &FileSearchResult{Matches: best, Total: len(entries)}, nil
}

func pathScore(entry indexedPath, query string) (int, bool) {
	if query == "" {
		return 0, true
	}
	if entry.base == query {
		return 0, true
	}
	if entry.lower == query {
		return 1, true
	}
	if strings.HasPrefix(entry.base, query) {
		return 100 + len(entry.base), true
	}
	if strings.HasPrefix(entry.lower, query) {
		return 200 + len(entry.lower), true
	}
	if at := strings.Index(entry.base, query); at >= 0 {
		return 300 + at + len(entry.base), true
	}
	if at := strings.Index(entry.lower, query); at >= 0 {
		return 500 + at + len(entry.lower), true
	}
	end, first := 0, -1
	for _, r := range query {
		at := strings.IndexRune(entry.lower[end:], r)
		if at < 0 {
			return 0, false
		}
		if first < 0 {
			first = end + at
		}
		end += at + utf8.RuneLen(r)
	}
	return 1000 + first + (end-first-len(query))*2 + len(entry.lower), true
}

// Only use an existing executable, including one supplied by an app package.
// This prototype never downloads or installs a search dependency.
func availableRipgrep() string {
	if path, err := exec.LookPath("rg"); err == nil {
		return path
	}
	app, err := os.Executable()
	if err != nil {
		return ""
	}
	name := "rg"
	if filepath.Ext(app) == ".exe" {
		name += ".exe"
	}
	for _, candidate := range []string{filepath.Join(filepath.Dir(app), name), filepath.Join(filepath.Dir(app), "resources", "bin", name), filepath.Join(filepath.Dir(app), "..", "Resources", "bin", name)} {
		if path, err := exec.LookPath(candidate); err == nil {
			return path
		}
	}
	return ""
}
func (s *SearchService) Capabilities() SearchCapabilities {
	return SearchCapabilities{ContentAvailable: availableRipgrep() != ""}
}

type rgText struct {
	Text  string
	Bytes string
}

func (t rgText) value() string {
	if t.Bytes != "" {
		b, _ := base64.StdEncoding.DecodeString(t.Bytes)
		return string(b)
	}
	return t.Text
}

type rgEvent struct {
	Type string
	Data struct {
		Path       rgText
		Lines      rgText
		LineNumber int `json:"line_number"`
		Submatches []struct{ Start int }
	}
}

// Content is a bounded literal search. Ripgrep's ignore rules remain enabled,
// hidden files are included, and symlinks are not followed.
func (s *SearchService) Content(ctx context.Context, query string, limit int) (*ContentSearchResult, error) {
	if err := validateSearch(query); err != nil {
		return nil, err
	}
	result := &ContentSearchResult{Matches: []ContentMatch{}}
	if strings.TrimSpace(query) == "" {
		return result, nil
	}
	rg := availableRipgrep()
	if rg == "" {
		return nil, fmt.Errorf("content search requires rg on this device or in the app package")
	}
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}
	limit = searchLimit(limit)
	runCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	cmd := exec.CommandContext(runCtx, rg, "--no-config", "--json", "--fixed-strings", "--smart-case", "--hidden", "--glob=!.git", "--max-filesize=1M", "--", query, ".")
	cmd.Dir, cmd.WaitDelay = repo.Path(), time.Second
	stderr := &outputBudget{remaining: 64 << 10}
	cmd.Stderr = stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	reader := &io.LimitedReader{R: stdout, N: 8 << 20}
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64<<10), 2<<20)
	var decodeErr error
	for scanner.Scan() {
		var event rgEvent
		if err := json.Unmarshal(scanner.Bytes(), &event); err != nil {
			decodeErr = err
			break
		}
		if event.Type != "match" {
			continue
		}
		if len(result.Matches) == limit {
			result.Truncated = true
			break
		}
		path := filepath.ToSlash(filepath.Clean(event.Data.Path.value()))
		if filepath.IsAbs(path) || path == ".." || strings.HasPrefix(path, "../") {
			continue
		}
		text := strings.TrimRight(event.Data.Lines.value(), "\r\n")
		if len(text) > 2000 {
			text = text[:2000]
			for !utf8.ValidString(text) && len(text) > 0 {
				text = text[:len(text)-1]
			}
			text += "…"
		}
		column := 1
		if len(event.Data.Submatches) > 0 {
			column += event.Data.Submatches[0].Start
		}
		result.Matches = append(result.Matches, ContentMatch{Path: path, Line: event.Data.LineNumber, Column: column, Text: text})
	}
	if reader.N == 0 || scanner.Err() != nil {
		result.Truncated = true
	}
	// Always stop and reap the process, including result/output budget exits.
	stopped := result.Truncated || decodeErr != nil
	if stopped {
		cancel()
		stdout.Close()
	}
	waitErr := cmd.Wait()
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	if decodeErr != nil {
		return nil, fmt.Errorf("decode rg results: %w", decodeErr)
	}
	if runCtx.Err() != nil && !stopped {
		result.Truncated = true
		return result, nil
	}
	var exit *exec.ExitError
	if waitErr != nil && !stopped && !(errors.As(waitErr, &exit) && exit.ExitCode() == 1) {
		return nil, fmt.Errorf("content search: %w: %s", waitErr, stderr.buffer.String())
	}
	return result, nil
}
