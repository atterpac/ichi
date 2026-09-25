<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch, type Component } from 'vue'
import OperationConfirmModal, { type OperationConfirmRequest } from '../overlays/OperationConfirmModal.vue'
import { NAV_GROUPS } from './nav'
import { notify } from '../../composables/useToasts'
import { setModeline, useModeline } from '../../composables/useModeline'
import { PhMagnifyingGlass, PhFileText, PhGitBranch, PhGitCommit, PhSquaresFour, PhClockCounterClockwise, PhPlus, PhArrowElbowDownLeft, PhTag, PhArrowsClockwise, PhGitDiff, PhGraph, PhArchive, PhUserList, PhClock, PhWarningDiamond, PhGitPullRequest, PhCloud } from '@phosphor-icons/vue'
import AuthorAvatar from '../common/AuthorAvatar.vue'
import { useWorkspaces, type WorkspaceRepo } from '../../composables/useWorkspaces'
import { useGitProfiles } from '../../composables/useGitProfiles'
import { switchRepository } from '../../composables/useRepoStatus'
import { repoSwitchBlocker } from '../../composables/useRepoSwitchGuard'
import { finderHistory, rememberFind } from './finderHistory'
import { CompletionService, GraphService, RefService } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import type { Branch, Commit } from '../../bindings/github.com/atterpac/ichi/internal/git'

const props = withDefaults(defineProps<{ initialQuery?: string }>(), { initialQuery: '' })

const emit = defineEmits<{ (e: 'close'): void; (e: 'profile', id: string): void; (e: 'navigate', view: string, focus?: string): void }>()

const workspaces = useWorkspaces()
const profiles = useGitProfiles()
const workspaceFilter = ref('')
const openingRepo = ref(false)
type Mode = 'root' | 'branch' | 'commit' | 'file' | 'view' | 'repo' | 'workspace' | 'profile'
const MODES: { key: string; mode: Mode; label: string }[] = [
  { key: '', mode: 'root', label: 'All' },
  { key: 'f:', mode: 'file', label: 'Files' },
  { key: 'c:', mode: 'commit', label: 'Commits' },
  { key: 'b:', mode: 'branch', label: 'Branches' },
  { key: 'v:', mode: 'view', label: 'Views' },
  { key: 'r:', mode: 'repo', label: 'Repos' },
  { key: 'w:', mode: 'workspace', label: 'Workspaces' },
  { key: 'p:', mode: 'profile', label: 'Profiles' },
]
const MODE_ORDER = MODES.map(item => item.mode)
const input = ref<HTMLInputElement>()
const list = ref<HTMLElement>()
const finderId = useId()
const icons = { repo: PhArchive, workspace: PhSquaresFour, profile: PhUserList, branch: PhGitBranch, commit: PhGitCommit, file: PhFileText, view: PhSquaresFour, create: PhPlus, search: PhClockCounterClockwise }
const viewIcons: Record<string, Component> = {
  graph: PhGraph,
  status: PhGitDiff,
  commit: PhGitCommit,
  conflicts: PhWarningDiamond,
  branches: PhGitBranch,
  tags: PhTag,
  stashes: PhArchive,
  sync: PhArrowsClockwise,
  prs: PhGitPullRequest,
  remotes: PhCloud,
  diff: PhGitDiff,
  blame: PhUserList,
  'file-log': PhClock,
}
const loadingCommits = ref(false)
const commitError = ref(false)

const mode = ref<Mode>('root')
const query = ref(props.initialQuery)
const cursor = ref(0)
const pendingOperation = ref<OperationConfirmRequest | null>(null)

const branches = ref<Branch[]>([])
const files = ref<string[]>([])
const commits = ref<Commit[]>([])
const filesLoaded = ref(false)

type Seg = { t: string; hit: boolean }
type Row = {
  id: string
  label: string
  segs: Seg[]
  sub?: string
  kind: 'branch' | 'commit' | 'file' | 'view' | 'create' | 'search' | 'repo' | 'workspace' | 'profile'
  detail?: string
  author?: string
  commit?: string
  data?: unknown
  groupStart?: boolean
}

function subseqHits(text: string, q: string): number[] | null {
  if (!q) return []
  const t = text.toLowerCase()
  const hits: number[] = []
  let i = 0
  for (const ch of q.toLowerCase()) {
    i = t.indexOf(ch, i)
    if (i < 0) return null
    hits.push(i)
    i++
  }
  return hits
}

function toSegs(text: string, hits: number[]): Seg[] {
  const set = new Set(hits)
  const segs: Seg[] = []
  for (let i = 0; i < text.length; i++) {
    const hit = set.has(i)
    const last = segs[segs.length - 1]
    if (last && last.hit === hit) last.t += text[i]
    else segs.push({ t: text[i]!, hit })
  }
  return segs
}

function match<T>(items: T[], text: (item: T) => string): { item: T; hits: number[] }[] {
  return items
    .map((item) => ({ item, hits: subseqHits(text(item), query.value) }))
    .filter((m): m is { item: T; hits: number[] } => m.hits !== null)
    .sort((a, b) => (a.hits[0] ?? 0) - (b.hits[0] ?? 0) || text(a.item).length - text(b.item).length)
}

const LIMIT = 8
const UNIFIED_GROUP_LIMIT = 4

function viewEntries() {
  return NAV_GROUPS.flatMap((g) => g.items.filter((i) => i.id !== 'finder').map((i) => ({ ...i, group: g.title })))
}

function branchRows(cap: number): Row[] {
  return match(branches.value, (b) => b.Name)
    .slice(0, cap)
    .map(({ item, hits }) => ({
      id: item.Name,
      label: item.Name,
      segs: toSegs(item.Name, hits),
      sub: item.IsRemote ? 'remote' : [item.IsCurrent ? 'current' : '', !item.IsCurrent ? 'local' : '', item.Ahead ? `↑${item.Ahead}` : '', item.Behind ? `↓${item.Behind}` : ''].filter(Boolean).join(' ') || undefined,
      kind: 'branch' as const,
      data: item,
    }))
}

function viewRows(cap: number): Row[] {
  return match(viewEntries(), (v) => v.label)
    .slice(0, cap)
    .map(({ item, hits }) => ({ id: item.id, label: item.label, segs: toSegs(item.label, hits), sub: item.group, kind: 'view' as const, data: item.id }))
}

function fileRows(cap: number, source = files.value): Row[] {
  return match(source, (f) => f)
    .slice(0, cap)
    .map(({ item, hits }) => {
      const split = item.lastIndexOf('/') + 1
      return { id: item, label: item.slice(split), segs: toSegs(item.slice(split), hits.filter(hit => hit >= split).map(hit => hit - split)), detail: item.slice(0, split) || 'Repository root', kind: 'file' as const, data: item }
    })
}

function commitRows(cap: number): Row[] {
  return commits.value.slice(0, cap).map((c) => ({
    id: c.Hash,
    label: c.Message,
    segs: toSegs(c.Message, subseqHits(c.Message, query.value) ?? []),
    sub: c.ShortHash || c.Hash.slice(0, 7),
    author: c.Author,
    commit: c.Hash,
    kind: 'commit' as const,
    data: c,
  }))
}

function repositoryRows(cap: number): Row[] {
  const source = workspaces.state.repos.filter(r => !workspaceFilter.value || r.workspace === workspaceFilter.value)
    .sort((a,b) => Number(b.pinned) - Number(a.pinned) || b.lastOpened - a.lastOpened)
  return match(source, r => `${r.name} ${r.path}`).slice(0, cap).map(({item, hits}) => ({ id: item.path, label: item.name, segs: toSegs(item.name, hits.filter(i => i < item.name.length)), detail: item.path, sub: workspaces.state.workspaces.find(w => w.id === item.workspace)?.name, kind: 'repo', data: item }))
}
function workspaceRows(cap: number): Row[] {
  return match(workspaces.state.workspaces, w => w.name).slice(0, cap).map(({item, hits}) => ({ id: item.id, label: item.name, segs: toSegs(item.name, hits), sub: 'Workspace', detail: `${workspaces.state.repos.filter(r => r.workspace === item.id).length} repositories`, kind: 'workspace', data: item.id }))
}
function profileRows(cap: number): Row[] {
  return match(profiles.state.profiles, p => `${p.Label} ${p.Name} ${p.Email}`).slice(0, cap).map(({item, hits}) => ({ id: item.ID, label: item.Label, segs: toSegs(item.Label, hits.filter(i => i < item.Label.length)), detail: `${item.Name} <${item.Email}>`, sub: 'Assign to workspace', kind: 'profile', data: item.ID }))
}
async function openRepository(repo: WorkspaceRepo) {
  if (openingRepo.value) return
  const blocker = repoSwitchBlocker()
  if (blocker) { notify({ tone: 'warning', title: 'Cannot switch repository', message: blocker }); return }
  openingRepo.value = true
  try {
    await profiles.ready()
    const info = await switchRepository(repo.path)
    workspaces.openedRepo(repo.path, info.Path, info.Name)
    void profiles.effective()
    emit('close')
  } catch (e) { notify({ tone: 'danger', title: 'Cannot open repository', message: e instanceof Error ? e.message : String(e) }) }
  finally { openingRepo.value = false }
}
const results = computed<Row[]>(() => {
  if (mode.value === 'root') {
    if (query.value) {
      // unified: everything at once, grouped by kind — instant sources first
      const groups = [
        repositoryRows(UNIFIED_GROUP_LIMIT),
        workspaceRows(UNIFIED_GROUP_LIMIT),
        profileRows(UNIFIED_GROUP_LIMIT),
        viewRows(UNIFIED_GROUP_LIMIT),
        branchRows(UNIFIED_GROUP_LIMIT),
        fileRows(UNIFIED_GROUP_LIMIT),
        query.value.trim().length >= 2 ? commitRows(UNIFIED_GROUP_LIMIT) : [],
      ].filter((g) => g.length)
      return groups.flatMap((g, gi) => g.map((row, ri) => ({ ...row, groupStart: gi > 0 && ri === 0 })))
    }
    const recentSearches: Row[] = finderHistory.searches.slice(0, 3).map(value => ({ id: value, label: value, segs: toSegs(value, []), sub: 'Recent search', kind: 'search', data: value }))
    const recentFiles = fileRows(6, finderHistory.files.filter(file => files.value.includes(file)))
      .sort((a, b) => finderHistory.files.indexOf(a.id) - finderHistory.files.indexOf(b.id)).slice(0, 3)
    return [...recentSearches, ...repositoryRows(3), ...recentFiles, ...viewRows(6)]
  }
  if (mode.value === 'branch') {
    const rows = branchRows(LIMIT)
    const q = query.value.trim()
    if (q && !branches.value.some((b) => b.Name === q)) {
      rows.push({ id: '\0create', label: `＋ create branch “${q}”`, segs: toSegs(`＋ create branch “${q}”`, []), kind: 'create' })
    }
    return rows
  }
  if (mode.value === 'repo') return repositoryRows(LIMIT)
  if (mode.value === 'workspace') return workspaceRows(LIMIT)
  if (mode.value === 'profile') return profileRows(LIMIT)
  if (mode.value === 'file') return fileRows(LIMIT)
  if (mode.value === 'commit') return commitRows(LIMIT)
  return viewRows(LIMIT)
})

watch([query, mode], () => { cursor.value = 0 })
watch(results, () => { if (cursor.value >= results.value.length) cursor.value = Math.max(0, results.value.length - 1) })

// unified root: `b:` / `c:` / `f:` / `v:` prefixes lock a mode mid-typing
const PREFIX_MODES: Record<string, Mode> = { b: 'branch', c: 'commit', f: 'file', v: 'view', r: 'repo', w: 'workspace', p: 'profile' }
watch(query, (q) => {
  if (mode.value !== 'root') return
  const prefixed = /^([bcfvrwp]):(.*)$/i.exec(q)
  if (prefixed) {
    const rest = prefixed[2]!
    enterMode(PREFIX_MODES[prefixed[1]!.toLowerCase()]!)
    query.value = rest
  }
}, { immediate: true })

// commit search is the only async source: debounce against the backend
let commitTimer: ReturnType<typeof setTimeout> | undefined
watch([query, mode], ([q, m], _, onCleanup) => {
  let cancelled = false
  onCleanup(() => { cancelled = true; clearTimeout(commitTimer) })
  commits.value = []
  commitError.value = false
  loadingCommits.value = false
  if ((m !== 'commit' && m !== 'root') || q.trim().length < 2) return
  loadingCommits.value = true
  commitTimer = setTimeout(async () => {
    try {
      const found = await GraphService.SearchCommits(q, 12)
      if (!cancelled) commits.value = (found ?? []).filter((c): c is Commit => Boolean(c))
    } catch {
      if (!cancelled) commitError.value = true
    } finally {
      if (!cancelled) loadingCommits.value = false
    }
  }, 160)
}, { immediate: true })

function loadFiles() {
  if (filesLoaded.value) return
  filesLoaded.value = true
  CompletionService.ListFiles('')
    .then((f) => { files.value = f ?? [] })
    .catch(() => { files.value = [] })
}

function enterMode(next: Mode) {
  mode.value = next
  cursor.value = 0
  void nextTick(() => input.value?.focus())
  if (next === 'file') loadFiles()
}

function backToRoot() {
  mode.value = 'root'
  workspaceFilter.value = ''
  query.value = ''
  cursor.value = 0
}

async function checkout(b: Branch) {
  const name = b.IsRemote ? b.Name.slice(b.Name.indexOf('/') + 1) : b.Name
  try {
    await RefService.CheckoutBranch(name, false)
    notify({ tone: 'success', title: `Checked out ${name}` })
  } catch (err) {
    notify({ tone: 'danger', title: `Checkout failed`, message: err instanceof Error ? err.message : String(err) })
  }
  emit('close')
}

async function createBranch(name: string) {
  try {
    await RefService.CheckoutBranch(name, true)
    notify({ tone: 'success', title: `Created ${name}` })
  } catch (err) {
    notify({ tone: 'danger', title: `Create failed`, message: err instanceof Error ? err.message : String(err) })
  }
  emit('close')
}

function deleteBranch(b: Branch) {
  if (b.IsCurrent || b.IsRemote) {
    notify({ tone: 'danger', title: b.IsRemote ? 'Delete remote branches from the Branches view' : 'Cannot delete the checked-out branch' })
    return
  }
  pendingOperation.value = {
    title: 'Delete branch',
    message: `Delete local branch ${b.Name}.`,
    confirmLabel: 'Delete',
    target: b.Name,
    tone: 'danger',
    onConfirm: async () => {
      await RefService.DeleteBranch(b.Name, false)
      notify({ tone: 'success', title: `Deleted ${b.Name}` })
      branches.value = branches.value.filter((x) => x.Name !== b.Name)
    },
  }
}

function activate(row: Row) {
  if (openingRepo.value) return
  if (row.kind !== 'search') rememberFind(query.value, mode.value, row.kind === 'file' ? row.id : undefined)
  switch (row.kind) {
    case 'repo': void openRepository(row.data as WorkspaceRepo); return
    case 'workspace': workspaceFilter.value = row.id; query.value = ''; enterMode('repo'); return
    case 'profile': emit('profile', row.id); emit('close'); return
    case 'search':
      mode.value = 'root'
      query.value = row.data as string
      input.value?.focus()
      return
    case 'branch':
      void checkout(row.data as Branch)
      return
    case 'create':
      void createBranch(query.value.trim())
      return
    case 'view':
      emit('navigate', row.data as string)
      emit('close')
      return
    case 'commit':
      emit('navigate', 'graph', (row.data as Commit).Hash)
      emit('close')
      return
    case 'file':
      emit('navigate', 'file-log', row.data as string)
      emit('close')
      return
  }
}

const placeholder = computed(() => mode.value === 'root' ? 'Search repos, profiles, files, commits, and views…' : `Search ${MODES.find(item => item.mode === mode.value)?.label.toLowerCase()}…`)
const actionHint = computed(() => {
  const kind = results.value[cursor.value]?.kind
  return kind === 'branch' ? 'check out' : kind === 'create' ? 'create branch' : kind === 'search' ? 'search' : 'open'
})
watch([cursor, results], () => {
  void nextTick(() => list.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }))
})

function onKey(event: KeyboardEvent) {
  if (pendingOperation.value || openingRepo.value) return
  event.stopPropagation()
  if (event.isComposing) return
  const k = event.key
  if (k === 'Escape') { event.preventDefault(); emit('close'); return }
  if (k === 'Tab') {
    event.preventDefault()
    const at = MODE_ORDER.indexOf(mode.value)
    enterMode(MODE_ORDER[(at + (event.shiftKey ? MODE_ORDER.length - 1 : 1)) % MODE_ORDER.length]!)
    return
  }
  if (k === 'Backspace' && !query.value && mode.value !== 'root') {
    event.preventDefault(); backToRoot(); return
  }
  if (k === 'ArrowUp' || k === 'ArrowDown' || (event.ctrlKey && ['p', 'n'].includes(k.toLowerCase()))) {
    event.preventDefault()
    const delta = k === 'ArrowUp' || (event.ctrlKey && k.toLowerCase() === 'p') ? -1 : 1
    if (results.value.length) cursor.value = (cursor.value + results.value.length + delta) % results.value.length
    return
  }
  if (k === 'Enter' && (event.target === input.value || event.target === window)) {
    event.preventDefault()
    const row = results.value[cursor.value]
    if (row) activate(row)
    return
  }
  if (event.ctrlKey && k.toLowerCase() === 'd' && mode.value === 'branch') {
    event.preventDefault()
    const row = results.value[cursor.value]
    if (row?.kind === 'branch') deleteBranch(row.data as Branch)
  }
}

let previousFocus: HTMLElement | null = null
const savedModeline = { mode: '', hints: '' }

onMounted(async () => {
  previousFocus = document.activeElement as HTMLElement | null
  input.value?.focus()
  window.addEventListener('keydown', onKey, true)
  const ml = useModeline()
  Object.assign(savedModeline, { mode: ml.mode, hints: ml.hints })
  setModeline({ mode: 'FIND', hints: '⏎ act · esc close' })
  loadFiles()
  try {
    const all = await RefService.ListBranches()
    branches.value = all ?? []
  } catch {
    branches.value = []
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true)
  clearTimeout(commitTimer)
  setModeline(savedModeline)
  previousFocus?.focus()
})
</script>

<template>
  <div class="finder-backdrop" @mousedown.self="!pendingOperation && emit('close')">
    <section class="finderbar" role="dialog" aria-modal="true" aria-label="Global search">
      <div class="fb-prompt">
        <PhMagnifyingGlass :size="21" aria-hidden="true" />
        <input ref="input" v-model="query" class="fb-query" :placeholder="placeholder" aria-label="Search files, commits, branches, and views"
          role="combobox" aria-autocomplete="list" aria-expanded="true" :aria-controls="`${finderId}-results`"
          :aria-activedescendant="results.length ? `${finderId}-result-${cursor}` : undefined" autocomplete="off" spellcheck="false" />
        <button class="fb-close" aria-label="Close search" @click="emit('close')">Esc</button>
      </div>
      <div class="fb-scopes" role="group" aria-label="Search scope">
        <button v-for="scope in MODES" :key="scope.mode" :aria-pressed="mode === scope.mode" @click="enterMode(scope.mode)">
          {{ scope.label }}<span v-if="scope.key">{{ scope.key }}</span>
        </button>
      </div>
      <div v-if="workspaceFilter" class="fb-summary"><span>Workspace: {{ workspaces.state.workspaces.find(w => w.id === workspaceFilter)?.name }}</span><button @click="workspaceFilter = ''">All repositories</button></div>
      <div v-if="profiles.state.error && mode === 'profile'" class="fb-summary" role="alert">{{ profiles.state.error }}</div>
      <div class="fb-summary" aria-live="polite">
        <span>{{ !query && mode === 'root' ? 'Recent & suggested' : `${results.length} results` }}</span>
        <span>{{ loadingCommits ? 'Searching commits…' : commitError ? 'Commit search unavailable' : mode === 'root' ? 'Use r: w: p: f: c: b: v: to narrow' : '' }}</span>
      </div>
      <div :id="`${finderId}-results`" ref="list" class="fb-rows" role="listbox" aria-label="Search results" :aria-busy="loadingCommits || openingRepo">
        <div v-for="(row, i) in results" :id="`${finderId}-result-${i}`" :key="`${row.kind}:${row.id}`"
          class="fb-row" :class="{ sel: cursor === i, create: row.kind === 'create', 'group-start': row.groupStart }"
          role="option" :aria-selected="cursor === i" :aria-label="`${row.kind}: ${row.label}${row.detail ? ', ' + row.detail : ''}`"
          @mousemove="cursor = i" @mousedown.prevent @click="activate(row)">
          <component :is="row.kind === 'view' ? viewIcons[row.id] ?? PhSquaresFour : icons[row.kind]" class="fb-icon" :size="19" aria-hidden="true" />
          <span class="fb-content">
            <span class="fb-label"><template v-for="(seg, si) in row.segs" :key="si"><mark v-if="seg.hit">{{ seg.t }}</mark><template v-else>{{ seg.t }}</template></template></span>
            <span v-if="row.detail || row.author" class="fb-detail">
              <AuthorAvatar v-if="row.author" :name="row.author" :commit="row.commit" :size="14" />
              {{ row.detail || row.author }}
            </span>
          </span>
          <span v-if="row.sub" class="fb-sub">{{ row.sub }}</span>
          <PhArrowElbowDownLeft class="fb-enter" :size="14" aria-hidden="true" />
        </div>
        <div v-if="!results.length" class="fb-empty">
          <PhMagnifyingGlass :size="28" aria-hidden="true" />
          <b>{{ loadingCommits ? 'Searching commits…' : mode === 'commit' && query.trim().length < 2 ? 'Find a commit' : 'No matches found' }}</b>
          <span>{{ mode === 'commit' && query.trim().length < 2 ? 'Type at least two characters from a message or hash.' : 'Try a shorter search or choose another scope.' }}</span>
        </div>
      </div>
      <footer class="fb-footer"><span><kbd>↑↓</kbd> navigate</span><span><kbd>Enter</kbd> {{ actionHint }}</span><span><kbd>Tab</kbd> scope</span><span v-if="mode === 'branch'" class="fb-extra"><kbd>Ctrl D</kbd> delete</span></footer>
    </section>
    <OperationConfirmModal v-if="pendingOperation" :request="pendingOperation" @close="pendingOperation = null; nextTick(() => input?.focus())" />
  </div>
</template>
