package services

import (
	"context"
	"sort"
	"time"

	"github.com/atterpac/ichi/internal/git"
)

const defaultGraphColumnCapacity = 12
const workingChangesHash = "__ichi_working_changes__"

type GraphLayout struct {
	Rows          []GraphLayoutRow
	LaneCount     int
	CurrentBranch string
	Info          *RepoInfo          `json:",omitempty"`
	Segments      []GraphRailSegment `json:",omitempty"`
}

// A rail spans [FromRow, ToRow); nodes and routes own their row's stems.
// Encoding each rail once prevents the old rows-times-lanes bridge payload.
type GraphRailSegment struct {
	Lane       int
	FromRow    int
	ToRow      int
	ColorID    int
	CommitHash string
	// Dashed marks a stash's link to its base commit, which is not history.
	Dashed bool `json:",omitempty"`
}

type GraphLayoutRow struct {
	Commit *git.Commit
	Lanes  []GraphLane
	// Routes records every loaded parent edge in this row's coordinates.
	// Lanes hold node/through-rail glyphs; the SVG renderer draws these routes
	// independently so a crossing cannot steal another edge's color or identity.
	Routes []GraphRoute
}

// GraphRoute starts at this row's commit and joins the rail for ParentHash.
// Routes are ordered farthest first to keep new intermediate rails from
// crossing longer routes in the same row. Equal-lane routes use the node stem.
type GraphRoute struct {
	ParentHash string
	FromLane   int
	ToLane     int
	ColorID    int
	Continues  bool
	Crossings  []int
	Dashed     bool `json:",omitempty"`
}

type GraphLane struct {
	Column     *int `json:",omitempty"`
	Glyphs     []GraphGlyph
	ColorID    int
	CommitHash string
}

type GraphGlyph struct {
	Kind          string
	ColorID       int
	CommitHash    string
	ConnectTop    bool
	ConnectBottom bool
}

type graphRail struct {
	hash     string
	colorID  int
	startRow int
	dashed   bool
}

func (s *GraphService) LoadGraphLayout(ctx context.Context, limit int, includeStashes bool) (*GraphLayout, error) {
	repo, err := s.state.repoContext(ctx)
	if err != nil {
		return nil, err
	}

	if limit <= 0 {
		limit = 1000
	}
	limit = min(limit, 5000)
	info, err := (&RepoService{state: s.state}).Info(ctx)
	if err != nil {
		return nil, err
	}
	status := &git.RepositoryStatus{Entries: info.worktree.Entries, Branch: info.Branch, Head: info.Head}
	graph, err := repo.WithReadLimit(16<<20, 100000).LoadGraphWithStatus(limit, status)
	if err != nil {
		return nil, err
	}
	if includeStashes {
		// Stashes are optional decoration: a failed read must not hide history.
		if stashes, err := repo.LoadStashes(); err == nil {
			insertStashes(graph, stashes)
		}
	}
	if info.HasUncommitted {
		prependWorkingChanges(graph, info.Head)
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	layout := layoutGitGraphCompact(graph, defaultGraphColumnCapacity)
	layout.Info = info
	return layout, nil
}

func prependWorkingChanges(graph *git.Graph, headHash string) {
	if graph == nil || graph.CommitMap == nil || headHash == "" || graph.CommitMap[headHash] == nil {
		return
	}

	working := &git.Commit{
		Hash:      workingChangesHash,
		ShortHash: "work",
		Message:   "Working Changes",
		Author:    "worktree",
		Date:      time.Now(),
		Parents:   []string{headHash},
	}
	graph.Commits = append([]*git.Commit{working}, graph.Commits...)
	graph.CommitMap[working.Hash] = working
}

// insertStashes places each stash in date order but always above its base
// commit, so the layout's child-before-parent walk links it to that base.
// A stash whose base is outside the loaded window is skipped: without its
// base it would float with no meaning in the graph.
func insertStashes(graph *git.Graph, stashes []*git.Commit) {
	if graph == nil || graph.CommitMap == nil {
		return
	}
	for _, stash := range stashes {
		if stash == nil || len(stash.Parents) == 0 || graph.CommitMap[stash.Parents[0]] == nil || graph.CommitMap[stash.Hash] != nil {
			continue
		}
		at := len(graph.Commits)
		for i, commit := range graph.Commits {
			if commit.Hash == stash.Parents[0] || stash.Date.After(commit.Date) {
				at = i
				break
			}
		}
		graph.Commits = append(graph.Commits[:at], append([]*git.Commit{stash}, graph.Commits[at:]...)...)
		graph.CommitMap[stash.Hash] = stash
	}
}

// layoutGitGraph consumes Git's child-before-parent log order. initialColumns
// is an allocation hint, never a topology limit: the viewport handles clipping.
func layoutGitGraph(graph *git.Graph, initialColumns int) *GraphLayout {
	return buildGraphLayout(graph, initialColumns, false)
}
func layoutGitGraphCompact(graph *git.Graph, initialColumns int) *GraphLayout {
	return buildGraphLayout(graph, initialColumns, true)
}
func buildGraphLayout(graph *git.Graph, initialColumns int, compact bool) *GraphLayout {
	layout := &GraphLayout{Rows: []GraphLayoutRow{}, Segments: []GraphRailSegment{}}
	if graph == nil {
		return layout
	}
	layout.CurrentBranch = graph.CurrentBranch
	if initialColumns <= 0 {
		initialColumns = defaultGraphColumnCapacity
	}

	// Use the visible list as the authority, not CommitMap: parents outside a
	// limited history window must not leave dangling rails at its bottom.
	positions := make(map[string]int, len(graph.Commits))
	commits := make([]*git.Commit, 0, len(graph.Commits))
	for _, commit := range graph.Commits {
		if commit == nil {
			continue
		}
		if _, duplicate := positions[commit.Hash]; duplicate {
			continue
		}
		positions[commit.Hash] = len(commits)
		commits = append(commits, commit)
	}
	active := make([]*graphRail, 0, initialColumns)
	targets := make(map[string]int)
	nextColor := 0
	newColor := func() int { id := nextColor; nextColor++; return id }
	freeLane := func(reserved int) int {
		for lane, rail := range active {
			if rail == nil && lane != reserved {
				return lane
			}
		}
		active = append(active, nil)
		return len(active) - 1
	}

	for index, commit := range commits {
		col, incoming := targets[commit.Hash]
		if !incoming {
			col = freeLane(-1)
		}
		nodeColor := 0
		if incoming {
			nodeColor = active[col].colorID
		} else {
			nodeColor = newColor()
		}
		row := GraphLayoutRow{Commit: commit, Routes: []GraphRoute{}}
		nodeLane := emptyGraphLane()
		nodeLane.ColorID, nodeLane.CommitHash = nodeColor, commit.Hash
		nodeLane.Glyphs[1] = GraphGlyph{Kind: nodeGlyphKind(commit), ColorID: nodeColor, CommitHash: commit.Hash, ConnectTop: incoming}
		if compact {
			column := col
			nodeLane.Column = &column
			if incoming && active[col].startRow < index {
				rail := active[col]
				layout.Segments = append(layout.Segments, GraphRailSegment{Lane: col, FromRow: rail.startRow, ToRow: index, ColorID: rail.colorID, CommitHash: rail.hash, Dashed: rail.dashed})
			}
		} else {
			for _, rail := range active {
				lane := emptyGraphLane()
				if rail != nil {
					lane.ColorID, lane.CommitHash = rail.colorID, rail.hash
					lane.Glyphs[1] = GraphGlyph{Kind: "vertical", ColorID: rail.colorID, CommitHash: rail.hash}
				}
				row.Lanes = append(row.Lanes, lane)
			}
			row.Lanes[col] = nodeLane
		}
		active[col] = nil
		delete(targets, commit.Hash)

		seen := make(map[string]bool)
		for parentIndex, hash := range commit.Parents {
			parentRow, loaded := positions[hash]
			if !loaded || parentRow <= index || seen[hash] {
				continue
			}
			seen[hash] = true
			target, continues := targets[hash]
			if !continues {
				if parentIndex == 0 {
					target = col
				} else {
					target = freeLane(col)
				}
				colorID := nodeColor
				if target != col {
					colorID = newColor()
				}
				active[target] = &graphRail{hash: hash, colorID: colorID, startRow: index + 1, dashed: commit.IsStash}
				targets[hash] = target
				if !compact {
					for len(row.Lanes) <= target {
						row.Lanes = append(row.Lanes, emptyGraphLane())
					}
					if target != col {
						row.Lanes[target].ColorID, row.Lanes[target].CommitHash = colorID, hash
					}
				}
			}
			if rail := active[target]; continues && rail.dashed && !commit.IsStash {
				// Real history now shares this rail: dashes stop where it joins.
				if compact && rail.startRow <= index {
					layout.Segments = append(layout.Segments, GraphRailSegment{Lane: target, FromRow: rail.startRow, ToRow: index + 1, ColorID: rail.colorID, CommitHash: rail.hash, Dashed: true})
				}
				rail.startRow, rail.dashed = index+1, false
			}
			route := GraphRoute{ParentHash: hash, FromLane: col, ToLane: target, ColorID: active[target].colorID, Continues: continues, Crossings: []int{}, Dashed: commit.IsStash}
			if target == col {
				nodeLane.Glyphs[1].ConnectBottom = true
				if !compact {
					row.Lanes[col].Glyphs[1].ConnectBottom = true
				}
			} else {
				// Only pre-existing through rails can intersect this horizontal
				// route. Newly opened rails are ordered below longer routes.
				lo, hi := min(col, target), max(col, target)
				for lane := lo + 1; lane < hi; lane++ {
					if active[lane] != nil && active[lane].startRow <= index {
						route.Crossings = append(route.Crossings, lane)
					}
				}
			}
			row.Routes = append(row.Routes, route)
		}
		sort.SliceStable(row.Routes, func(i, j int) bool {
			distance := func(route GraphRoute) int {
				return max(route.FromLane, route.ToLane) - min(route.FromLane, route.ToLane)
			}
			return distance(row.Routes[i]) > distance(row.Routes[j])
		})
		if compact {
			row.Lanes = []GraphLane{nodeLane}
		}
		layout.Rows = append(layout.Rows, row)
	}
	layout.LaneCount = len(active)
	for i := range layout.Rows {
		if compact {
			continue
		}
		for len(layout.Rows[i].Lanes) < layout.LaneCount {
			layout.Rows[i].Lanes = append(layout.Rows[i].Lanes, emptyGraphLane())
		}
	}
	return layout
}

func emptyGraphLane() GraphLane {
	return GraphLane{Glyphs: []GraphGlyph{{Kind: "empty"}, {Kind: "empty"}, {Kind: "empty"}}}
}

func isNodeGlyph(kind string) bool {
	return kind == "node" || kind == "head-node" || kind == "merge-node" || kind == "stash-node" || kind == "unstaged-node"
}

func nodeGlyphKind(commit *git.Commit) string {
	if commit.Hash == workingChangesHash {
		return "unstaged-node"
	}
	if commit.IsStash {
		return "stash-node"
	}
	for _, ref := range commit.Refs {
		if ref == "HEAD" {
			return "head-node"
		}
	}
	if commit.IsMerge {
		return "merge-node"
	}
	return "node"
}
