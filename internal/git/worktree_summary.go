package git

import (
	"fmt"
	"strconv"
	"strings"
	"sync"
)

// FileDelta contains counts only: no patch text, hunks, or line objects.
type FileDelta struct {
	Path    string
	OldPath string
	Added   int
	Deleted int
	Binary  bool
}

type WorktreeSummary struct {
	Entries []StatusEntry
	Working []FileDelta
	Staged  []FileDelta
}

func (r *Repository) LoadWorktreeSummary() (*WorktreeSummary, error) {
	return r.loadWorktreeSummary(r.Status)
}

func (r *Repository) loadWorktreeSummary(status func() ([]StatusEntry, error)) (*WorktreeSummary, error) {
	var summary WorktreeSummary
	var statusErr, workingErr, stagedErr error
	var wg sync.WaitGroup
	wg.Add(3)
	go func() { defer wg.Done(); summary.Entries, statusErr = status() }()
	go func() { defer wg.Done(); summary.Working, workingErr = r.worktreeNumstat(false) }()
	go func() { defer wg.Done(); summary.Staged, stagedErr = r.worktreeNumstat(true) }()
	wg.Wait()
	for _, err := range []error{statusErr, workingErr, stagedErr} {
		if err != nil {
			return nil, err
		}
	}
	return &summary, nil
}

func (r *Repository) worktreeNumstat(staged bool) ([]FileDelta, error) {
	args := []string{"diff", "--numstat", "-z", "--no-ext-diff", "--no-textconv", "--no-color"}
	if staged {
		args = append(args, "--cached")
	}
	out, err := r.run(args...)
	if err != nil {
		return nil, err
	}
	return parseNumstatZ(out)
}

func parseNumstatZ(out string) ([]FileDelta, error) {
	files := make([]FileDelta, 0)
	for out != "" {
		record, rest, ok := strings.Cut(out, "\x00")
		if !ok {
			return nil, fmt.Errorf("unterminated numstat record")
		}
		out = rest
		added, tail, ok := strings.Cut(record, "\t")
		if !ok {
			return nil, fmt.Errorf("missing numstat additions")
		}
		deleted, path, ok := strings.Cut(tail, "\t")
		if !ok {
			return nil, fmt.Errorf("missing numstat path")
		}
		file := FileDelta{Path: path, Binary: added == "-" && deleted == "-"}
		if path == "" {
			file.OldPath, out, ok = strings.Cut(out, "\x00")
			if !ok || file.OldPath == "" {
				return nil, fmt.Errorf("missing numstat rename source")
			}
			file.Path, out, ok = strings.Cut(out, "\x00")
			if !ok || file.Path == "" {
				return nil, fmt.Errorf("missing numstat rename destination")
			}
		}
		if !file.Binary {
			var err error
			file.Added, err = strconv.Atoi(added)
			if err != nil || file.Added < 0 {
				return nil, fmt.Errorf("invalid numstat additions")
			}
			file.Deleted, err = strconv.Atoi(deleted)
			if err != nil || file.Deleted < 0 {
				return nil, fmt.Errorf("invalid numstat deletions")
			}
		}
		files = append(files, file)
	}
	return files, nil
}
