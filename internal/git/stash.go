package git

import (
	"fmt"
	"regexp"
	"strings"
)

// Stash represents a stash entry.
type Stash struct {
	Index   int    // stash@{0}, stash@{1}, etc.
	Branch  string // Branch where stash was created
	Message string // Stash message
}

// ListStashes returns all stash entries.
func (r *Repository) ListStashes() ([]Stash, error) {
	out, err := r.run("stash", "list")
	if err != nil {
		return nil, err
	}

	return parseStashList(out), nil
}

// parseStashList parses git stash list output.
// Format: stash@{0}: On branch-name: message
// Or: stash@{0}: WIP on branch-name: hash message
func parseStashList(output string) []Stash {
	var stashes []Stash

	// Match: stash@{N}: (On|WIP on) branch-name: message
	re := regexp.MustCompile(`^stash@\{(\d+)\}: (?:On|WIP on) ([^:]+): (.+)$`)

	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		matches := re.FindStringSubmatch(line)
		if matches == nil {
			// Try simpler format
			simpleRe := regexp.MustCompile(`^stash@\{(\d+)\}: (.+)$`)
			matches = simpleRe.FindStringSubmatch(line)
			if matches != nil {
				idx := 0
				for _, c := range matches[1] {
					idx = idx*10 + int(c-'0')
				}
				stashes = append(stashes, Stash{
					Index:   idx,
					Message: matches[2],
				})
			}
			continue
		}

		idx := 0
		for _, c := range matches[1] {
			idx = idx*10 + int(c-'0')
		}

		stashes = append(stashes, Stash{
			Index:   idx,
			Branch:  matches[2],
			Message: matches[3],
		})
	}

	return stashes
}

// StashPush creates a new stash.
func (r *Repository) StashPush(message string, includeUntracked bool) error {
	args := []string{"stash", "push"}
	if message != "" {
		args = append(args, "-m", message)
	}
	if includeUntracked {
		args = append(args, "--include-untracked")
	}
	_, err := r.run(args...)
	return err
}

// StashStaged creates a new stash with only the staged changes.
func (r *Repository) StashStaged(message string) error {
	args := []string{"stash", "push", "--staged"}
	if message != "" {
		args = append(args, "-m", message)
	}
	_, err := r.run(args...)
	return err
}

// StashPop pops the top stash.
func (r *Repository) StashPop() error {
	_, err := r.run("stash", "pop")
	return err
}

// StashPopIndex pops a specific stash by index.
func (r *Repository) StashPopIndex(index int) error {
	_, err := r.run("stash", "pop", stashRef(index))
	return err
}

// StashApply applies the top stash without removing it.
func (r *Repository) StashApply() error {
	_, err := r.run("stash", "apply")
	return err
}

// StashApplyIndex applies a specific stash by index without removing it.
func (r *Repository) StashApplyIndex(index int) error {
	_, err := r.run("stash", "apply", stashRef(index))
	return err
}

// StashDrop drops the top stash.
func (r *Repository) StashDrop() error {
	_, err := r.run("stash", "drop")
	return err
}

// StashDropIndex drops a specific stash by index.
func (r *Repository) StashDropIndex(index int) error {
	_, err := r.run("stash", "drop", stashRef(index))
	return err
}

// StashClear removes all stashes.
func (r *Repository) StashClear() error {
	_, err := r.run("stash", "clear")
	return err
}

// StashShow shows the diff of a stash entry.
func (r *Repository) StashShow(index int) (string, error) {
	return r.run("stash", "show", "-p", stashRef(index))
}

// StashFiles returns the per-file numstat for a stash entry, so callers can
// render file chips instead of a raw diff. Untracked files captured in the stash
// are included.
func (r *Repository) StashFiles(index int) ([]FileChurn, error) {
	out, err := r.run("stash", "show", "--include-untracked", "--numstat", "-z", "-M", stashRef(index))
	if err != nil {
		return nil, err
	}
	return parseChurn(out), nil
}

// StashCheckoutFiles restores specific files from a stash into the worktree
// without applying (or dropping) the whole stash. This overwrites the worktree
// copy of each path with the stashed version — it is a checkout, not a merge.
func (r *Repository) StashCheckoutFiles(index int, paths []string) error {
	if len(paths) == 0 {
		return fmt.Errorf("no files selected")
	}
	args := append([]string{"checkout", stashRef(index), "--"}, paths...)
	_, err := r.run(args...)
	return err
}

// StashBranch creates a branch from a stash.
func (r *Repository) StashBranch(branchName string, index int) error {
	_, err := r.run("stash", "branch", branchName, stashRef(index))
	return err
}

// stashRef converts an index to a stash reference.
func stashRef(index int) string {
	return fmt.Sprintf("stash@{%d}", index)
}
