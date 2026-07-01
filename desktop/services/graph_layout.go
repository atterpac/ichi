package services

import (
	"sort"
	"strings"
	"time"

	"github.com/atterpac/ichi/internal/git"
)

const defaultGraphColumnCap = 12
const workingChangesHash = "__ichi_working_changes__"

type GraphLayout struct {
	Rows          []GraphLayoutRow
	LaneCount     int
	CurrentBranch string
}

type GraphLayoutRow struct {
	Commit *git.Commit
	Lanes  []GraphLane
}

type GraphLane struct {
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

type layoutCommit struct {
	commit *git.Commit
	column int
	row    int
	branch string
}

type graphLaneState struct {
	hasLine       bool
	hasNode       bool
	nodeTop       bool
	nodeBottom    bool
	mergeFrom     int
	mergeTo       int
	branchFrom    int
	branchInto    int
	isStartOfLine bool
	commitHash    string
	colorID       int
}

func (s *GraphService) LoadGraphLayout(limit int) (*GraphLayout, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}

	graph, err := repo.LoadGraph(limit)
	if err != nil {
		return nil, err
	}
	if repo.HasUncommitted() {
		prependWorkingChanges(graph, repo.HEAD())
	}

	return layoutGitGraph(graph, defaultGraphColumnCap), nil
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

func layoutGitGraph(graph *git.Graph, columnCap int) *GraphLayout {
	if columnCap <= 0 {
		columnCap = defaultGraphColumnCap
	}
	if graph == nil || len(graph.Commits) == 0 {
		return &GraphLayout{CurrentBranch: currentBranch(graph)}
	}

	commits := make([]*layoutCommit, 0, len(graph.Commits))
	commitMap := make(map[string]*layoutCommit, len(graph.Commits))
	for _, commit := range graph.Commits {
		if commit == nil {
			continue
		}
		lc := &layoutCommit{commit: commit, branch: commit.Branch}
		commits = append(commits, lc)
		commitMap[commit.Hash] = lc
	}

	tipHash := ""
	if graph.CurrentBranch != "" {
		for _, commit := range commits {
			for _, ref := range commit.commit.Refs {
				if ref == graph.CurrentBranch || ref == "HEAD" {
					tipHash = commit.commit.Hash
					break
				}
			}
			if tipHash != "" {
				break
			}
		}
	}

	states := make([][]*graphLaneState, len(commits))
	for i := range states {
		states[i] = make([]*graphLaneState, columnCap)
	}

	columnBranch := make(map[int]string)
	active := make(map[int]string)
	lineID := make(map[int]int)
	lineSeq := 0
	nextID := func() int {
		id := lineSeq
		lineSeq++
		return id
	}

	maxColumn := 0
	var incoming []int
	newState := func() *graphLaneState {
		return &graphLaneState{mergeFrom: -1, mergeTo: -1, branchFrom: -1, branchInto: -1}
	}

	for i, commit := range commits {
		commit.row = i
		row := states[i]
		st := func(lane int) *graphLaneState {
			if lane < 0 || lane >= columnCap {
				return newState()
			}
			state := row[lane]
			if state == nil {
				state = newState()
				row[lane] = state
			}
			return state
		}

		incoming = incoming[:0]
		for lane, hash := range active {
			if hash == commit.commit.Hash {
				incoming = append(incoming, lane)
			}
		}
		sort.Ints(incoming)

		col := 0
		switch {
		case len(incoming) > 0:
			col = incoming[0]
		case commit.commit.Hash == tipHash:
			if _, used := active[0]; !used {
				col = 0
			} else {
				col = lowestFreeGraphColumn(active, columnCap)
			}
		default:
			col = lowestFreeGraphColumn(active, columnCap)
		}
		commit.column = col

		if _, ok := lineID[col]; !ok {
			lineID[col] = nextID()
		}
		colorID := lineID[col]

		for lane, hash := range active {
			if hash == commit.commit.Hash {
				if lane != col {
					state := st(lane)
					state.branchInto = col
					state.commitHash = hash
					state.colorID = lineID[lane]
					delete(active, lane)
					delete(lineID, lane)
				}
				continue
			}
			state := st(lane)
			state.hasLine = true
			state.commitHash = hash
			state.colorID = lineID[lane]
		}

		node := st(col)
		node.hasNode = true
		for _, lane := range incoming {
			if lane == col {
				node.nodeTop = true
				break
			}
		}
		node.commitHash = commit.commit.Hash
		node.colorID = colorID
		delete(active, col)

		if columnBranch[col] == "" {
			for _, ref := range commit.commit.Refs {
				if !strings.HasPrefix(ref, "origin/") && ref != "HEAD" {
					columnBranch[col] = ref
					break
				}
			}
		}

		firstParentContinues := false
		for idx, parentHash := range commit.commit.Parents {
			if commitMap[parentHash] == nil {
				continue
			}
			if idx == 0 {
				active[col] = parentHash
				lineID[col] = colorID
				firstParentContinues = true
				node.nodeBottom = true
				continue
			}

			plane := -1
			for lane, hash := range active {
				if hash == parentHash && (plane == -1 || lane < plane) {
					plane = lane
				}
			}
			if plane == -1 {
				plane = lowestFreeGraphColumn(active, columnCap)
				active[plane] = parentHash
				lineID[plane] = nextID()
				state := st(plane)
				state.isStartOfLine = true
				state.branchFrom = col
				state.colorID = lineID[plane]
			}
			st(plane).mergeTo = col
			st(plane).colorID = lineID[plane]
			st(col).mergeFrom = plane
		}
		if !firstParentContinues {
			delete(lineID, col)
		}

		for lane, state := range row {
			if state != nil && lane > maxColumn {
				maxColumn = lane
			}
		}
		for lane := range active {
			if lane > maxColumn {
				maxColumn = lane
			}
		}
	}

	if maxColumn > columnCap-1 {
		maxColumn = columnCap - 1
	}
	for i, row := range states {
		for lane := 0; lane <= maxColumn; lane++ {
			if row[lane] == nil {
				row[lane] = newState()
			}
		}
		states[i] = row[:maxColumn+1]
	}

	for _, commit := range commits {
		if commit.commit.IsMerge && len(commit.commit.Parents) > 1 {
			branchName := parseGraphMergeBranch(commit.commit.Message)
			if branchName == "" {
				continue
			}
			secondParent := commitMap[commit.commit.Parents[1]]
			if secondParent != nil && columnBranch[secondParent.column] == "" {
				columnBranch[secondParent.column] = branchName
			}
		}
	}
	for _, commit := range commits {
		if commit.branch == "" {
			for _, ref := range commit.commit.Refs {
				if !strings.HasPrefix(ref, "origin/") && ref != "HEAD" {
					commit.branch = ref
					break
				}
			}
		}
		if commit.branch == "" {
			commit.branch = columnBranch[commit.column]
		}
	}

	rows := make([]GraphLayoutRow, 0, len(commits))
	for i, commit := range commits {
		stateRow := states[i]
		lanes := make([]GraphLane, 0, len(stateRow))
		for lane, state := range stateRow {
			glyphs := laneGlyphs(commit, lane, state, stateRow, commits, commitMap)
			lanes = append(lanes, GraphLane{
				Glyphs:     glyphs,
				ColorID:    state.colorID,
				CommitHash: state.commitHash,
			})
		}
		rows = append(rows, GraphLayoutRow{Commit: commit.commit, Lanes: lanes})
	}

	return &GraphLayout{
		Rows:          rows,
		LaneCount:     maxColumn + 1,
		CurrentBranch: graph.CurrentBranch,
	}
}

func currentBranch(graph *git.Graph) string {
	if graph == nil {
		return ""
	}
	return graph.CurrentBranch
}

func lowestFreeGraphColumn(active map[int]string, columnCap int) int {
	for col := 0; col < columnCap; col++ {
		if _, used := active[col]; !used {
			return col
		}
	}
	return columnCap - 1
}

func laneGlyphs(commit *layoutCommit, lane int, state *graphLaneState, allStates []*graphLaneState, commits []*layoutCommit, commitMap map[string]*layoutCommit) []GraphGlyph {
	kinds := laneGlyphKinds(commit, lane, state, allStates, commits, commitMap)
	glyphs := make([]GraphGlyph, 0, len(kinds))
	colorID := 0
	commitHash := ""
	if state != nil {
		colorID = state.colorID
		commitHash = state.commitHash
	}
	for _, kind := range kinds {
		glyphs = append(glyphs, GraphGlyph{
			Kind:          kind,
			ColorID:       colorID,
			CommitHash:    commitHash,
			ConnectTop:    isNodeGlyph(kind) && state != nil && state.nodeTop,
			ConnectBottom: isNodeGlyph(kind) && state != nil && state.nodeBottom,
		})
	}
	return glyphs
}

func isNodeGlyph(kind string) bool {
	return kind == "node" || kind == "head-node" || kind == "merge-node" || kind == "stash-node"
}

func laneGlyphKinds(commit *layoutCommit, lane int, state *graphLaneState, allStates []*graphLaneState, commits []*layoutCommit, commitMap map[string]*layoutCommit) [3]string {
	if state != nil && (state.mergeFrom != -1 || state.mergeTo != -1) {
		if state.hasNode {
			node := nodeGlyphKind(commit.commit)
			if state.mergeFrom != -1 {
				if state.mergeFrom < lane {
					return [3]string{"horizontal", node, "empty"}
				} else if state.mergeFrom > lane {
					return [3]string{"empty", node, "horizontal"}
				}
			}
			if state.mergeTo != -1 {
				if state.mergeTo < lane {
					return [3]string{"horizontal", node, "empty"}
				} else if state.mergeTo > lane {
					return [3]string{"empty", node, "horizontal"}
				}
			}
			return [3]string{"empty", node, "empty"}
		}

		if state.mergeTo != -1 {
			if state.mergeTo < lane {
				if state.hasLine {
					return [3]string{"horizontal", "vert-left", "empty"}
				}
				return [3]string{"horizontal", "top-right", "empty"}
			} else if state.mergeTo > lane {
				if state.hasLine {
					return [3]string{"empty", "vert-right", "horizontal"}
				}
				return [3]string{"empty", "top-left", "horizontal"}
			}
		}

		if state.hasLine {
			return [3]string{"empty", "vertical", "empty"}
		}
		return [3]string{"empty", "empty", "empty"}
	}

	if state != nil && state.branchInto != -1 {
		if state.branchInto < lane {
			return [3]string{"horizontal", "bot-right", "empty"}
		}
		return [3]string{"empty", "bot-left", "horizontal"}
	}

	if commit.commit.IsMerge && lane == commit.column {
		node := nodeGlyphKind(commit.commit)
		secCols := secondaryParentGraphCols(commit, commitMap)
		left, right := "empty", "empty"
		for _, col := range secCols {
			if col < lane {
				left = "horizontal"
			} else if col > lane {
				right = "horizontal"
			}
		}
		return [3]string{left, node, right}
	}

	if state != nil && state.hasNode {
		node := nodeGlyphKind(commit.commit)
		left, right := "empty", "empty"
		for otherLane, otherState := range allStates {
			if otherState != nil && otherState.branchInto == lane {
				if otherLane < lane {
					left = "horizontal"
				} else if otherLane > lane {
					right = "horizontal"
				}
			}
		}
		return [3]string{left, node, right}
	}

	for otherLane, otherState := range allStates {
		if otherState == nil || otherState.branchInto == -1 {
			continue
		}
		lo, hi := otherLane, otherState.branchInto
		if lo > hi {
			lo, hi = hi, lo
		}
		if lane > lo && lane < hi {
			if state != nil && state.hasLine {
				return [3]string{"horizontal", "cross", "horizontal"}
			}
			return [3]string{"horizontal", "horizontal", "horizontal"}
		}
	}

	if commit.commit.IsMerge && len(commit.commit.Parents) > 1 {
		secCols := secondaryParentGraphCols(commit, commitMap)
		if len(secCols) > 0 {
			minLane, maxLane := commit.column, commit.column
			isSec := false
			for _, col := range secCols {
				if col < minLane {
					minLane = col
				}
				if col > maxLane {
					maxLane = col
				}
				if col == lane {
					isSec = true
				}
			}

			if isSec {
				if lane < commit.column {
					if state != nil && state.hasLine {
						return [3]string{"empty", "vert-right", "horizontal"}
					}
					return [3]string{"empty", "top-left", "horizontal"}
				}
				if state != nil && state.hasLine {
					return [3]string{"horizontal", "vert-left", "empty"}
				}
				return [3]string{"horizontal", "top-right", "empty"}
			}

			if lane > minLane && lane < maxLane {
				if state != nil && state.hasLine {
					return [3]string{"horizontal", "cross", "horizontal"}
				}
				return [3]string{"horizontal", "horizontal", "horizontal"}
			}
		}
	}

	if state != nil && state.hasLine {
		return [3]string{"empty", "vertical", "empty"}
	}

	if state != nil && state.isStartOfLine {
		if state.branchFrom != -1 {
			if state.branchFrom < lane {
				return [3]string{"horizontal", "top-right", "empty"}
			}
			return [3]string{"empty", "top-left", "horizontal"}
		}
	}

	return [3]string{"empty", "empty", "empty"}
}

func secondaryParentGraphCols(commit *layoutCommit, commitMap map[string]*layoutCommit) []int {
	if commit == nil || !commit.commit.IsMerge || len(commit.commit.Parents) < 2 {
		return nil
	}
	cols := make([]int, 0, len(commit.commit.Parents)-1)
	for i := 1; i < len(commit.commit.Parents); i++ {
		if parent := commitMap[commit.commit.Parents[i]]; parent != nil {
			cols = append(cols, parent.column)
		}
	}
	return cols
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

func parseGraphMergeBranch(message string) string {
	if strings.HasPrefix(message, "Merge branch '") {
		start := len("Merge branch '")
		end := strings.Index(message[start:], "'")
		if end > 0 {
			return message[start : start+end]
		}
	}

	if strings.HasPrefix(message, "Merge pull request") {
		if idx := strings.Index(message, " from "); idx > 0 {
			rest := message[idx+6:]
			if slashIdx := strings.Index(rest, "/"); slashIdx > 0 {
				branch := rest[slashIdx+1:]
				if spaceIdx := strings.IndexAny(branch, " \n\t"); spaceIdx > 0 {
					branch = branch[:spaceIdx]
				}
				return branch
			}
		}
	}

	return ""
}
