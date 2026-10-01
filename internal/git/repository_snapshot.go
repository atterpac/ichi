package git

import (
	"fmt"
	"strings"
)

type RepositorySnapshot struct {
	Worktree     *WorktreeSummary
	Branch       string
	Head         string
	ShortHead    string
	DetachedHead bool
	HasUpstream  bool
	Ahead        int
	Behind       int
	StashCount   int
	Remotes      []RemoteAddress
}

type RemoteAddress struct {
	Name string
	URL  string
}

// RepositoryStatus is one error-returning status observation. Empty Head and
// HasUpstream=false are legitimate unborn/missing-upstream states; a failed Git
// command returns an error instead of a clean/detached-looking value.
type RepositoryStatus struct {
	Entries      []StatusEntry
	Branch       string
	Head         string
	DetachedHead bool
	HasUpstream  bool
	Ahead        int
	Behind       int
	StashCount   int
}

func (r *Repository) LoadRepositoryStatus() (*RepositoryStatus, error) {
	out, err := r.run("status", "--porcelain=v2", "-z", "--branch", "--ahead-behind", "--show-stash", "--untracked-files=all")
	if err != nil {
		return nil, err
	}
	status := &RepositoryStatus{}
	if err := status.parseHeaders(out); err != nil {
		return nil, err
	}
	status.Entries = parseStatusV2(out)
	return status, nil
}

// LoadRepositorySnapshot shares status and numstat data with per-file summaries.
// Completed snapshots are not cached: the next refresh sees external changes.
func (r *Repository) LoadRepositorySnapshot() (*RepositorySnapshot, error) {
	snapshot := &RepositorySnapshot{Remotes: []RemoteAddress{}}
	var status *RepositoryStatus
	summary, err := r.loadWorktreeSummary(func() ([]StatusEntry, error) {
		var err error
		status, err = r.LoadRepositoryStatus()
		if err != nil {
			return nil, err
		}
		return status.Entries, nil
	})
	if err != nil {
		return nil, err
	}
	snapshot.Branch = status.Branch
	snapshot.Head = status.Head
	snapshot.DetachedHead = status.DetachedHead
	snapshot.HasUpstream = status.HasUpstream
	snapshot.Ahead, snapshot.Behind = status.Ahead, status.Behind
	snapshot.StashCount = status.StashCount

	snapshot.Worktree = summary
	if snapshot.Head != "" {
		// Resolve the observed OID, not HEAD again, and preserve configured abbreviation.
		out, err := r.run("rev-parse", "--short", snapshot.Head)
		if err != nil {
			return nil, err
		}
		snapshot.ShortHead = strings.TrimSpace(out)
	}
	out, err := r.run("remote", "-v")
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	for _, line := range strings.Split(out, "\n") {
		fetch := strings.LastIndex(line, " (fetch)")
		if fetch < 0 {
			continue
		}
		name, url, ok := strings.Cut(line[:fetch], "\t")
		if ok && !seen[name] {
			snapshot.Remotes = append(snapshot.Remotes, RemoteAddress{Name: name, URL: url})
			seen[name] = true
		}
	}
	return snapshot, nil
}

func (s *RepositoryStatus) parseHeaders(out string) error {
	var haveHead, haveBranch bool
	for strings.HasPrefix(out, "# ") {
		record, rest, ok := strings.Cut(out, "\x00")
		if !ok {
			return fmt.Errorf("unterminated status header")
		}
		out = rest
		key, value, _ := strings.Cut(record[2:], " ")
		switch key {
		case "branch.oid":
			haveHead = true
			if value != "(initial)" {
				s.Head = value
			}
		case "branch.head":
			haveBranch = true
			s.DetachedHead = value == "(detached)"
			s.Branch = value
			if s.DetachedHead {
				s.Branch = "HEAD"
			}
		case "branch.ab":
			if n, err := fmt.Sscanf(value, "+%d -%d", &s.Ahead, &s.Behind); err != nil || n != 2 {
				return fmt.Errorf("invalid upstream counts")
			}
			s.HasUpstream = true // A configured-but-missing upstream has no branch.ab record.
		case "stash":
			if n, err := fmt.Sscanf(value, "%d", &s.StashCount); err != nil || n != 1 {
				return fmt.Errorf("invalid stash count")
			}
		}
	}
	if !haveHead || !haveBranch {
		return fmt.Errorf("missing repository status headers")
	}
	return nil
}

func (s *WorktreeSummary) ChangeCounts() (staged, working ChangeStats) {
	for _, f := range s.Staged {
		staged.Files++
		staged.Insertions += f.Added
		staged.Deletions += f.Deleted
	}
	for _, f := range s.Working {
		working.Files++
		working.Insertions += f.Added
		working.Deletions += f.Deleted
	}
	for _, entry := range s.Entries {
		if entry.IsUntracked {
			working.Untracked++
		}
	}
	return
}
