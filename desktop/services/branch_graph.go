package services

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/atterpac/ichi/internal/git"
)

// LoadBranchGraph loads only commits reachable from the selected branch.
func (s *GraphService) LoadBranchGraph(ref string, limit int) (*GraphLayout, error) {
	repo, err := s.state.Repo()
	if err != nil {
		return nil, err
	}
	return loadBranchGraph(repo.Path(), ref, limit)
}

func loadBranchGraph(root, ref string, limit int) (*GraphLayout, error) {
	if limit < 1 || limit > 500 {
		limit = 80
	}
	// Resolve first so option-like input cannot alter the log command.
	resolved, err := exec.Command("git", "-C", root, "rev-parse", "--verify", "--end-of-options", ref+"^{commit}").Output()
	if err != nil {
		return nil, fmt.Errorf("resolve branch: %w", err)
	}
	tip := strings.TrimSpace(string(resolved))
	out, err := exec.Command("git", "-C", root, "log", "--topo-order", "--max-count="+strconv.Itoa(limit), "--format=%H%x00%h%x00%s%x00%an%x00%at%x00%P", tip, "--").Output()
	if err != nil {
		return nil, fmt.Errorf("load branch history: %w", err)
	}
	graph := &git.Graph{CurrentBranch: ref, CommitMap: make(map[string]*git.Commit)}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		fields := strings.Split(line, "\x00")
		if len(fields) != 6 {
			continue
		}
		timestamp, err := strconv.ParseInt(fields[4], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("parse commit date: %w", err)
		}
		parents := strings.Fields(fields[5])
		commit := &git.Commit{Hash: fields[0], ShortHash: fields[1], Message: fields[2], Author: fields[3], Date: time.Unix(timestamp, 0), Parents: parents, IsMerge: len(parents) > 1}
		if commit.Hash == tip {
			commit.Refs = []string{ref}
			commit.Branch = ref
		}
		graph.Commits = append(graph.Commits, commit)
		graph.CommitMap[commit.Hash] = commit
	}
	return layoutGitGraph(graph, defaultGraphColumnCap), nil
}
