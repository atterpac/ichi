/**
 * Shared sample data + view state for the working-tree design directions.
 * Every design renders the same reactive store so switching directions keeps
 * selection, collapse state, and staging in place.
 */
import { computed, reactive } from 'vue'

export type Section = 'conflicts' | 'staged' | 'unstaged' | 'untracked'
export type Status = 'M' | 'A' | 'D' | 'R' | '?' | '!'

export type WorkFile = {
  path: string
  status: Status
  section: Section
  add: number
  del: number
  oldPath?: string
}

export type DiffLine = { kind: 'ctx' | 'add' | 'del' | 'hunk'; old?: number; new?: number; text: string }

export const SECTION_LABEL: Record<Section, string> = {
  conflicts: 'Conflicts',
  staged: 'Staged',
  unstaged: 'Unstaged',
  untracked: 'Untracked',
}
export const SECTION_ORDER: Section[] = ['conflicts', 'staged', 'unstaged', 'untracked']
export const STATUS_NAME: Record<Status, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  '?': 'Untracked',
  '!': 'Conflict',
}

const seed: WorkFile[] = [
  { path: 'internal/git/stash.go', status: '!', section: 'conflicts', add: 12, del: 4 },
  { path: 'desktop/services/refs.go', status: 'M', section: 'staged', add: 48, del: 11 },
  { path: 'desktop/services/stash.go', status: 'M', section: 'staged', add: 22, del: 6 },
  { path: 'internal/git/branches.go', status: 'M', section: 'staged', add: 31, del: 19 },
  { path: 'desktop/frontend/src/components/graph/CommitDetail.vue', status: 'M', section: 'unstaged', add: 96, del: 8 },
  { path: 'desktop/frontend/src/components/graph/GraphView.vue', status: 'M', section: 'unstaged', add: 24, del: 3 },
  { path: 'desktop/frontend/src/theme/views/graph.css', status: 'M', section: 'unstaged', add: 44, del: 0 },
  { path: 'desktop/frontend/src/components/shell/IchiSidebar.vue', status: 'D', section: 'unstaged', add: 0, del: 212 },
  { path: 'desktop/frontend/src/components/shell/nav.ts', status: 'R', section: 'unstaged', add: 6, del: 2, oldPath: 'desktop/frontend/src/components/shell/routes.ts' },
  { path: 'desktop/frontend/src/components/shell/FinderBar.vue', status: '?', section: 'untracked', add: 318, del: 0 },
  { path: 'desktop/frontend/src/__tests__/FinderBar.spec.ts', status: '?', section: 'untracked', add: 88, del: 0 },
  { path: 'desktop/frontend/public/fonts/Inter.woff2', status: '?', section: 'untracked', add: 0, del: 0 },
]

export const DIFF: DiffLine[] = [
  { kind: 'hunk', text: '@@ -182,6 +182,48 @@ const working = computed(() => …)' },
  { kind: 'ctx', old: 182, new: 182, text: "        <UiButton class=\"working-tree-action\" @click=\"emit('navigate', 'status')\"" },
  { kind: 'ctx', old: 183, new: 183, text: '          >Review changes</UiButton' },
  { kind: 'ctx', old: 184, new: 184, text: '        >' },
  { kind: 'add', new: 185, text: '        <section' },
  { kind: 'add', new: 186, text: '          v-for="section in workingSections"' },
  { kind: 'add', new: 187, text: '          :key="section.id"' },
  { kind: 'add', new: 188, text: '          class="working-section"' },
  { kind: 'add', new: 189, text: '        >' },
  { kind: 'add', new: 190, text: '          <h4><button :aria-expanded="!collapsed.has(section.id)">' },
  { kind: 'ctx', old: 185, new: 191, text: '      </template>' },
  { kind: 'hunk', text: '@@ -58,7 +64,6 @@ const files = computed(() => …)' },
  { kind: 'del', old: 58, text: "const working = props.commit.Hash === 'WORKING'" },
  { kind: 'add', new: 64, text: "const working = computed(() => props.commit.Hash === '__ichi_working_changes__')" },
  { kind: 'ctx', old: 59, new: 65, text: 'const author = computed(() => props.detail?.Author || props.commit.Author)' },
]

export const GRAPH_ROWS = [
  { hash: '', subject: 'Working tree', meta: '12 files', lane: 0, working: true },
  { hash: '2a44073', subject: 'Branch View and navigation changes', meta: 'atterpac · 2d', lane: 0 },
  { hash: '5c20aee', subject: 'gitignore', meta: 'atterpac · 3d', lane: 0 },
  { hash: '0ba44b3', subject: 'first iteration of the diff view', meta: 'atterpac · 5d', lane: 1 },
  { hash: '1f1ce00', subject: 'add themes and bit of redesign', meta: 'atterpac · 6d', lane: 0 },
  { hash: '2aa2b1c', subject: 'wip', meta: 'atterpac · 1w', lane: 0 },
]

export const wt = reactive({
  files: seed.map((f) => ({ ...f })),
  selected: 'desktop/frontend/src/components/graph/CommitDetail.vue',
  collapsed: new Set<Section>(['untracked']),
  collapsedDirs: new Set<string>(),
  message: 'graph: preview working tree files in inspector',
  body: '',
  amend: false,
  showConflicts: true,
})

export const visibleFiles = computed(() =>
  wt.files.filter((f) => wt.showConflicts || f.section !== 'conflicts'),
)

export const sections = computed(() =>
  SECTION_ORDER.map((id) => ({
    id,
    label: SECTION_LABEL[id],
    files: visibleFiles.value.filter((f) => f.section === id),
  })).filter((s) => s.files.length),
)

export const totals = computed(() => {
  const count = (id: Section) => visibleFiles.value.filter((f) => f.section === id).length
  return {
    files: visibleFiles.value.length,
    conflicts: count('conflicts'),
    staged: count('staged'),
    unstaged: count('unstaged'),
    untracked: count('untracked'),
    add: visibleFiles.value.reduce((n, f) => n + f.add, 0),
    del: visibleFiles.value.reduce((n, f) => n + f.del, 0),
    stagedAdd: visibleFiles.value.filter((f) => f.section === 'staged').reduce((n, f) => n + f.add, 0),
    stagedDel: visibleFiles.value.filter((f) => f.section === 'staged').reduce((n, f) => n + f.del, 0),
  }
})

export const selectedFile = computed(() => wt.files.find((f) => f.path === wt.selected))

export function name(path: string) {
  return path.slice(path.lastIndexOf('/') + 1)
}
export function dir(path: string) {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}
/** Trim the shared `desktop/frontend/src/` noise so sample paths read like the real app. */
export function shortDir(path: string) {
  return dir(path).replace(/^desktop\/frontend\/src\//, '')
}

export function toggleSection(id: Section) {
  if (wt.collapsed.has(id)) wt.collapsed.delete(id)
  else wt.collapsed.add(id)
}
export function toggleDir(key: string) {
  if (wt.collapsedDirs.has(key)) wt.collapsedDirs.delete(key)
  else wt.collapsedDirs.add(key)
}

/** Stage/unstage toggles between sections; untracked stages as an add. */
export function toggleStage(file: WorkFile) {
  if (file.section === 'conflicts') return
  if (file.section === 'staged') file.section = file.status === 'A' ? 'untracked' : 'unstaged'
  else {
    if (file.section === 'untracked') file.status = 'A'
    file.section = 'staged'
  }
}
export function stageAll(from: Section) {
  for (const f of wt.files.filter((f) => f.section === from)) toggleStage(f)
}

export function groupByDir(files: WorkFile[]) {
  const map = new Map<string, WorkFile[]>()
  for (const f of files) {
    const d = shortDir(f.path) || '.'
    if (!map.has(d)) map.set(d, [])
    map.get(d)!.push(f)
  }
  return [...map].map(([d, list]) => ({ dir: d, files: list }))
}

/** 0..1 share of the largest change, for proportional bars. */
export const maxChurn = computed(() => Math.max(1, ...visibleFiles.value.map((f) => f.add + f.del)))
