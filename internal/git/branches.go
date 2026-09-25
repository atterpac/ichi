package git

import (
	"fmt"
	"strconv"
	"strings"
)

// Branch represents a git branch.
type Branch struct {
	Name       string
	IsRemote   bool
	IsCurrent  bool
	IsTracking bool
	Upstream   string
	Ahead      int
	Behind     int
	LastCommit string // Short hash of last commit
	LastMsg    string // Subject of last commit
}

// ListBranches returns all branches (local and remote).
func (r *Repository) ListBranches() ([]Branch, error) {
	// Get local branches with tracking info
	// Format: refname:short|upstream:short|push:track|objectname:short|subject|HEAD
	format := "%(refname:short)|%(upstream:short)|%(upstream:track)|%(objectname:short)|%(subject)|%(HEAD)"
	out, err := r.run("for-each-ref", "--format="+format, "refs/heads/")
	if err != nil {
		return nil, err
	}

	var branches []Branch
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}

		parts := strings.SplitN(line, "|", 6)
		if len(parts) < 5 {
			continue
		}

		branch := Branch{
			Name:       parts[0],
			Upstream:   parts[1],
			IsTracking: parts[1] != "",
			LastCommit: parts[3],
			LastMsg:    parts[4],
			IsCurrent:  len(parts) > 5 && parts[5] == "*",
		}

		// Parse tracking info [ahead N, behind M]
		if parts[2] != "" {
			parseTrackingInfo(parts[2], &branch)
		}

		branches = append(branches, branch)
	}

	// Get remote branches
	remoteOut, err := r.run("for-each-ref", "--format=%(refname:short)|%(objectname:short)|%(subject)", "refs/remotes/")
	if err == nil {
		for _, line := range strings.Split(remoteOut, "\n") {
			if line == "" {
				continue
			}

			parts := strings.SplitN(line, "|", 3)
			if len(parts) < 3 {
				continue
			}

			// Skip HEAD pointer
			if strings.HasSuffix(parts[0], "/HEAD") {
				continue
			}

			branch := Branch{
				Name:       parts[0],
				IsRemote:   true,
				LastCommit: parts[1],
				LastMsg:    parts[2],
			}
			branches = append(branches, branch)
		}
	}

	return branches, nil
}

// ListLocalBranches returns only local branches.
func (r *Repository) ListLocalBranches() ([]Branch, error) {
	format := "%(refname:short)|%(upstream:short)|%(upstream:track)|%(objectname:short)|%(subject)|%(HEAD)"
	out, err := r.run("for-each-ref", "--format="+format, "refs/heads/")
	if err != nil {
		return nil, err
	}

	var branches []Branch
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}

		parts := strings.SplitN(line, "|", 6)
		if len(parts) < 5 {
			continue
		}

		branch := Branch{
			Name:       parts[0],
			Upstream:   parts[1],
			IsTracking: parts[1] != "",
			LastCommit: parts[3],
			LastMsg:    parts[4],
			IsCurrent:  len(parts) > 5 && parts[5] == "*",
		}

		if parts[2] != "" {
			parseTrackingInfo(parts[2], &branch)
		}

		branches = append(branches, branch)
	}

	return branches, nil
}

// ListRemoteBranches returns only remote branches.
func (r *Repository) ListRemoteBranches() ([]Branch, error) {
	out, err := r.run("for-each-ref", "--format=%(refname:short)|%(objectname:short)|%(subject)", "refs/remotes/")
	if err != nil {
		return nil, err
	}

	var branches []Branch
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}

		parts := strings.SplitN(line, "|", 3)
		if len(parts) < 3 {
			continue
		}

		// Skip HEAD pointer
		if strings.HasSuffix(parts[0], "/HEAD") {
			continue
		}

		branch := Branch{
			Name:       parts[0],
			IsRemote:   true,
			LastCommit: parts[1],
			LastMsg:    parts[2],
		}
		branches = append(branches, branch)
	}

	return branches, nil
}

// CreateBranch creates a new branch.
func (r *Repository) CreateBranch(name string) error {
	_, err := r.run("branch", name)
	return err
}

// CreateBranchAt creates a new branch at a specific commit.
func (r *Repository) CreateBranchAt(name, ref string) error {
	_, err := r.run("branch", name, ref)
	return err
}

// DeleteBranch deletes a branch.
func (r *Repository) DeleteBranch(name string, force bool) error {
	flag := "-d"
	if force {
		flag = "-D"
	}
	_, err := r.run("branch", flag, name)
	return err
}

// DeleteRemoteBranch deletes a remote branch.
func (r *Repository) DeleteRemoteBranch(remote, branch string) error {
	_, err := r.run("push", remote, "--delete", branch)
	return err
}

// RenameBranch renames a branch.
func (r *Repository) RenameBranch(oldName, newName string) error {
	_, err := r.run("branch", "-m", oldName, newName)
	return err
}

// SetUpstream sets the upstream tracking branch.
func (r *Repository) SetUpstream(local, remote string) error {
	_, err := r.run("branch", "-u", remote, local)
	return err
}

// MergeBranch merges a branch into the current branch.
func (r *Repository) MergeBranch(branch string) error {
	_, err := r.run("merge", branch)
	return err
}

// RebaseBranch rebases the current branch onto another.
func (r *Repository) RebaseBranch(onto string) error {
	_, err := r.run("rebase", onto)
	return err
}

// parseTrackingInfo parses "[ahead N, behind M]" format.
func parseTrackingInfo(info string, branch *Branch) {
	info = strings.Trim(info, "[]")
	parts := strings.Split(info, ", ")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "ahead ") {
			fields := strings.Fields(part)
			if len(fields) >= 2 {
				n := 0
				for _, ch := range fields[1] {
					if ch >= '0' && ch <= '9' {
						n = n*10 + int(ch-'0')
					}
				}
				branch.Ahead = n
			}
		}
		if strings.HasPrefix(part, "behind ") {
			fields := strings.Fields(part)
			if len(fields) >= 2 {
				n := 0
				for _, ch := range fields[1] {
					if ch >= '0' && ch <= '9' {
						n = n*10 + int(ch-'0')
					}
				}
				branch.Behind = n
			}
		}
	}
}

// Tag represents a git tag.
type Tag struct {
	Name    string
	Hash    string
	Message string
	Tagger  string
	IsAnnotated bool
}

// ListTags returns all tags.
func (r *Repository) ListTags() ([]Tag, error) {
	out, err := r.run("tag", "-l", "--format=%(refname:short)|%(objectname:short)|%(contents:subject)|%(taggername)|%(objecttype)")
	if err != nil {
		return nil, err
	}

	var tags []Tag
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}

		parts := strings.SplitN(line, "|", 5)
		if len(parts) < 2 {
			continue
		}

		tag := Tag{
			Name: parts[0],
			Hash: parts[1],
		}
		if len(parts) > 2 {
			tag.Message = parts[2]
		}
		if len(parts) > 3 {
			tag.Tagger = parts[3]
		}
		if len(parts) > 4 {
			tag.IsAnnotated = parts[4] == "tag"
		}

		tags = append(tags, tag)
	}

	return tags, nil
}

// CreateTag creates a new tag.
func (r *Repository) CreateTag(name, ref, message string) error {
	if message != "" {
		_, err := r.run("tag", "-a", name, ref, "-m", message)
		return err
	}
	_, err := r.run("tag", name, ref)
	return err
}

// DeleteTag deletes a tag.
func (r *Repository) DeleteTag(name string) error {
	_, err := r.run("tag", "-d", name)
	return err
}

// PushTag pushes a tag to a remote.
func (r *Repository) PushTag(remote, tag string) error {
	_, err := r.run("push", remote, tag)
	return err
}

// Divergence describes how two refs relate through their merge base.
type Divergence struct {
	Base    string // short hash of the merge base
	BaseMsg string // subject of the merge-base commit
	AheadA  int    // commits unique to ref a since the base
	AheadB  int    // commits unique to ref b since the base
}

// BranchDivergence locates the merge base of two refs and counts the commits
// each side has accumulated since it.
func (r *Repository) BranchDivergence(a, b string) (*Divergence, error) {
	out, err := r.run("rev-list", "--left-right", "--count", a+"..."+b)
	if err != nil {
		return nil, err
	}
	counts := strings.Fields(strings.TrimSpace(out))
	if len(counts) != 2 {
		return nil, fmt.Errorf("unexpected rev-list output: %q", out)
	}
	aheadA, err := strconv.Atoi(counts[0])
	if err != nil {
		return nil, err
	}
	aheadB, err := strconv.Atoi(counts[1])
	if err != nil {
		return nil, err
	}

	div := &Divergence{AheadA: aheadA, AheadB: aheadB}
	if base, err := r.run("merge-base", a, b); err == nil {
		baseHash := strings.TrimSpace(base)
		if short, err := r.run("rev-parse", "--short", baseHash); err == nil {
			div.Base = strings.TrimSpace(short)
		}
		if msg, err := r.run("log", "-1", "--format=%s", baseHash); err == nil {
			div.BaseMsg = strings.TrimSpace(msg)
		}
	}
	return div, nil
}

// RefCommit is a compact log row for a single ref.
type RefCommit struct {
	Hash    string
	Subject string
	When    string // relative committer date, e.g. "2 hours ago"
}

// LogRef returns the most recent commits reachable from ref, newest first.
func (r *Repository) LogRef(ref string, limit int) ([]RefCommit, error) {
	out, err := r.run("log", ref, "-n", strconv.Itoa(limit), "--format=%h%x00%s%x00%cr")
	if err != nil {
		return nil, err
	}
	var commits []RefCommit
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		parts := strings.SplitN(line, "\x00", 3)
		if len(parts) != 3 {
			continue
		}
		commits = append(commits, RefCommit{Hash: parts[0], Subject: parts[1], When: parts[2]})
	}
	return commits, nil
}

// FileChurn summarizes per-file additions and deletions.
type FileChurn struct {
	Path    string
	Added   int
	Deleted int
}

// DiffFiles returns per-file numstat for the full tree difference between two
// refs (git diff a b): additions are lines b has that a lacks. Binary files
// report zero counts.
func (r *Repository) DiffFiles(a, b string) ([]FileChurn, error) {
	out, err := r.run("diff", "--numstat", a, b)
	if err != nil {
		return nil, err
	}
	return parseChurn(out), nil
}

// parseChurn turns `git diff --numstat` output into per-file FileChurn entries.
// Binary files report "-" for both counts, which parse to 0.
func parseChurn(out string) []FileChurn {
	var churn []FileChurn
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		parts := strings.SplitN(line, "\t", 3)
		if len(parts) != 3 {
			continue
		}
		added, _ := strconv.Atoi(parts[0])
		deleted, _ := strconv.Atoi(parts[1])
		churn = append(churn, FileChurn{Path: parts[2], Added: added, Deleted: deleted})
	}
	return churn
}
