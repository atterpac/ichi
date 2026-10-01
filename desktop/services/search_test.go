package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/atterpac/ichi/internal/git"
)

func TestFileSearchPolicyInvalidationAndSwitch(t *testing.T) {
	root, run := conflictTestRepo(t)
	for path, content := range map[string]string{
		".gitignore": "ignored*\n", "ignored-tracked": "tracked", "ignored-new": "ignored",
		".hidden": "hidden", "new file": "untracked", "line\nbreak": "newline", "fólder/Ünicode.go": "unicode",
	} {
		if err := os.MkdirAll(filepath.Dir(filepath.Join(root, path)), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(root, path), []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	run("add", "-f", "ignored-tracked")
	repo, err := git.OpenRepository(root)
	if err != nil {
		t.Fatal(err)
	}
	state := &State{repo: repo}
	service := &SearchService{state: state}
	all, err := service.Files(context.Background(), "", 100, []string{"new file"})
	if err != nil {
		t.Fatal(err)
	}
	paths := map[string]bool{}
	for _, file := range all.Matches {
		paths[file.Path] = true
	}
	if paths["ignored-new"] || !paths["ignored-tracked"] || !paths[".hidden"] || !paths["line\nbreak"] || all.Matches[0].Path != "new file" {
		t.Fatalf("wrong filename policy: %+v", all)
	}
	unicode, err := service.Files(context.Background(), "ünigo", 8, nil)
	if err != nil || len(unicode.Matches) != 1 || unicode.Matches[0].Path != "fólder/Ünicode.go" {
		t.Fatalf("unicode match: %v %v", unicode, err)
	}
	if err := os.WriteFile(filepath.Join(root, "external-new"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	state.Emit(EventStatusChanged, nil)
	found, err := service.Files(context.Background(), "external-new", 8, nil)
	if err != nil || len(found.Matches) != 1 {
		t.Fatalf("invalidated index: %v %v", found, err)
	}
	other, _ := conflictTestRepo(t)
	otherRepo, err := git.OpenRepository(other)
	if err != nil {
		t.Fatal(err)
	}
	state.SetRepo(otherRepo)
	found, err = service.Files(context.Background(), "external-new", 8, nil)
	if err != nil || len(found.Matches) != 0 {
		t.Fatalf("switch leaked filenames: %v %v", found, err)
	}
}

func TestContentSearchLiteralHiddenIgnoredAndBudget(t *testing.T) {
	if availableRipgrep() == "" {
		t.Skip("rg is not installed")
	}
	root, _ := conflictTestRepo(t)
	for path, content := range map[string]string{
		".gitignore": "ignored\n", ".hidden": "--needle [a]*\n", "visible": strings.Repeat("--needle [a]*\n", 30), "ignored": "--needle [a]*\n", "binary": "\x00--needle [a]*\n", "large": strings.Repeat("x", 2<<20) + "--needle [a]*\n",
	} {
		if err := os.WriteFile(filepath.Join(root, path), []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	repo, err := git.OpenRepository(root)
	if err != nil {
		t.Fatal(err)
	}
	service := &SearchService{state: &State{repo: repo}}
	result, err := service.Content(context.Background(), "--needle [a]*", 100)
	if err != nil {
		t.Fatal(err)
	}
	hidden := false
	for _, match := range result.Matches {
		if match.Path == ".hidden" {
			hidden = true
		}
		if match.Path != ".hidden" && match.Path != "visible" {
			t.Fatalf("unexpected search path %q", match.Path)
		}
		if match.Column != 1 || match.Text != "--needle [a]*" {
			t.Fatalf("bad location/text: %+v", match)
		}
	}
	if !hidden || len(result.Matches) != 31 || result.Truncated {
		t.Fatalf("wrong search results: %+v", result)
	}
	result, err = service.Content(context.Background(), "--needle [a]*", 2)
	if err != nil || len(result.Matches) != 2 || !result.Truncated {
		t.Fatalf("budget failed: %+v %v", result, err)
	}
	result, err = service.Content(context.Background(), "no-such-match", 8)
	if err != nil || len(result.Matches) != 0 {
		t.Fatalf("no-match exit: %+v %v", result, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := service.Content(ctx, "needle", 8); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation: %v", err)
	}
	t.Setenv("PATH", t.TempDir())
	if service.Capabilities().ContentAvailable {
		t.Fatal("claimed unavailable rg was installed")
	}
	if _, err := service.Content(context.Background(), "needle", 8); err == nil {
		t.Fatal("missing rg should return a useful error")
	}
}

func TestFileSearchRankingAndLimits(t *testing.T) {
	entries := []indexedPath{{"src/search.go", "src/search.go", "search.go"}, {"Search.go", "search.go", "search.go"}, {"src/long_search.go", "src/long_search.go", "long_search.go"}}
	if a, _ := pathScore(entries[1], "search.go"); a != 0 {
		t.Fatalf("basename exact score %d", a)
	}
	if _, matched := pathScore(entries[0], "zzz"); matched {
		t.Fatal("matched unrelated file")
	}
	if validateSearch(strings.Repeat("x", 1025)) == nil || validateSearch("a\x00b") == nil {
		t.Fatal("accepted oversized or invalid query")
	}
	if searchLimit(100000) != 100 {
		t.Fatal("unbounded result count")
	}
}

func TestCompactGraphMatchesDenseTopology(t *testing.T) {
	for name, graph := range graphRoutingFixtures() {
		t.Run(name, func(t *testing.T) {
			dense, compact := layoutGitGraph(graph, 12), layoutGitGraphCompact(graph, 12)
			if dense.LaneCount != compact.LaneCount || len(dense.Rows) != len(compact.Rows) {
				t.Fatal("layout dimensions changed")
			}
			for row, node := range compact.Rows {
				if len(node.Lanes) != 1 || node.Lanes[0].Column == nil {
					t.Fatal("row retained a dense rail grid")
				}
				if !reflect.DeepEqual(node.Routes, dense.Rows[row].Routes) {
					t.Fatalf("routes changed at row %d", row)
				}
				column := *node.Lanes[0].Column
				if !reflect.DeepEqual(node.Lanes[0].Glyphs, dense.Rows[row].Lanes[column].Glyphs) {
					t.Fatalf("node changed at row %d", row)
				}
				for lane, cell := range dense.Rows[row].Lanes {
					if cell.Glyphs[1].Kind != "vertical" {
						continue
					}
					found := false
					for _, segment := range compact.Segments {
						if segment.Lane == lane && segment.FromRow <= row && row < segment.ToRow && segment.ColorID == cell.ColorID && segment.CommitHash == cell.CommitHash {
							found = true
							break
						}
					}
					if !found {
						t.Fatalf("rail lost at row %d lane %d", row, lane)
					}
				}
			}
		})
	}
}

func BenchmarkFileSearch100K(b *testing.B) {
	root := b.TempDir()
	cmd := exec.Command("git", "-C", root, "init")
	if err := cmd.Run(); err != nil {
		b.Fatal(err)
	}
	repo, err := git.OpenRepository(root)
	if err != nil {
		b.Fatal(err)
	}
	entries := make([]indexedPath, 100000)
	for i := range entries {
		path := fmt.Sprintf("src/package%04d/module%06d.go", i%1000, i)
		entries[i] = indexedPath{path, path, path[strings.LastIndexByte(path, '/')+1:]}
	}
	state := &State{repo: repo, fileIndex: fileSearchIndex{path: root, built: time.Now(), entries: entries}}
	service := &SearchService{state: state}
	b.ReportAllocs()
	b.ResetTimer()
	for b.Loop() {
		if _, err := service.Files(context.Background(), "mod42", 8, nil); err != nil {
			b.Fatal(err)
		}
	}
}

func wideGraph(rows int) *git.Graph {
	graph := &git.Graph{}
	for index := range rows / 2 {
		graph.Commits = append(graph.Commits, &git.Commit{Hash: fmt.Sprintf("child-%d", index), Parents: []string{fmt.Sprintf("parent-%d", index)}})
	}
	for index := range rows / 2 {
		graph.Commits = append(graph.Commits, &git.Commit{Hash: fmt.Sprintf("parent-%d", index)})
	}
	return graph
}

func TestCompactGraphBoundsBridgePayload(t *testing.T) {
	graph := wideGraph(100)
	dense, err := json.Marshal(layoutGitGraph(graph, 12))
	if err != nil {
		t.Fatal(err)
	}
	compact, err := json.Marshal(layoutGitGraphCompact(graph, 12))
	if err != nil {
		t.Fatal(err)
	}
	if len(compact)*10 >= len(dense) {
		t.Fatalf("dense=%d compact=%d; payload still scales with lanes per row", len(dense), len(compact))
	}
}

func BenchmarkWideGraph1000(b *testing.B) {
	graph := wideGraph(1000)
	for _, compact := range []bool{false, true} {
		b.Run(fmt.Sprint("compact=", compact), func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				buildGraphLayout(graph, 12, compact)
			}
		})
	}
}
