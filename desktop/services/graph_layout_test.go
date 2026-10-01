package services

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"reflect"
	"slices"
	"testing"
	"time"

	"github.com/atterpac/ichi/internal/git"
)

func TestWorkingGraphNodeConnectsToHead(t *testing.T) {
	head := &git.Commit{Hash: "head", Refs: []string{"HEAD"}}
	graph := &git.Graph{Commits: []*git.Commit{head}, CommitMap: map[string]*git.Commit{"head": head}}
	prependWorkingChanges(graph, "head")
	layout := layoutGitGraph(graph, 12)
	working := layout.Rows[0].Lanes[0].Glyphs[1]
	parent := layout.Rows[1].Lanes[0].Glyphs[1]
	if working.Kind != "unstaged-node" || working.ConnectTop || !working.ConnectBottom {
		t.Fatalf("working node should connect down to HEAD only: %+v", working)
	}
	if parent.Kind != "head-node" || !parent.ConnectTop || parent.ConnectBottom {
		t.Fatalf("root HEAD should connect up to working node only: %+v", parent)
	}
}

func TestLayoutPreservesOccupiedLanes(t *testing.T) {
	var commits []*git.Commit
	for i := 0; i < 14; i++ {
		commits = append(commits, &git.Commit{Hash: fmt.Sprintf("tip%d", i), Parents: []string{fmt.Sprintf("parent%d", i)}})
	}
	for i := 0; i < 14; i++ {
		commits = append(commits, &git.Commit{Hash: fmt.Sprintf("parent%d", i)})
	}
	layout := layoutGitGraph(&git.Graph{Commits: commits}, 12)
	if layout.LaneCount != 14 {
		t.Fatalf("14 live parent routes need 14 lanes, got %d", layout.LaneCount)
	}
	for i := 0; i < 14; i++ {
		parent := layout.Rows[14+i].Lanes[i].Glyphs[1]
		if !parent.ConnectTop {
			t.Fatalf("lost incoming route to parent%d: %+v", i, parent)
		}
	}
}

func layoutFixture(spec ...[]string) *git.Graph {
	graph := &git.Graph{CurrentBranch: "main", CommitMap: map[string]*git.Commit{}}
	for _, entry := range spec {
		commit := &git.Commit{Hash: entry[0], ShortHash: entry[0], Message: entry[0], Parents: entry[1:], IsMerge: len(entry) > 2}
		graph.Commits = append(graph.Commits, commit)
		graph.CommitMap[commit.Hash] = commit
	}
	return graph
}

func graphRoutingFixtures() map[string]*git.Graph {
	return map[string]*git.Graph{
		"Linear history":                   layoutFixture([]string{"A", "B"}, []string{"B", "root"}, []string{"root"}),
		"Shared ancestor":                  layoutFixture([]string{"merge", "A", "B"}, []string{"A", "root"}, []string{"B", "root"}, []string{"root"}),
		"Parents on both sides":            layoutFixture([]string{"left-tip", "L"}, []string{"main-tip", "merge"}, []string{"right-tip", "R"}, []string{"merge", "P", "L", "R"}, []string{"P"}, []string{"L"}, []string{"R"}),
		"Crossings and converging parents": layoutFixture([]string{"main-tip", "merge"}, []string{"side-tip", "Q"}, []string{"other-tip", "R"}, []string{"merge", "A", "B"}, []string{"A", "B"}, []string{"B"}, []string{"Q"}, []string{"R"}),
		"Many new parents":                 layoutFixture([]string{"octopus", "P0", "P1", "P2", "P3", "P4", "P5"}, []string{"P0"}, []string{"P1"}, []string{"P2"}, []string{"P3"}, []string{"P4"}, []string{"P5"}),
		"Missing first parent":             layoutFixture([]string{"merge", "outside", "B"}, []string{"B"}),
		"Truncated history":                layoutFixture([]string{"A", "B"}, []string{"B", "outside"}),
		"Reused lane":                      layoutFixture([]string{"root-A"}, []string{"B", "root-B"}, []string{"root-B"}),
	}
}

type graphTestPort struct {
	hash  string
	color int
}

// Validate the actual emitted graph contract, not the allocator's internal state.
// Every visible parent edge must reach the matching rail; all row boundaries
// must agree on target identity and color without inventing top/bottom stems.
func assertGraphContinuity(t *testing.T, layout *GraphLayout) {
	t.Helper()
	positions := map[string]int{}
	for i, row := range layout.Rows {
		positions[row.Commit.Hash] = i
	}
	previous := map[int]graphTestPort{}
	for index, row := range layout.Rows {
		if len(row.Lanes) != layout.LaneCount {
			t.Fatalf("row %s has wrong lane count", row.Commit.Hash)
		}
		top, bottom := map[int]graphTestPort{}, map[int]graphTestPort{}
		nodeLane := -1
		for lane, data := range row.Lanes {
			if len(data.Glyphs) != 3 {
				t.Fatal("lane must have three glyph cells")
			}
			glyph := data.Glyphs[1]
			if isNodeGlyph(glyph.Kind) {
				if nodeLane != -1 {
					t.Fatal("multiple commit nodes in one row")
				}
				nodeLane = lane
				if glyph.CommitHash != row.Commit.Hash {
					t.Fatal("node belongs to another commit")
				}
			}
			port := graphTestPort{glyph.CommitHash, glyph.ColorID}
			if glyph.Kind == "vertical" || glyph.ConnectTop {
				top[lane] = port
			}
			if glyph.Kind == "vertical" {
				bottom[lane] = port
			}
		}
		if nodeLane == -1 {
			t.Fatalf("row %s has no node", row.Commit.Hash)
		}
		if !reflect.DeepEqual(previous, top) {
			t.Fatalf("broken boundary before %s: bottom=%v top=%v", row.Commit.Hash, previous, top)
		}
		expected := map[string]bool{}
		for _, parent := range row.Commit.Parents {
			if p, ok := positions[parent]; ok && p > index {
				expected[parent] = true
			}
		}
		seen := map[string]bool{}
		straight := false
		for _, route := range row.Routes {
			if !expected[route.ParentHash] || seen[route.ParentHash] {
				t.Fatalf("unexpected/duplicate parent edge: %+v", route)
			}
			seen[route.ParentHash] = true
			if route.FromLane != nodeLane || route.ToLane < 0 || route.ToLane >= layout.LaneCount {
				t.Fatalf("bad row-local endpoints: %+v", route)
			}
			if route.ToLane == nodeLane {
				straight = true
			}
			port := graphTestPort{route.ParentHash, route.ColorID}
			if existing, ok := bottom[route.ToLane]; ok && existing != port {
				t.Fatalf("overwrote pending parent %v with %+v", existing, route)
			}
			bottom[route.ToLane] = port
			through, continuing := top[route.ToLane]
			continuing = continuing && route.ToLane != nodeLane
			if route.Continues != continuing || (continuing && through != port) {
				t.Fatalf("false junction: %+v", route)
			}
			var crossings []int
			for lane := min(route.FromLane, route.ToLane) + 1; lane < max(route.FromLane, route.ToLane); lane++ {
				if _, ok := top[lane]; ok {
					crossings = append(crossings, lane)
				}
			}
			if !slices.Equal(crossings, route.Crossings) {
				t.Fatalf("wrong crossings for %+v; want %v", route, crossings)
			}
		}
		if !reflect.DeepEqual(expected, seen) {
			t.Fatalf("lost parent edge for %s: expected %v got %v", row.Commit.Hash, expected, seen)
		}
		if row.Lanes[nodeLane].Glyphs[1].ConnectBottom != straight {
			t.Fatalf("wrong node bottom stem in %s", row.Commit.Hash)
		}
		targets := map[string]bool{}
		for _, port := range bottom {
			if targets[port.hash] {
				t.Fatalf("duplicate active rails for %s", port.hash)
			}
			targets[port.hash] = true
		}
		previous = bottom
	}
	if len(previous) != 0 {
		t.Fatalf("dangling rails at history boundary: %v", previous)
	}
}

func TestGraphRoutingFixtures(t *testing.T) {
	exported := map[string]*GraphLayout{}
	for name, graph := range graphRoutingFixtures() {
		t.Run(name, func(t *testing.T) {
			layout := layoutGitGraph(graph, 2)
			assertGraphContinuity(t, layout)
			if !reflect.DeepEqual(layout, layoutGitGraph(graph, 12)) {
				t.Fatal("allocation hint changed graph topology")
			}
			exported[name] = layout
		})
	}
	// Explicit opt-in export supplies the playground with real Go output.
	if path := os.Getenv("ICHI_GRAPH_LAYOUT_FIXTURE_OUTPUT"); path != "" {
		data, err := json.Marshal(exported)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, append(data, '\n'), 0644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestGraphRoutingOctopusKeepsBothSides(t *testing.T) {
	layout := layoutGitGraph(graphRoutingFixtures()["Parents on both sides"], 2)
	row := layout.Rows[3]
	left, right := false, false
	for _, route := range row.Routes {
		left = left || route.ToLane < route.FromLane
		right = right || route.ToLane > route.FromLane
	}
	if !left || !right || len(row.Routes) != 3 {
		t.Fatalf("missing octopus arm: %+v", row.Routes)
	}
}

func TestGraphRoutingCrossingKeepsParentLaneAndColor(t *testing.T) {
	layout := layoutGitGraph(graphRoutingFixtures()["Crossings and converging parents"], 12)
	route := layout.Rows[3].Routes[0]
	if route.ParentHash != "B" || route.ToLane != 3 || !slices.Equal(route.Crossings, []int{1, 2}) {
		t.Fatalf("wrong merge span: %+v", route)
	}
	for _, lane := range route.Crossings {
		if layout.Rows[3].Lanes[lane].Glyphs[1].ColorID == route.ColorID {
			t.Fatal("crossing overwrote edge color")
		}
	}
	// A's first parent is already active. Join it instead of allocating a
	// duplicate rail that would move B's eventual node to a different column.
	joining := layout.Rows[4].Routes[0]
	parent := layout.Rows[5].Lanes[route.ToLane].Glyphs[1]
	if !joining.Continues || joining.ToLane != route.ToLane || parent.CommitHash != "B" || !parent.ConnectTop || parent.ColorID != route.ColorID {
		t.Fatal("parent rail moved or changed identity")
	}
}

func TestGraphRoutingRandomDAGs(t *testing.T) {
	for seed := int64(0); seed < 40; seed++ {
		t.Run(fmt.Sprint(seed), func(t *testing.T) {
			rng := rand.New(rand.NewSource(seed))
			var commits []*git.Commit
			const count = 75
			for i := 0; i < count; i++ {
				commit := &git.Commit{Hash: fmt.Sprint(i)}
				for j := 0; j < rng.Intn(6); j++ {
					if i+1 < count {
						commit.Parents = append(commit.Parents, fmt.Sprint(i+1+rng.Intn(count-i-1)))
					}
				}
				commit.IsMerge = len(commit.Parents) > 1
				commits = append(commits, commit)
			}
			layout := layoutGitGraph(&git.Graph{Commits: commits}, 2)
			assertGraphContinuity(t, layout)
			for repeat := 0; repeat < 3; repeat++ {
				if !reflect.DeepEqual(layout, layoutGitGraph(&git.Graph{Commits: commits}, 2)) {
					t.Fatal("nondeterministic routing")
				}
			}
		})
	}
}

func TestGraphRoutingEmptyAndDuplicateInput(t *testing.T) {
	for _, graph := range []*git.Graph{nil, {}, {Commits: []*git.Commit{nil}}} {
		layout := layoutGitGraph(graph, 0)
		if len(layout.Rows) != 0 || layout.LaneCount != 0 {
			t.Fatalf("nonempty layout for empty input: %+v", layout)
		}
	}
	graph := layoutFixture([]string{"A", "B"}, []string{"B"})
	graph.Commits = append([]*git.Commit{nil, graph.Commits[0]}, graph.Commits...)
	layout := layoutGitGraph(graph, 1)
	if len(layout.Rows) != 2 {
		t.Fatal("duplicate nodes")
	}
	assertGraphContinuity(t, layout)
}

func TestGraphRoutingUsesVisibleHistoryNotStaleLookup(t *testing.T) {
	graph := layoutFixture([]string{"A", "B"}, []string{"B", "outside"})
	graph.CommitMap["outside"] = &git.Commit{Hash: "outside"}
	layout := layoutGitGraph(graph, 12)
	assertGraphContinuity(t, layout)
	if len(layout.Rows[1].Routes) != 0 {
		t.Fatal("routed to a parent outside the visible history window")
	}
}

func TestGraphRoutingPlaygroundMatchesGoOutput(t *testing.T) {
	data, err := os.ReadFile("../frontend/src/sandbox/graph/routed-fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures map[string]*GraphLayout
	if err := json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for name, input := range graphRoutingFixtures() {
		expected, err := json.Marshal(layoutGitGraph(input, 12))
		if err != nil {
			t.Fatal(err)
		}
		actual, err := json.Marshal(fixtures[name])
		if err != nil {
			t.Fatal(err)
		}
		if string(expected) != string(actual) {
			t.Fatalf("playground fixture %q is stale; regenerate with TestGraphRoutingFixtures", name)
		}
	}
}

func TestStashesSitAboveTheirBaseWithDashedLinks(t *testing.T) {
	now := time.Now()
	head := &git.Commit{Hash: "head", Parents: []string{"base"}, Date: now.Add(-time.Hour), Refs: []string{"HEAD"}}
	base := &git.Commit{Hash: "base", Date: now.Add(-48 * time.Hour)}
	graph := &git.Graph{Commits: []*git.Commit{head, base}, CommitMap: map[string]*git.Commit{"head": head, "base": base}}
	insertStashes(graph, []*git.Commit{
		// Newer than HEAD but based on an older commit: still placed above its base.
		{Hash: "stash0", Parents: []string{"base"}, Date: now, IsStash: true},
		{Hash: "orphan", Parents: []string{"unloaded"}, Date: now, IsStash: true},
	})
	order := []string{}
	for _, commit := range graph.Commits {
		order = append(order, commit.Hash)
	}
	if !slices.Equal(order, []string{"stash0", "head", "base"}) {
		t.Fatalf("stash should precede HEAD and the unloaded-base stash be skipped, got %v", order)
	}
	layout := layoutGitGraphCompact(graph, 12)
	if kind := layout.Rows[0].Lanes[0].Glyphs[1].Kind; kind != "stash-node" {
		t.Fatalf("first row should be the stash node, got %q", kind)
	}
	for _, route := range layout.Rows[0].Routes {
		if !route.Dashed {
			t.Fatalf("stash route should be dashed: %+v", route)
		}
	}
	for _, route := range layout.Rows[1].Routes {
		if route.Dashed {
			t.Fatalf("history routes stay solid: %+v", route)
		}
	}
	for _, segment := range layout.Segments {
		// Only rows above HEAD's join may carry dashes; real history below stays solid.
		if segment.Dashed && segment.ToRow > 2 {
			t.Fatalf("dashes must stop where history joins: %+v", segment)
		}
	}
}
