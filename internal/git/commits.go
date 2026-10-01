package git

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Commit is a plain-data commit record, free of any UI/layout state.
type Commit struct {
	Hash        string
	ShortHash   string
	Message     string
	Author      string
	Date        time.Time
	Parents     []string
	Refs        []string
	Decorations []RefDecoration
	Branch      string
	IsMerge     bool
	IsStash     bool
	Ahead       int
	Behind      int
}

// Graph is the commit graph as plain data (newest first) with a hash lookup.
type Graph struct {
	Commits       []*Commit
	CommitMap     map[string]*Commit
	CurrentBranch string
}

func (g *Graph) addCommit(c *Commit) {
	g.Commits = append(g.Commits, c)
	g.CommitMap[c.Hash] = c
}

// LoadGraph loads the commit graph as plain data.
func (r *Repository) LoadGraph(limit int) (*Graph, error) {
	status, err := r.LoadRepositoryStatus()
	if err != nil {
		return nil, err
	}
	return r.LoadGraphWithStatus(limit, status)
}

// LoadGraphWithStatus reuses the status observed by a desktop refresh.
func (r *Repository) LoadGraphWithStatus(limit int, status *RepositoryStatus) (*Graph, error) {
	headHash := status.Head

	// Format: hash|short_hash|subject|author|timestamp|parents|refs
	format := "%H|%h|%s|%an|%at|%P|%D"

	// Use git log with date order for chronological display
	// HEAD first ensures current branch gets priority in layout
	// Exclude stash refs - they are loaded separately when toggled
	args := []string{"log"}
	if headHash != "" {
		args = append(args, headHash)
	}
	args = append(args, "--exclude=refs/stash", "--all", "--date-order", "--max-count="+strconv.Itoa(limit), "--format="+format, "--")
	out, err := r.run(args...)
	if err != nil {
		return nil, err
	}

	graph := &Graph{CommitMap: make(map[string]*Commit)}
	graph.CurrentBranch = status.Branch

	remotes := make(map[string]bool)
	names, err := r.ReadRemoteNames()
	if err != nil {
		return nil, err
	}
	for _, name := range names {
		remotes[name] = true
	}

	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}

		parts := strings.SplitN(line, "|", 7)
		if len(parts) < 6 {
			continue
		}

		timestamp, _ := strconv.ParseInt(parts[4], 10, 64)
		parents := strings.Fields(parts[5])

		var refs []string
		var decorations []RefDecoration
		if len(parts) > 6 && parts[6] != "" {
			refs = parseRefs(parts[6])
			decorations = parseDecorations(parts[6], remotes)
		}

		// Determine branch name from refs
		branch := ""
		for _, ref := range refs {
			if !strings.HasPrefix(ref, "origin/") && ref != "HEAD" {
				branch = ref
				break
			}
		}

		commit := &Commit{
			Hash:        parts[0],
			ShortHash:   parts[1],
			Message:     parts[2],
			Author:      parts[3],
			Date:        time.Unix(timestamp, 0),
			Parents:     parents,
			IsMerge:     len(parents) > 1,
			Refs:        refs,
			Decorations: decorations,
			Branch:      branch,
		}

		// Mark if this is the HEAD commit
		if parts[0] == headHash {
			hasHead := false
			for _, r := range commit.Refs {
				if r == "HEAD" {
					hasHead = true
					break
				}
			}
			if !hasHead {
				commit.Refs = append([]string{"HEAD"}, commit.Refs...)
			}
			// Detached HEAD carries no branch decoration — surface it explicitly.
			hasHeadDec := false
			for _, d := range commit.Decorations {
				if d.Kind == "head" || d.IsHead {
					hasHeadDec = true
					break
				}
			}
			if !hasHeadDec {
				commit.Decorations = append([]RefDecoration{{Name: "HEAD", Kind: "head"}}, commit.Decorations...)
			}
		}

		graph.addCommit(commit)
	}

	// Populate ahead/behind counts for branch tips
	if err := r.populateAheadBehind(graph); err != nil {
		return nil, err
	}

	return graph, nil
}

// populateAheadBehind sets ahead/behind counts for local branch tips. One
// for-each-ref resolves all branches, vs spawning a rev-list process per branch.
func (r *Repository) populateAheadBehind(graph *Graph) error {
	// %00 (NUL) delimits name from track; nobracket yields "ahead 2, behind 1".
	out, err := r.run("for-each-ref",
		"--format=%(refname:short)%00%(upstream:track,nobracket)", "refs/heads/")
	if err != nil {
		return err
	}

	type aheadBehind struct{ ahead, behind int }
	counts := make(map[string]aheadBehind)
	for line := range strings.SplitSeq(out, "\n") {
		if line == "" {
			continue
		}
		name, track, ok := strings.Cut(line, "\x00")
		if !ok {
			continue
		}
		a, b := parseTrack(track)
		counts[name] = aheadBehind{a, b}
	}

	for _, commit := range graph.Commits {
		if len(commit.Refs) == 0 {
			continue
		}
		var localBranch string
		for _, ref := range commit.Refs {
			if ref != "HEAD" && !strings.HasPrefix(ref, "origin/") {
				localBranch = ref
				break
			}
		}
		if localBranch == "" {
			continue
		}
		if c, ok := counts[localBranch]; ok {
			commit.Ahead = c.ahead
			commit.Behind = c.behind
		}
	}
	return nil
}

// parseTrack parses git's upstream:track output, e.g. "ahead 2, behind 1".
// "", "gone", and in-sync all yield 0, 0.
func parseTrack(s string) (ahead, behind int) {
	for _, part := range strings.Split(s, ", ") {
		if n, ok := strings.CutPrefix(part, "ahead "); ok {
			ahead, _ = strconv.Atoi(n)
		} else if n, ok := strings.CutPrefix(part, "behind "); ok {
			behind, _ = strconv.Atoi(n)
		}
	}
	return
}

// LoadCommit loads detailed information about a single commit.
// CommitDetail contains detailed commit information.
type CommitDetail struct {
	Hash           string
	ShortHash      string
	Subject        string
	Body           string
	Author         string
	AuthorEmail    string
	AuthorDate     time.Time
	Committer      string
	CommitterEmail string
	CommitterDate  time.Time
	Parents        []string
	ParentSubjects []string // Subject lines of parent commits
	Stats          CommitStats
	Files          []ChangedFile
}

// GPGSignature contains GPG signature verification info.
type GPGSignature struct {
	Signed     bool
	Valid      bool
	KeyID      string
	Signer     string
	TrustLevel string
}

// CommitStats contains commit statistics.
type CommitStats struct {
	FilesChanged int
	Insertions   int
	Deletions    int
}

// ChangedFile represents a file changed in a commit.
type ChangedFile struct {
	Status     FileStatus
	Path       string
	OldPath    string // For renames
	Binary     bool
	Insertions int
	Deletions  int
}

var hexQuery = regexp.MustCompile(`^[0-9a-fA-F]{4,40}$`)

// parseSearchLine parses one "%H|%h|%s|%an|%at|%P" log line.
func parseSearchLine(line string) *Commit {
	parts := strings.SplitN(line, "|", 6)
	if len(parts) < 6 {
		return nil
	}
	timestamp, _ := strconv.ParseInt(parts[4], 10, 64)
	parents := strings.Fields(parts[5])
	return &Commit{
		Hash:      parts[0],
		ShortHash: parts[1],
		Message:   parts[2],
		Author:    parts[3],
		Date:      time.Unix(timestamp, 0),
		Parents:   parents,
		IsMerge:   len(parents) > 1,
	}
}

// SearchCommits searches commits by hash prefix, message, and author
// (case-insensitive). A hash match ranks first; the rest are deduped in
// message-then-author order, capped at limit.
func (r *Repository) SearchCommits(query string, limit int) ([]*Commit, error) {
	format := "%H|%h|%s|%an|%at|%P"
	max := "--max-count=" + strconv.Itoa(limit)

	var commits []*Commit
	seen := map[string]bool{}
	add := func(out string) {
		for _, line := range strings.Split(out, "\n") {
			if line == "" {
				continue
			}
			if c := parseSearchLine(line); c != nil && !seen[c.Hash] {
				seen[c.Hash] = true
				commits = append(commits, c)
			}
		}
	}

	// hash prefix first — an exact-id lookup is the strongest intent signal
	if hexQuery.MatchString(query) {
		if out, err := r.run("log", "-1", "--format="+format, query); err == nil {
			add(out)
		}
	}

	byMessage, err := r.run("log", "--all", max, "--regexp-ignore-case", "--grep="+query, "--format="+format)
	if err != nil {
		return nil, err
	}
	add(byMessage)

	byAuthor, err := r.run("log", "--all", max, "--regexp-ignore-case", "--author="+query, "--format="+format)
	if err != nil {
		return nil, err
	}
	add(byAuthor)

	if len(commits) > limit {
		commits = commits[:limit]
	}
	return commits, nil
}

// LoadStashes loads stash entries as GitCommits.
func (r *Repository) LoadStashes() ([]*Commit, error) {
	// Get all stash info in a single command
	out, err := r.run("stash", "list", "--format=%gd|%H|%P|%at|%an|%s")
	if err != nil {
		return nil, err // No stashes is a successful empty response, not a command failure.
	}

	var stashes []*Commit
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}

		// The subject goes last so a "|" inside a stash message stays intact.
		parts := strings.SplitN(line, "|", 6)
		if len(parts) < 6 {
			continue
		}

		stashRef := parts[0]
		hash := parts[1]
		// A stash commit's first parent is the commit it was made on; the
		// index and untracked-file parents are storage details, not history.
		var parents []string
		if fields := strings.Fields(parts[2]); len(fields) > 0 {
			parents = fields[:1]
		}
		timestamp, _ := strconv.ParseInt(strings.TrimSpace(parts[3]), 10, 64)
		author := strings.TrimSpace(parts[4])
		message := parts[5]

		shortHash := hash
		if len(hash) > 7 {
			shortHash = hash[:7]
		}

		stash := &Commit{
			Hash:      hash,
			ShortHash: shortHash,
			Message:   message,
			Author:    author,
			Date:      time.Unix(timestamp, 0),
			Parents:   parents,
			IsStash:   true,
			Refs:      []string{stashRef},
		}

		stashes = append(stashes, stash)
	}

	return stashes, nil
}

// parseRefs parses the ref string from git log.
// RefDecoration is a single ref pointing at a commit, classified so the UI can
// colour it and offer the right actions without re-deriving the kind.
type RefDecoration struct {
	Name   string // short name: "main", "origin/main", "v1.2.0"
	Kind   string // "head" (detached) | "branch" | "remote" | "tag"
	IsHead bool   // local branch that HEAD is currently on
}

// parseDecorations classifies the raw %D decoration string, preserving the
// tag:/HEAD-> markers that parseRefs discards. remotes lets it tell a remote
// tracking ref ("origin/x") from a local branch that merely contains a slash.
func parseDecorations(refStr string, remotes map[string]bool) []RefDecoration {
	if refStr == "" {
		return nil
	}
	var decs []RefDecoration
	for _, ref := range strings.Split(refStr, ", ") {
		ref = strings.TrimSpace(ref)
		if ref == "" || strings.Contains(ref, "stash") {
			continue
		}
		switch {
		case ref == "HEAD":
			decs = append(decs, RefDecoration{Name: "HEAD", Kind: "head"})
		case strings.HasPrefix(ref, "HEAD -> "):
			decs = append(decs, RefDecoration{Name: strings.TrimPrefix(ref, "HEAD -> "), Kind: "branch", IsHead: true})
		case strings.HasPrefix(ref, "tag: "):
			decs = append(decs, RefDecoration{Name: strings.TrimPrefix(ref, "tag: "), Kind: "tag"})
		default:
			kind := "branch"
			if prefix, _, ok := strings.Cut(ref, "/"); ok && remotes[prefix] {
				kind = "remote"
			}
			decs = append(decs, RefDecoration{Name: ref, Kind: kind})
		}
	}
	return decs
}

func parseRefs(refStr string) []string {
	if refStr == "" {
		return nil
	}

	var refs []string
	for _, ref := range strings.Split(refStr, ", ") {
		ref = strings.TrimSpace(ref)
		ref = strings.TrimPrefix(ref, "HEAD -> ")
		ref = strings.TrimPrefix(ref, "tag: ")
		// Skip stash-related refs
		if ref != "" && !strings.Contains(ref, "stash") {
			refs = append(refs, ref)
		}
	}
	return refs
}
