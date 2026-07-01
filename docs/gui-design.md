# ichi Desktop GUI — Design

A Vue 3 + Wails desktop frontend for ichi that mimics the TUI's interaction
model. Stack and conventions deliberately mirror the sibling project
`pigeon/frontend` so the two apps feel related.

- **Lives in:** `desktop/` (Go: Wails app + `GitService`) and
  `desktop/frontend/` (Vue app). Shares this repo's `go.mod`; the service wraps
  the existing `internal/git` package.
- **Graph layout:** computed **frontend-side in TypeScript** from
  `Parents`/`Refs`, rendered as an SVG railroad. The dado `LayoutGraph` stays
  terminal-only; render is render.

---

## 1. Stack (mirrors pigeon)

| Concern   | Choice                                                        |
| --------- | ------------------------------------------------------------- |
| Framework | Vue 3.5, `<script setup lang="ts">`, Composition API only     |
| Build     | Vite 8 + `vue-tsc`; lint oxlint + eslint; format prettier     |
| Desktop   | Wails 3.0-alpha + `@wailsio/runtime` (generated Go bindings)  |
| Icons     | `@phosphor-icons/vue`                                         |
| State     | Singleton composables + `reactive()` — **no Pinia**           |
| Routing   | **No vue-router** — a page-stack composable (mirrors dado `Pages()`) |
| Styling   | Hand-written CSS + CSS-var tokens; reuse pigeon `tokens.css`  |
| Fonts     | JetBrains Mono (graph/diff/hash/modeline) + Hanken Grotesk (chrome) |

pigeon already ships a vim modeline, `:` ex-command mode, `/` search, `j/k`
navigation, focus-pane highlighting, and relative line numbers — which is
exactly ichi's vocabulary. The interaction layer is a port, not an invention.

---

## 2. Backend — one Wails service over `git.Repository`

The recent decoupling means `LoadGraph/LoadStashes/SearchCommits` return plain
`git.Commit`/`git.Graph`, so they bind without dragging in dado.

```
desktop/
  main.go               // Wails app bootstrap, binds GitService
  service/
    git_service.go      // GitService: methods = frontend bindings
    events.go           // emits git:repo-changed, git:progress
  frontend/             // Vue app (section 3+)
```

```go
type GitService struct { repo *git.Repository }

// Graph / commits
func (s *GitService) LoadGraph(limit int) (*git.Graph, error)
func (s *GitService) LoadCommit(hash string) (*git.CommitDetail, error)
func (s *GitService) SearchCommits(q string, limit int) ([]*git.Commit, error)

// Two distinct stash concepts — expose BOTH:
//   LoadStashes  → []*git.Commit : graph-oriented "stash as pseudo-commit",
//                  for overlaying stashes in the graph view (z toggle).
//   ListStashes  → []git.Stash   : the stash workflow/list view's real model
//                  (Index, Branch, Message). The Stash view uses THIS.
func (s *GitService) LoadStashes() ([]*git.Commit, error)
func (s *GitService) ListStashes() ([]git.Stash, error)

// Status / staging
func (s *GitService) Status() ([]git.StatusEntry, error)
func (s *GitService) StageFile(p string) error          // + StageAll/UnstageFile/UnstageAll
func (s *GitService) DiscardFileChanges(p string) error
func (s *GitService) Commit(msg string) error           // + CommitAmend
func (s *GitService) StageHunk/StageLines/UnstageHunk/DiscardHunk(...)

// Diff (raw unified diff string; parsed client-side)
// NOTE: these are frontend-facing wrapper names. The underlying repo methods
// are GetWorkingFileDiff / GetStagedFileDiff / GetCommitDiff / GetDiffBetween
// (internal/git/diff.go). Keep the wrappers thin or rename to match — pick one
// and be consistent; the doc uses short names for readability.
func (s *GitService) WorkingFileDiff(p string) (string, error)  // GetWorkingFileDiff
func (s *GitService) StagedFileDiff(p string) (string, error)   // GetStagedFileDiff
func (s *GitService) CommitDiff(hash string) (string, error)    // GetCommitDiff
func (s *GitService) DiffBetween(from, to string) (string, error) // GetDiffBetween

// Branches / tags
func (s *GitService) ListBranches() ([]git.Branch, error)       // + Local/Remote
func (s *GitService) Checkout(ref string) error
func (s *GitService) CreateBranch/DeleteBranch/RenameBranch/MergeBranch/RebaseBranch(...)

// Stash
func (s *GitService) StashPush/Pop/Apply/Drop/Branch(...)

// Commit ops
func (s *GitService) CherryPick(hash string) error              // + Revert/ResetSoft/ResetHard

// Remote
func (s *GitService) Push/Pull/Fetch(...) error                 // emit git:progress

// Conflict
func (s *GitService) GetConflictState() (*git.ConflictState, error)
func (s *GitService) ParseConflictFile(p string) (...)
func (s *GitService) WriteResolvedFile/StageResolvedFile/MergeContinue/MergeAbort(...)

// Completion (drives command-line arg suggestions)
func (s *GitService) ListFiles/ListBranchNames/ListTagNames/ListRecentCommitHashes(prefix string) []string

// Repo
func (s *GitService) RepoInfo() RepoInfo   // path, branch, HEAD, ahead/behind, counts
func (s *GitService) SetPath(p string) error
```

**Events.** Long ops emit Wails events; the UI refreshes reactively instead of
polling (mirrors pigeon's background sync):

- `git:repo-changed` — after any mutation → stores reload.
- `git:progress` — `{op, phase, pct}` for push/pull/fetch/rebase.

**PRs (optional, phase 5).** This is not just "bind `remote.Provider`." The TUI
PR list (`internal/views/pr_list.go:98 initProvider`) runs a real init handshake
the GUI must reproduce, each step with its own error/empty state:

1. `RemoteURL("origin")` → if empty, surface "no remote 'origin'".
2. `remote.DetectFromURL(url)` → returns `(provider, repoPath, err)`; provider
   may be unsupported.
3. `provider.Authenticate()` → may fail (no token / expired) → auth-error state.
4. only then `provider.ListPRs(repoPath, opts)`.

Expose this as a service-side flow so the frontend gets a tagged result, not a
bare list:

```go
type PRInit struct { Provider, RepoPath string; State string /* ok|no-remote|unsupported|auth-error */; Err string }
func (s *GitService) InitPRProvider() (PRInit, error)
func (s *GitService) ListPRs(opts remote.ListPRsOpts) ([]remote.PullRequest, error)
func (s *GitService) GetPR(id int) (*remote.PullRequest, error)
func (s *GitService) GetPRFiles(id int) ([]remote.ChangedFile, error)
func (s *GitService) GetPRDiff(id int) (string, error)
func (s *GitService) ListReviews(id int) ([]remote.Review, error)
func (s *GitService) ListComments(id int) ([]remote.Comment, error)
func (s *GitService) GetChecks(id int) ([]remote.Check, error)
func (s *GitService) SubmitReview(id int, in remote.SubmitReviewInput) error
func (s *GitService) AddComment(id int, in remote.CommentInput) error
func (s *GitService) MergePR(id int, opts remote.MergeOpts) error
```

The frontend renders distinct states for `no-remote` / `unsupported` /
`auth-error` (a "connect a token" prompt) before any list appears.

---

## 3. App shell & navigation — port the page stack

ichi is a **page stack with breadcrumbs**, not tabs. Reproduce that, not
vue-router.

```ts
// stores/useNav.ts  (singleton)
type ViewId =
  | 'graph' | 'status' | 'staging' | 'diff' | 'commit' | 'branches'
  | 'stashes' | 'conflict' | 'prList' | 'prDetail' | 'blame' | 'fileLog'

interface Frame { view: ViewId; props?: Record<string, unknown>; title: string }

const stack = reactive<Frame[]>([{ view: 'graph', title: 'Commit Graph' }])
export function useNav() { return { stack, push, pop, replace, current, crumbs } }
```

```
AppShell.vue
├── TopBar          repo · branch · ahead/behind · breadcrumb (~/repo/graph)
├── <component :is="viewFor(nav.current.view)" v-bind="nav.current.props"/>
├── overlays/       CommandPalette · CommandLine · HelpSheet · ThemePicker · RepoSwitcher · InputModal
└── ModeLine        MODE · focus pane · selection · position %
```

`Esc`/`Ctrl+O` → `nav.pop()`. Globals `g/s/b/S/p` → replace/push the matching
view, like the TUI globals.

---

## 4. Keymap engine — the heart of "mimic the TUI"

A central composable owns a **mode state machine** and a **per-view keymap
registry**, so each view declares keys the way `graph.go` does with
`AddSimple('d','Diff',fn)`.

```ts
// stores/useKeymap.ts
type Mode = 'normal' | 'search' | 'command' | 'visual' | 'input'
const mode = ref<Mode>('normal')
const registry = new Map<ViewId, Record<string, () => void>>()

export function defineViewKeys(view: ViewId, map: Record<string, () => void>) {
  registry.set(view, map)
}

// one global listener; route by mode, then by active view
window.addEventListener('keydown', (e) => {
  if (mode.value === 'command') return commandLine.handle(e)   // ':'
  if (mode.value === 'search')  return searchBar.handle(e)     // '/'
  registry.get(nav.current.view)?.[chord(e)]?.()               // supports numeric prefix (5j)
})
```

Each view registers in `onMounted`, one-to-one with its Go keymap.

### Per-view keymaps (from the TUI)

**Graph** — `j/k` nav · `g/G` top/bottom · `Enter` detail · `d` diff · `c`
checkout · `r` refresh · `C` cherry-pick · `R` revert · `e` edit msg · `y` copy
hash · `z` toggle stashes · `b` new branch · `D` drop · `/` search · `n/N` match.

**Status** — `Space` toggle stage · `a` stage all · `u` unstage all · `c`
commit · `d` diff · `r` refresh · `D` discard · `Tab` switch panel · `Enter`
interactive staging.

**Staging** — `j/k` lines · `J/K` hunks · `Space` toggle line · `s` stage hunk ·
`Enter` stage lines · `S` stage all · `u` unstage hunk · `D` discard hunk · `a`
select all · `c` clear · `r` refresh.

**Commit detail** — `j/k` files · `Tab` switch focus · `Enter` file diff · `d`
full diff · `c` checkout · `C` cherry-pick · `R` revert · `y` copy.

**Branches** — `j/k` · `Enter` checkout · `n` new · `d` delete · `r` rename ·
`m` merge · `b` rebase · `R` toggle remotes · `g` refresh · `y` copy.

**Stash** — `j/k` · `Enter`/`D` diff · `a` apply · `p` pop · `d` drop · `n` new
· `b` branch · `r` refresh.

**Conflict** — `Tab` next pane (ours→base→theirs→resolved) · `o/b/t` accept ·
`e` editor · `j/k` regions · `s` save+next · `c` clear · `d` delete line · `C`
continue · `x` abort · `Esc` cancel.

**Diff** — `j/k` scroll · `n/N` change · `g/G` · `l` line numbers · `Esc` back.

**Blame** — `j/k` · `Enter` detail · `d` diff · `L` file log · `y` copy.

**PR list** — `j/k` · `Enter` detail · `c` checkout · `o` browser · `f` filter ·
`r` refresh.

**PR detail** — `1/2/3` switch tab (Files / Conversation / Checks) · `a`
approve · request-changes · `c` comment · `m` merge · `o` browser · `j/k`
navigate tree. (This view has three sub-modes + review actions — it is the
bulk of phase 5's weight, not a thin add-on.)

### Global keys

`:` command mode · `Ctrl+P`/`Ctrl+K` palette · `Ctrl+R` repo switcher · `?`
help · `T` theme · `Esc`/`Ctrl+O` back · `q` quit (root) · `g/s/b/S/p` jump to
graph/status/branches/stash/PRs.

### Command mode (`:`)

Reuse pigeon's `CommandLine` UI; drive ichi's command set with arg-completion
fed by `ListBranchNames/ListFiles/ListRecentCommitHashes`:

```
:w  :q  :wq            :push/:P  :pull/:p  :fetch/:f
:checkout/:co <ref>    :pick  :revert  :drop
:merge  :rebase        :apply  :pop
:diff/:d  :reset       :blame <file>  :log <file>
:rename                :repo/:r <alias>
```

### Command palette (`Ctrl+P`)

pigeon's `CommandMenu` overlay → fuzzy list of branches + commands + nav
targets (ichi's `finder.go`).

---

## 5. Selection / context model

Port `internal/selection`. Each view store exposes `selection()`; palette and
`:` commands read the active view's selection — same as Go's
`selection.Provider`.

**Important:** the Go `Context.Commit` is a `*components.GitCommit` (the dado
type), and `HasCommit()` guards on `!Commit.IsPseudoNode`
(`internal/selection/selection.go:32`) — the "Working Changes" / staged pseudo
rows in the graph must NOT be treated as real commits by `:pick`, `:diff`,
checkout, etc. Since the GUI's graph rows are plain `git.Commit` (which has no
`IsPseudoNode`), define a **frontend selection DTO** that re-introduces the flag
the view layer adds when it builds pseudo rows:

```ts
interface SelectedCommit {
  hash: string
  isPseudoNode: boolean   // true for the unstaged/staged graph rows — set by the view, not the backend
  pseudoType?: 'unstaged' | 'staged'
}
interface Selection {
  view: ViewId
  commit?: SelectedCommit
  branch?: Branch
  stash?: Stash          // git.Stash (Index/Branch/Message), NOT the stash-as-commit form
  file?: StatusEntry
}
const ctx = computed<Selection>(() => activeViewStore().selection())

// mirror the Go guards — pseudo rows are not real commits
const hasCommit = computed(() => !!ctx.value.commit && !ctx.value.commit.isPseudoNode)
```

Commands gated on `hasCommit` (cherry-pick, revert, drop, checkout-commit,
diff) stay disabled on pseudo rows, exactly like the TUI.

---

## 6. Component / store map

```
stores (singleton composables)        components/
  useNav        page stack              shell/     TopBar, ModeLine, SplitPane, FocusPanel
  useKeymap     modes + keys            graph/     GraphCanvas (SVG railroad), CommitDetail
  useRepo       branch/HEAD/counts      status/    StatusList (staged|unstaged split)
  useGraph      commits + TS layout     staging/   HunkView (line-select staging)
  useStatus                             diff/      DiffViewer (parse unified diff → rows)
  useDiff       unified-diff parser     branches/  BranchTable
  useBranches                           stash/     StashList
  useStash                              conflict/  ConflictResolver (4-pane)
  usePR                                 pr/        PrList (tree), PrDetail (files + diff)
  useTheme      token swap              ui/        ListRow, Panel, Table, KeyHintBar, Modal
  useSettings   persisted (localStorage) overlays/ CommandPalette, CommandLine, HelpSheet, ThemePicker
```

Primitives lifted from pigeon conventions:

- `Panel` — rounded-border surface (= dado Panel).
- `ListRow` — relative-line gutter + `.focused`/`.active`/`.selected` classes.
- `SplitPane` — the TUI's 60/40, 50/50, 35/65 splits.
- `KeyHintBar` — renders each view's `Hints()` along the bottom.

---

## 7. Graph layout (TS-side SVG)

Reimplement lane assignment in TypeScript, then draw SVG. Mirrors dado's
`LayoutGraph` reclaim rule (lowest free column reused as branches terminate).

```ts
// stores/useGraph.ts
interface Row { commit: Commit; column: number; lanes: Lane[] }  // lanes = active edges through this row
function layout(commits: Commit[], currentBranch: string): Row[] {
  // newest-first; assign current branch tip → column 0; reuse lowest free column
  // as parents resolve; emit per-row lane states for the SVG to stroke.
}
```

Render: one `<g>` per row; lanes are vertical/diagonal `<path>` strokes colored
from `--accent --green --orange --purple --cyan --red --star` (the palette dado
cycles in `GitGraph.Draw`); commit node is a `<circle>`; ref chips + subject +
author follow in flex columns. Selection/focus uses `--accent-soft` fill and an
`inset 0 0 0 1px --accent-line` ring, matching pigeon's row styling.

---

## 8. Theme

Copy pigeon `tokens.css` (TokyoNight night/storm/moon/day) unchanged. ichi's
theme selector becomes a class swap on `<html>` (`theme-night` …) via
`useTheme`, identical to pigeon's `applyTheme`. Settings persist to
`localStorage` under `ichi.settings` via a `reactive()` singleton + `watch`.

---

## 9. Phased build plan

| Phase | Scope                                                                 | Size      |
| ----- | --------------------------------------------------------------------- | --------- |
| 0     | `desktop/service` GitService over `git.Repository` + Wails events     | ~1 day    |
| 1     | Shell + keymap engine + page stack + command line + tokens + modeline | ~2 days   |
| 2     | Read views: Graph (TS SVG) + CommitDetail + Diff + Status + Branches + Stash | ~3–4 days |
| 3     | Write actions: stage/commit, checkout, cherry-pick/revert/drop, branch ops, push/pull/fetch | ~2 days   |
| 4     | Hard views: interactive hunk staging + 4-pane conflict resolver       | ~2–3 days |
| 5     | PRs (optional): provider init/auth handshake + list + detail (3 tabs: files/conversation/checks) + review actions (approve / request-changes / comment / merge) | ~3–4 days |

The TS graph layout and the conflict resolver are the only non-trivial pieces;
everything else is list + keymap + binding, which pigeon's patterns make
mechanical.
