package views

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gdamore/tcell/v2"

	"github.com/atterpac/dado/components"
	"github.com/atterpac/dado/core"
	"github.com/atterpac/dado/input"
	"github.com/atterpac/dado/layout"
	"github.com/atterpac/dado/theme"

	"github.com/atterpac/ichi/internal/app"
	"github.com/atterpac/ichi/internal/git"
	"github.com/atterpac/ichi/internal/selection"
)

// PreloadedGraph holds graph data loaded during splash screen.
type PreloadedGraph struct {
	Graph      *components.GitGraphData
	HasChanges bool
}

// toGitCommit maps a plain git.Commit onto the dado render type.
func toGitCommit(c *git.Commit) *components.GitCommit {
	return &components.GitCommit{
		Hash:      c.Hash,
		ShortHash: c.ShortHash,
		Message:   c.Message,
		Author:    c.Author,
		Date:      c.Date,
		Parents:   c.Parents,
		Refs:      c.Refs,
		Branch:    c.Branch,
		IsMerge:   c.IsMerge,
		IsStash:   c.IsStash,
		Ahead:     c.Ahead,
		Behind:    c.Behind,
	}
}

// toGraphData builds a laid-out dado graph from plain git data.
func toGraphData(g *git.Graph) *components.GitGraphData {
	data := components.NewGitGraphData()
	data.CurrentBranch = g.CurrentBranch
	for _, c := range g.Commits {
		data.AddCommit(toGitCommit(c))
	}
	data.LayoutGraph()
	return data
}

// PreloadGraph loads graph data in the background (called before UI is ready).
func PreloadGraph(repo *git.Repository) (*PreloadedGraph, error) {
	g, err := repo.LoadGraph(500)
	if err != nil {
		return nil, err
	}
	graph := toGraphData(g)

	// Check for working changes
	hasChanges := false
	status, err := repo.Status()
	if err != nil {
		return nil, err
	}
	{
		for _, entry := range status {
			if entry.WorkStatus != 0 || entry.IndexStatus != 0 || entry.IsUntracked {
				hasChanges = true
				break
			}
		}
	}

	return &PreloadedGraph{Graph: graph, HasChanges: hasChanges}, nil
}

// GraphView displays the commit graph.
type GraphView struct {
	flex        *core.Flex
	split       *components.Split
	graphPanel  *components.Panel
	gitGraph    *components.GitGraph
	detailView  *core.TextView
	repo        *git.Repository
	app         *layout.App
	actions     *input.ActionRegistry
	showStashes bool
	preloaded   *PreloadedGraph

	// detailCache memoizes LoadCommit by hash (immutable per hash) so scrolling
	// doesn't re-spawn git processes. Cleared on refresh().
	detailCancel context.CancelFunc
	detailCache  map[string]*git.CommitDetail
	mutations    commitActionOwner
	active       bool

	// Search
	searchActive  bool
	searchQuery   string
	searchMatches []int // Indices of matching commits
	searchIndex   int   // Current match index
}

// NewGraphView creates a new graph view.
func NewGraphView(app *layout.App, repo *git.Repository) *GraphView {
	v := &GraphView{
		flex:       core.NewFlex(),
		gitGraph:   components.NewGitGraph(),
		detailView: core.NewTextView(),
		repo:       repo,
		app:        app,
	}
	v.setup()
	return v
}

func (v *GraphView) setup() {
	// Configure git graph component
	v.gitGraph.
		SetShowRefs(true).
		SetShowHash(true).
		SetShowAuthor(true).
		// Debounce the detail fetch: holding j/k scrolls the cursor every step,
		// but LoadCommit (a synchronous git call) only fires once movement
		// settles, so rapid navigation stays fluid.
		SetChangeDebounce(80 * time.Millisecond).
		SetOnChange(v.updateDetail).
		SetOnSelect(v.showCommitView)

	// Configure detail view
	v.detailView.SetDynamicColors(true).SetWordWrap(true)

	// Wrap in panels (Required: rounded borders)
	v.graphPanel = components.NewPanel().
		SetTitle("Commit Graph").
		SetContent(v.gitGraph)

	detailPanel := components.NewPanel().
		SetTitle("Commit Details").
		SetContent(v.detailView)

	// Two-panel layout (60/40 split)
	v.split = components.NewSplit().
		SetDirection(components.SplitHorizontal).
		SetRatio(0.6).
		SetShowDivider(false).
		SetLeft(v.graphPanel).
		SetRight(detailPanel)

	v.flex.SetDirection(core.Column)
	v.flex.AddItem(v.split, 0, 1, true)

	// Register actions (search handled separately in HandleKey)
	v.actions = input.NewActionRegistry().
		AddKey("select", tcell.KeyEnter, "Details", func() { v.showCommitView(v.gitGraph.GetSelected()) }).
		AddSimple("diff", 'd', "Diff", v.showDiff).
		AddSimple("checkout", 'c', "Checkout", v.checkout).
		AddSimple("refresh", 'r', "Refresh", v.refresh).
		AddSimple("cherry_pick", 'C', "Cherry-pick", v.cherryPick).
		AddSimple("revert", 'R', "Revert", v.revert).
		AddSimple("edit_message", 'e', "Edit message", v.editCommitMessage).
		AddSimple("copy_hash", 'y', "Copy hash", v.copyHash).
		AddSimple("toggle_stashes", 'z', "Toggle stashes", v.toggleStashes).
		AddSimple("next_match", 'n', "Next match", v.nextMatch).
		AddSimple("prev_match", 'N', "Prev match", v.prevMatch).
		AddSimple("new_branch", 'b', "New branch", v.newBranch).
		AddSimple("drop", 'D', "Drop commit", v.dropCommit)
}

// nav.Component interface implementation

func (v *GraphView) Name() string {
	return "Commit Graph"
}

// Selection implements selection.Provider.
func (v *GraphView) Selection() *selection.Context {
	sel := &selection.Context{ViewName: v.Name()}
	if commit := v.gitGraph.GetSelected(); commit != nil {
		sel.Commit = commit
		sel.CommitHash = commit.Hash
	}
	return sel
}

// SetPreloadedGraph sets graph data that was loaded during splash.
func (v *GraphView) SetPreloadedGraph(p *PreloadedGraph) {
	v.preloaded = p
}

func (v *GraphView) Start() {
	v.active = true
	if v.preloaded != nil {
		graph := v.preloaded.Graph
		hasChanges := v.preloaded.HasChanges
		v.preloaded = nil // Only use once

		if hasChanges {
			pseudoNode := &components.GitCommit{
				Hash:         "unstaged",
				ShortHash:    "○",
				Message:      "Working Changes",
				IsPseudoNode: true,
				PseudoType:   "unstaged",
				Column:       0,
			}
			graph.Commits = append([]*components.GitCommit{pseudoNode}, graph.Commits...)
			graph.LayoutGraph()
		}

		v.gitGraph.SetGraph(graph)
		if commit := v.gitGraph.GetSelected(); commit != nil {
			v.updateDetail(commit)
		}
		return
	}
	v.refresh()
}

func (v *GraphView) Stop() {
	v.active = false
	v.mutations.stop()
	v.cancelDetail()
}

func (v *GraphView) cancelDetail() {
	if v.detailCancel != nil {
		v.detailCancel()
		v.detailCancel = nil
	}
}

func (v *GraphView) Hints() []components.KeyHint {
	if v.searchActive {
		return []components.KeyHint{
			{Key: "Enter", Description: "Confirm"},
			{Key: "Esc", Description: "Cancel"},
		}
	}
	return []components.KeyHint{
		{Key: "j/k", Description: "Navigate"},
		{Key: "g/G", Description: "Top/Bottom"},
		{Key: "/", Description: "Search"},
		{Key: "Enter", Description: "Details"},
		{Key: "d", Description: "Diff"},
		{Key: "c", Description: "Checkout"},
		{Key: ":P/:p/:f", Description: "Push/Pull/Fetch"},
		{Key: "b", Description: "New branch"},
	}
}

// Business logic

func (v *GraphView) refresh() {
	v.cancelDetail()
	// Refresh may also switch repositories or change Git configuration.
	v.detailCache = nil

	g, err := v.repo.LoadGraph(500)
	if err != nil {
		v.showError(err)
		return
	}
	graph := toGraphData(g)

	// Add stashes to graph if enabled - insert chronologically
	if v.showStashes {
		stashes, err := v.repo.LoadStashes()
		if err != nil {
			v.showError(err)
			return
		}
		for _, st := range stashes {
			stash := toGitCommit(st)
			graph.CommitMap[stash.Hash] = stash
			// Find correct chronological position (commits are newest first)
			inserted := false
			for i, commit := range graph.Commits {
				if stash.Date.After(commit.Date) {
					// Insert before this commit
					graph.Commits = append(graph.Commits[:i], append([]*components.GitCommit{stash}, graph.Commits[i:]...)...)
					inserted = true
					break
				}
			}
			if !inserted {
				// Stash is older than all commits, add at end
				graph.Commits = append(graph.Commits, stash)
			}
		}
		// Re-layout with stashes included
		graph.LayoutGraph()
	}

	// Check for unstaged changes and prepend pseudo-node
	hasChanges, err := v.hasWorkingChanges()
	if err != nil {
		v.showError(err)
		return
	}
	if hasChanges {
		pseudoNode := &components.GitCommit{
			Hash:         "unstaged",
			ShortHash:    "○",
			Message:      "Working Changes",
			IsPseudoNode: true,
			PseudoType:   "unstaged",
			Column:       0,
		}
		graph.Commits = append([]*components.GitCommit{pseudoNode}, graph.Commits...)
		graph.LayoutGraph()
	}

	v.gitGraph.SetGraph(graph)

	// Update detail for currently selected
	if commit := v.gitGraph.GetSelected(); commit != nil {
		v.updateDetail(commit)
	}
}

// hasWorkingChanges returns true if there are staged or unstaged changes in the repo.
func (v *GraphView) hasWorkingChanges() (bool, error) {
	status, err := v.repo.Status()
	if err != nil {
		return false, err
	}
	for _, entry := range status {
		if entry.WorkStatus != 0 || entry.IndexStatus != 0 || entry.IsUntracked {
			return true, nil
		}
	}
	return false, nil
}

func (v *GraphView) toggleStashes() {
	v.showStashes = !v.showStashes
	v.refresh()
}

func (v *GraphView) updateDetail(commit *components.GitCommit) {
	// dado's debounced highlight can already be queued when navigation stops
	// this view. It must not create a new read lifetime after Stop.
	if !v.active {
		return
	}
	v.cancelDetail()
	if commit == nil {
		v.detailView.SetText("")
		return
	}
	if commit.IsPseudoNode && commit.PseudoType == "unstaged" {
		v.updateDetailUnstaged()
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	v.detailCancel = cancel
	detail := v.detailCache[commit.Hash]
	if detail != nil {
		v.renderDetail(commit, detail, nil, nil)
	} else {
		v.updateDetailBasic(commit)
	}
	repo := *v.repo
	go func() {
		if detail == nil {
			var err error
			detail, err = repo.LoadCommit(ctx, commit.Hash)
			if err != nil || ctx.Err() != nil {
				return
			}
			v.app.QueueUpdateDraw(func() {
				if ctx.Err() != nil {
					return
				}
				if v.detailCache == nil {
					v.detailCache = make(map[string]*git.CommitDetail)
				}
				// Bound the preview cache; large commit lists must not retain every detail.
				if len(v.detailCache) >= 80 {
					for key := range v.detailCache {
						delete(v.detailCache, key)
						break
					}
				}
				if len(detail.Files) <= 2000 && len(detail.Body) <= 65536 {
					v.detailCache[commit.Hash] = detail
				}
				v.renderDetail(commit, detail, nil, nil)
			})
		}
		if ctx.Err() != nil {
			return
		}
		metadata, err := repo.LoadCommitMetadata(ctx, detail.Hash)
		if ctx.Err() != nil {
			return
		}
		v.app.QueueUpdateDraw(func() {
			if ctx.Err() == nil {
				v.renderDetail(commit, detail, metadata, err)
			}
		})
	}()
}

func (v *GraphView) renderDetail(commit *components.GitCommit, detail *git.CommitDetail, metadata *git.CommitMetadata, metadataErr error) {
	presentation := presentCommit(detail, metadata, metadataErr)
	var text strings.Builder

	// Subject
	text.WriteString(fmt.Sprintf("[%s::b]%s[-:-:-]\n", theme.TagAccent(), detail.Subject))

	// Commit type indicator
	if commit.IsStash {
		text.WriteString(fmt.Sprintf("[%s]◇ Stash Entry[-]\n", theme.TagInfo()))
	} else if commit.IsMerge {
		text.WriteString(fmt.Sprintf("[%s]◆ Merge Commit[-]\n", theme.TagAccent()))
	}

	// Show branch info prominently right after subject
	if metadata != nil && len(metadata.Branches) > 0 {
		// Find the primary branch (prefer local over remote, current branch first)
		var localBranches, remoteBranches []string
		for _, branch := range metadata.Branches {
			if strings.HasPrefix(branch, "origin/") {
				remoteBranches = append(remoteBranches, branch)
			} else {
				localBranches = append(localBranches, branch)
			}
		}

		// Display primary branch
		if len(localBranches) > 0 {
			text.WriteString(fmt.Sprintf("[%s]Branch:[-] [%s]%s[-]", theme.TagFgDim(), theme.TagSuccess(), localBranches[0]))
			if len(localBranches) > 1 {
				text.WriteString(fmt.Sprintf(" [%s](+%d more)[-]", theme.TagFgDim(), len(localBranches)-1))
			}
			text.WriteString("\n")
		} else if len(remoteBranches) > 0 {
			text.WriteString(fmt.Sprintf("[%s]Branch:[-] [%s]%s[-]", theme.TagFgDim(), theme.TagFgDim(), remoteBranches[0]))
			if len(remoteBranches) > 1 {
				text.WriteString(fmt.Sprintf(" [%s](+%d more)[-]", theme.TagFgDim(), len(remoteBranches)-1))
			}
			text.WriteString("\n")
		}
	}

	// ─── Commit ───
	text.WriteString(fmt.Sprintf("\n[%s::b]─── Commit ───[-:-:-]\n", theme.TagFgDim()))
	text.WriteString(fmt.Sprintf("[%s]Hash:[-]   %s\n", theme.TagFgDim(), detail.ShortHash))

	// GPG Signature (compact)
	if presentation.signature == "loading" || presentation.signature == "unavailable" {
		if presentation.signature == "unavailable" {
			text.WriteString("Signature / branches: unavailable\n")
		} else {
			text.WriteString("Signature / branches: loading…\n")
		}
	} else if presentation.signature != "unsigned" {
		if presentation.signature == "verified" {
			text.WriteString(fmt.Sprintf("[%s]Signed:[-] [%s]✓ Verified[-]\n", theme.TagFgDim(), theme.TagSuccess()))
		} else {
			text.WriteString(fmt.Sprintf("[%s]Signed:[-] [%s]✗ Invalid[-]\n", theme.TagFgDim(), theme.TagError()))
		}
	}

	// ─── Author ───
	text.WriteString(fmt.Sprintf("\n[%s::b]─── Author ───[-:-:-]\n", theme.TagFgDim()))
	text.WriteString(fmt.Sprintf("[%s]Name:[-]   %s\n", theme.TagFgDim(), detail.Author))
	text.WriteString(fmt.Sprintf("[%s]Date:[-]   %s [%s](%s)[-]\n",
		theme.TagFgDim(),
		detail.AuthorDate.Format("2006-01-02 15:04"),
		theme.TagFgDim(),
		relativeTimeCompact(detail.AuthorDate)))

	// Committer (only if different)
	if detail.Committer != detail.Author {
		text.WriteString(fmt.Sprintf("\n[%s::b]─── Committer ───[-:-:-]\n", theme.TagFgDim()))
		text.WriteString(fmt.Sprintf("[%s]Name:[-]   %s\n", theme.TagFgDim(), detail.Committer))
	}

	// ─── Parents ─── (with subjects)
	if len(presentation.parents) > 0 {
		text.WriteString(fmt.Sprintf("\n[%s::b]─── Parents ───[-:-:-]\n", theme.TagFgDim()))
		for _, parent := range presentation.parents {
			shortParent := parent.hash
			subject := truncateCommitText(parent.subject, 40)
			if subject != "" {
				text.WriteString(fmt.Sprintf("[%s]%s[-] %s\n", theme.TagInfo(), shortParent, subject))
			} else {
				text.WriteString(fmt.Sprintf("[%s]%s[-]\n", theme.TagInfo(), shortParent))
			}
		}
	}

	// ─── Refs ───
	if metadata != nil && len(metadata.Refs) > 0 {
		text.WriteString(fmt.Sprintf("\n[%s::b]─── Refs ───[-:-:-]\n", theme.TagFgDim()))
		for _, ref := range metadata.Refs {
			if isTagRef(ref) {
				text.WriteString(fmt.Sprintf("[%s]⚑[-] %s\n", theme.TagWarning(), ref))
			} else {
				text.WriteString(fmt.Sprintf("[%s]→[-] %s\n", theme.TagAccent(), ref))
			}
		}
	}

	// ─── Branches ─── (compact, max 5)
	if metadata != nil && len(metadata.Branches) > 0 {
		text.WriteString(fmt.Sprintf("\n[%s::b]─── Branches ───[-:-:-]\n", theme.TagFgDim()))
		maxShow := 5
		for i, branch := range metadata.Branches {
			if i >= maxShow {
				text.WriteString(fmt.Sprintf("[%s]... +%d more[-]\n", theme.TagFgDim(), len(metadata.Branches)-maxShow))
				break
			}
			if strings.HasPrefix(branch, "origin/") {
				text.WriteString(fmt.Sprintf("[%s]○[-] %s\n", theme.TagFgDim(), branch))
			} else {
				text.WriteString(fmt.Sprintf("[%s]●[-] %s\n", theme.TagSuccess(), branch))
			}
		}
	}

	// ─── Changes ───
	text.WriteString(fmt.Sprintf("\n[%s::b]─── Changes ───[-:-:-]\n", theme.TagFgDim()))
	text.WriteString(fmt.Sprintf("[%s]Total:[-]  %d files  [%s]+%d[-] [%s]-%d[-]\n",
		theme.TagFgDim(),
		detail.Stats.FilesChanged,
		theme.TagSuccess(), detail.Stats.Insertions,
		theme.TagError(), detail.Stats.Deletions))

	// Per-file stats
	if len(detail.Files) > 0 {
		text.WriteString("\n")
		maxFiles := 15 // Limit files shown in preview
		for i, file := range detail.Files {
			if i >= maxFiles {
				text.WriteString(fmt.Sprintf("[%s]... +%d more files[-]\n", theme.TagFgDim(), len(detail.Files)-maxFiles))
				break
			}

			// Status color
			statusColor := commitFileStatusTag(file.Status)
			statusChar := file.Status.String()

			// Format stats
			var stats string
			if file.Binary {
				stats = fmt.Sprintf("[%s]bin[-]", theme.TagFgDim())
			} else {
				stats = fmt.Sprintf("[%s]+%-3d[-] [%s]-%-3d[-]",
					theme.TagSuccess(), file.Insertions,
					theme.TagError(), file.Deletions)
			}

			// Truncate path if needed
			path := file.Path
			runes := []rune(path)
			if len(runes) > 35 {
				path = "..." + string(runes[len(runes)-32:])
			}

			text.WriteString(fmt.Sprintf("[%s]%s[-] %s %s\n", statusColor, statusChar, stats, path))
		}
	}

	v.detailView.SetText(text.String())
}

func (v *GraphView) updateDetailUnstaged() {
	var text strings.Builder

	text.WriteString(fmt.Sprintf("[%s::b]○ Working Changes[-:-:-]\n", theme.TagAccent()))
	text.WriteString(fmt.Sprintf("\n[%s]Press Enter to open the staging workflow[-]\n", theme.TagFgDim()))

	// Get status
	status, err := v.repo.Status()
	if err != nil {
		text.WriteString(fmt.Sprintf("\n[%s]Error loading status[-]", theme.TagError()))
		v.detailView.SetText(text.String())
		return
	}

	// Categorize files
	var modified, added, deleted, untracked []git.StatusEntry
	for _, entry := range status {
		if entry.IsUntracked {
			untracked = append(untracked, entry)
		} else if entry.WorkStatus == git.FileModified {
			modified = append(modified, entry)
		} else if entry.WorkStatus == git.FileAdded {
			added = append(added, entry)
		} else if entry.WorkStatus == git.FileDeleted {
			deleted = append(deleted, entry)
		} else if entry.WorkStatus != 0 {
			modified = append(modified, entry)
		}
	}

	// Summary
	total := len(modified) + len(added) + len(deleted) + len(untracked)
	text.WriteString(fmt.Sprintf("\n[%s::b]─── Summary ───[-:-:-]\n", theme.TagFgDim()))
	text.WriteString(fmt.Sprintf("[%s]Total:[-] %d files\n", theme.TagFgDim(), total))

	if len(modified) > 0 {
		text.WriteString(fmt.Sprintf("[%s]Modified:[-] [%s]%d[-]\n", theme.TagFgDim(), theme.TagWarning(), len(modified)))
	}
	if len(added) > 0 {
		text.WriteString(fmt.Sprintf("[%s]Added:[-] [%s]%d[-]\n", theme.TagFgDim(), theme.TagSuccess(), len(added)))
	}
	if len(deleted) > 0 {
		text.WriteString(fmt.Sprintf("[%s]Deleted:[-] [%s]%d[-]\n", theme.TagFgDim(), theme.TagError(), len(deleted)))
	}
	if len(untracked) > 0 {
		text.WriteString(fmt.Sprintf("[%s]Untracked:[-] [%s]%d[-]\n", theme.TagFgDim(), theme.TagInfo(), len(untracked)))
	}

	// File list
	text.WriteString(fmt.Sprintf("\n[%s::b]─── Files ───[-:-:-]\n", theme.TagFgDim()))
	maxFiles := 20
	shown := 0

	// Show modified files
	for _, entry := range modified {
		if shown >= maxFiles {
			break
		}
		text.WriteString(fmt.Sprintf("[%s]M[-] %s\n", theme.TagWarning(), entry.Path))
		shown++
	}

	// Show added files
	for _, entry := range added {
		if shown >= maxFiles {
			break
		}
		text.WriteString(fmt.Sprintf("[%s]A[-] %s\n", theme.TagSuccess(), entry.Path))
		shown++
	}

	// Show deleted files
	for _, entry := range deleted {
		if shown >= maxFiles {
			break
		}
		text.WriteString(fmt.Sprintf("[%s]D[-] %s\n", theme.TagError(), entry.Path))
		shown++
	}

	// Show untracked files
	for _, entry := range untracked {
		if shown >= maxFiles {
			break
		}
		text.WriteString(fmt.Sprintf("[%s]?[-] %s\n", theme.TagInfo(), entry.Path))
		shown++
	}

	if total > maxFiles {
		text.WriteString(fmt.Sprintf("\n[%s]... and %d more files[-]\n", theme.TagFgDim(), total-maxFiles))
	}

	v.detailView.SetText(text.String())
}

func (v *GraphView) updateDetailBasic(commit *components.GitCommit) {
	// Fallback basic view when LoadCommit fails
	var text strings.Builder
	text.WriteString(fmt.Sprintf("[%s::b]%s[-:-:-]\n\n", theme.TagAccent(), commit.Message))
	text.WriteString(fmt.Sprintf("[%s]Hash:[-]   %s\n", theme.TagFgDim(), commit.Hash))
	text.WriteString(fmt.Sprintf("[%s]Author:[-] %s\n", theme.TagFgDim(), commit.Author))
	text.WriteString(fmt.Sprintf("[%s]Date:[-]   %s\n", theme.TagFgDim(), commit.Date.Format("2006-01-02 15:04")))

	if len(commit.Parents) > 0 {
		text.WriteString(fmt.Sprintf("[%s]Parents:[-] %v\n", theme.TagFgDim(), commit.Parents))
	}

	if len(commit.Refs) > 0 {
		text.WriteString(fmt.Sprintf("\n[%s]Refs:[-] [%s]%v[-]\n",
			theme.TagFgDim(), theme.TagWarning(), commit.Refs))
	}

	if commit.IsStash {
		text.WriteString(fmt.Sprintf("\n[%s]◇ Stash entry[-]", theme.TagInfo()))
	} else if commit.IsMerge {
		text.WriteString(fmt.Sprintf("\n[%s]◆ Merge commit[-]", theme.TagAccent()))
	}

	v.detailView.SetText(text.String())
}

func (v *GraphView) showCommitView(commit *components.GitCommit) {
	if commit == nil {
		return
	}

	// Handle pseudo-node selection - open staging workflow
	if commit.IsPseudoNode && commit.PseudoType == "unstaged" {
		stagingWorkflow := NewStagingWorkflowView(v.app, v.repo)
		v.app.Pages().Push(stagingWorkflow)
		v.app.Crumbs().SetPath([]string{"Graph", "Staging"})
		return
	}

	commitView := NewCommitView(v.app, v.repo, commit.Hash)
	v.app.Pages().Push(commitView)
	v.app.Crumbs().SetPath([]string{"Graph", commit.ShortHash})
}

func (v *GraphView) showDiff() {
	commit := v.gitGraph.GetSelected()
	if commit == nil {
		return
	}
	diffView := NewDiffView(v.app, v.repo, commit.Hash)
	v.app.Pages().Push(diffView)
	v.app.Crumbs().SetPath([]string{"Graph", "Diff"})
}

func (v *GraphView) checkout() {
	commit := v.gitGraph.GetSelected()
	if commit == nil {
		return
	}

	if commit.IsPseudoNode {
		return
	}
	v.mutations.confirm(v.app, v.repo, commitAction{kind: checkoutCommit, hash: commit.Hash, shortHash: commit.ShortHash, subject: commit.Message}, v.refresh)
}

func (v *GraphView) cherryPick() {
	commit := v.gitGraph.GetSelected()
	if commit == nil {
		return
	}

	if commit.IsPseudoNode {
		return
	}
	v.mutations.confirm(v.app, v.repo, commitAction{kind: cherryPickCommit, hash: commit.Hash, shortHash: commit.ShortHash, subject: commit.Message}, v.refresh)
}

func (v *GraphView) revert() {
	commit := v.gitGraph.GetSelected()
	if commit == nil {
		return
	}

	if commit.IsPseudoNode {
		return
	}
	v.mutations.confirm(v.app, v.repo, commitAction{kind: revertCommit, hash: commit.Hash, shortHash: commit.ShortHash, subject: commit.Message}, v.refresh)
}

func (v *GraphView) copyHash() {
	commit := v.gitGraph.GetSelected()
	if commit == nil {
		return
	}
	app.CopyCommitHash(commit.Hash)
}

func (v *GraphView) editCommitMessage() {
	commit := v.gitGraph.GetSelected()
	if commit == nil {
		return
	}

	// Don't allow editing stash entries
	if commit.IsStash {
		ShowErrorModal(v.app, "Cannot Edit", "Stash entries cannot be renamed.")
		return
	}

	// Safety check: is this commit pushed to a remote?
	pushed, err := v.repo.ReadCommitPushed(commit.Hash)
	if err != nil {
		ShowErrorModal(v.app, "Cannot Edit", err.Error())
		return
	}
	if pushed {
		ShowErrorModal(v.app, "Cannot Edit",
			"This commit has been pushed to a remote.\n\n"+
				"Editing the message would require a force push,\n"+
				"which could disrupt other collaborators.")
		return
	}

	// Get current commit message
	currentMsg, err := v.repo.GetCommitMessage(commit.Hash)
	if err != nil {
		ShowErrorModal(v.app, "Error", "Failed to get commit message: "+err.Error())
		return
	}

	// Show commit modal with current message pre-filled
	ShowCommitModal(v.app, fmt.Sprintf("Edit Commit Message (%s)", commit.ShortHash),
		currentMsg,
		func(newMessage string) {
			if newMessage == currentMsg {
				return // No change
			}

			v.mutations.execute(v.app, v.repo, commitAction{kind: rewordCommit, hash: commit.Hash, shortHash: commit.ShortHash, subject: commit.Message, message: newMessage}, v.refresh)
		})
}

func (v *GraphView) dropCommit() {
	commit := v.gitGraph.GetSelected()
	if commit == nil {
		return
	}

	if commit.IsStash {
		ShowErrorModal(v.app, "Cannot Drop", "Use the stash view to drop stash entries.")
		return
	}

	if commit.IsPseudoNode {
		return
	}

	pushed, err := v.repo.ReadCommitPushed(commit.Hash)
	if err != nil {
		ShowErrorModal(v.app, "Cannot Drop", err.Error())
		return
	}
	if pushed {
		ShowErrorModal(v.app, "Cannot Drop",
			"This commit has been pushed to a remote.\n\n"+
				"Dropping it would require a force push,\n"+
				"which could disrupt other collaborators.")
		return
	}

	v.mutations.confirm(v.app, v.repo, commitAction{kind: dropCommit, hash: commit.Hash, shortHash: commit.ShortHash, subject: commit.Message}, v.refresh)
}

func (v *GraphView) newBranch() {
	ShowInputModalWithValidator(v.app, "New Branch", "Branch name:",
		app.BranchNameValidator(),
		func(name string) {
			if name == "" {
				return
			}
			if err := v.repo.CreateBranch(name); err != nil {
				ShowErrorModal(v.app, "Create Failed", err.Error())
				return
			}
			app.ToastSuccess("Branch '" + name + "' created")
			v.refresh()
		})
}

func (v *GraphView) showError(err error) {
	v.detailView.SetText(fmt.Sprintf("[%s]Error:[-] %v", theme.TagError(), err))
}

// Search functionality

func (v *GraphView) startSearch() {
	v.searchActive = true
	v.searchQuery = ""
	v.searchMatches = nil
	v.searchIndex = 0
	v.graphPanel.SetTitle("/█")
}

func (v *GraphView) handleSearchInput(event *tcell.EventKey) {
	switch event.Key() {
	case tcell.KeyEscape:
		v.searchActive = false
		v.searchQuery = ""
		v.searchMatches = nil
		v.graphPanel.SetTitle("Commit Graph")
	case tcell.KeyEnter:
		v.searchActive = false
		if len(v.searchMatches) > 0 {
			v.graphPanel.SetTitle(fmt.Sprintf("Commit Graph [%d matches]", len(v.searchMatches)))
			app.ToastSuccess(fmt.Sprintf("Found %d matches", len(v.searchMatches)))
		} else {
			v.graphPanel.SetTitle("Commit Graph")
			if v.searchQuery != "" {
				app.ToastInfo("No matches found")
			}
		}
	case tcell.KeyBackspace, tcell.KeyBackspace2:
		if len(v.searchQuery) > 0 {
			v.searchQuery = v.searchQuery[:len(v.searchQuery)-1]
			v.updateSearchMatches()
			v.graphPanel.SetTitle("/" + v.searchQuery + "█")
		}
	case tcell.KeyRune:
		v.searchQuery += string(event.Rune())
		v.updateSearchMatches()
		v.graphPanel.SetTitle("/" + v.searchQuery + "█")
		// Jump to first match as user types
		if len(v.searchMatches) > 0 {
			v.searchIndex = 0
			v.gitGraph.SetSelectedIndex(v.searchMatches[0])
		}
	}
	// All keys are consumed during search - don't let anything through
}

func (v *GraphView) updateSearchMatches() {
	v.searchMatches = nil
	if v.searchQuery == "" {
		return
	}

	graph := v.gitGraph.GetGraph()
	if graph == nil {
		return
	}

	for i, commit := range graph.Commits {
		// Match against message (case-insensitive)
		if strings.Contains(strings.ToLower(commit.Message), v.searchQuery) {
			v.searchMatches = append(v.searchMatches, i)
			continue
		}
		// Match against hash
		if strings.Contains(strings.ToLower(commit.Hash), v.searchQuery) ||
			strings.Contains(strings.ToLower(commit.ShortHash), v.searchQuery) {
			v.searchMatches = append(v.searchMatches, i)
			continue
		}
		// Match against author
		if strings.Contains(strings.ToLower(commit.Author), v.searchQuery) {
			v.searchMatches = append(v.searchMatches, i)
			continue
		}
		// Match against branch
		if strings.Contains(strings.ToLower(commit.Branch), v.searchQuery) {
			v.searchMatches = append(v.searchMatches, i)
		}
	}
}

func (v *GraphView) nextMatch() {
	if len(v.searchMatches) == 0 {
		if v.searchQuery != "" {
			app.ToastInfo("No matches")
		}
		return
	}

	v.searchIndex = (v.searchIndex + 1) % len(v.searchMatches)
	v.gitGraph.SetSelectedIndex(v.searchMatches[v.searchIndex])
	app.ToastInfo(fmt.Sprintf("Match %d/%d", v.searchIndex+1, len(v.searchMatches)))
}

func (v *GraphView) prevMatch() {
	if len(v.searchMatches) == 0 {
		if v.searchQuery != "" {
			app.ToastInfo("No matches")
		}
		return
	}

	v.searchIndex--
	if v.searchIndex < 0 {
		v.searchIndex = len(v.searchMatches) - 1
	}
	v.gitGraph.SetSelectedIndex(v.searchMatches[v.searchIndex])
	app.ToastInfo(fmt.Sprintf("Match %d/%d", v.searchIndex+1, len(v.searchMatches)))
}

// core.Widget interface

func (v *GraphView) Draw(screen tcell.Screen)      { v.flex.Draw(screen) }
func (v *GraphView) GetRect() (int, int, int, int) { return v.flex.GetRect() }
func (v *GraphView) SetRect(x, y, w, h int)        { v.flex.SetRect(x, y, w, h) }
func (v *GraphView) Blur()                         { v.flex.Blur() }
func (v *GraphView) HasFocus() bool                { return v.flex.HasFocus() }

func (v *GraphView) HandleKey(event *tcell.EventKey) bool {
	// When search is active, consume all input
	if v.searchActive {
		v.handleSearchInput(event)
		return true
	}

	// Start search with /
	if event.Rune() == '/' {
		v.startSearch()
		return true
	}

	if v.actions.Handle(event) {
		return true
	}
	return v.gitGraph.HandleKey(event)
}
