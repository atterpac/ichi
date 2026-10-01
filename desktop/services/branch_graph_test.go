package services

import (
	"context"
	"github.com/atterpac/ichi/internal/git"
	"os/exec"
	"strings"
	"testing"
)

func TestBranchGraphIsolatedAncestry(t *testing.T) {
	root := t.TempDir()
	run := func(args ...string) string {
		t.Helper()
		out, err := exec.Command("git", append([]string{"-C", root}, args...)...).CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %s: %v", args, out, err)
		}
		return strings.TrimSpace(string(out))
	}
	run("init", "-b", "main")
	run("config", "user.name", "Test")
	run("config", "user.email", "test@example.com")
	run("commit", "--allow-empty", "-m", "root | with delimiter")
	rootHash := run("rev-parse", "HEAD")
	run("checkout", "-b", "feature")
	run("commit", "--allow-empty", "-m", "feature")
	run("checkout", "-b", "side")
	run("commit", "--allow-empty", "-m", "side")
	run("checkout", "feature")
	run("commit", "--allow-empty", "-m", "feature next")
	run("merge", "--no-ff", "side", "-m", "merge")
	tip := run("rev-parse", "HEAD")
	run("checkout", "main")
	run("commit", "--allow-empty", "-m", "unrelated main progress")
	excluded := run("rev-parse", "HEAD")
	repo, err := git.OpenRepository(root)
	if err != nil {
		t.Fatal(err)
	}
	graph, err := loadBranchGraph(context.Background(), repo, "feature", 80)
	if err != nil {
		t.Fatal(err)
	}
	if len(graph.Rows) != 5 || graph.Rows[0].Commit.Hash != tip {
		t.Fatalf("unexpected isolated history: %+v", graph)
	}
	seen := map[string]bool{}
	for _, row := range graph.Rows {
		if row.Commit.Hash == excluded {
			t.Fatal("included commit outside selected ancestry")
		}
		seen[row.Commit.Hash] = true
	}
	if !seen[rootHash] {
		t.Fatal("missing shared ancestor")
	}
	if len(graph.Rows[0].Commit.Parents) != 2 {
		t.Fatal("lost merge parents")
	}
	if graph.Rows[4].Commit.Message != "root | with delimiter" {
		t.Fatal("corrupted subject")
	}
	limited, err := loadBranchGraph(context.Background(), repo, "feature", 2)
	if err != nil || len(limited.Rows) != 2 {
		t.Fatalf("limit not respected: %v", err)
	}
	if _, err := loadBranchGraph(context.Background(), repo, "--all", 80); err == nil {
		t.Fatal("accepted option as ref")
	}
}
