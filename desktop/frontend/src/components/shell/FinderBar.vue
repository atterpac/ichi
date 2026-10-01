<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch, type Component } from 'vue'
import { NAV_GROUPS } from './nav'
import { notify } from '../../composables/useToasts'
import { setModeline, useModeline } from '../../composables/useModeline'
import { PhMagnifyingGlass, PhFileText, PhGitBranch, PhGitCommit, PhSquaresFour, PhClockCounterClockwise, PhArrowElbowDownLeft, PhTag, PhArrowsClockwise, PhGitDiff, PhGraph, PhArchive, PhUserList, PhClock, PhWarningDiamond, PhGitPullRequest, PhCloud } from '@phosphor-icons/vue'
import AuthorAvatar from '../common/AuthorAvatar.vue'
import { useWorkspaces, type WorkspaceRepo } from '../../composables/useWorkspaces'
import { useGitProfiles } from '../../composables/useGitProfiles'
import { switchRepository } from '../../composables/useRepoStatus'
import { repoSwitchBlocker } from '../../composables/useRepoSwitchGuard'
import { finderHistory, rememberFind } from './finderHistory'
import { SearchService, GraphService, RefService, InspectService } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import type { Branch, Commit } from '../../bindings/github.com/atterpac/ichi/internal/git'

const props = withDefaults(defineProps<{ initialQuery?: string }>(), { initialQuery: '' })

const emit = defineEmits<{ (e: 'close'): void; (e: 'profile', id: string): void; (e: 'navigate', view: string, focus?: string): void }>()

const workspaces = useWorkspaces()
const profiles = useGitProfiles()
const workspaceFilter = ref('')
const openingRepo = ref(false)
type Mode = 'root' | 'branch' | 'commit' | 'file' | 'content' | 'view' | 'repo' | 'workspace' | 'profile'
const MODES: { key: string; mode: Mode; label: string }[] = [
  { key: '', mode: 'root', label: 'All' },
  { key: 'f:', mode: 'file', label: 'Files' },
  { key: 'g:', mode: 'content', label: 'Contents' },
  { key: 'c:', mode: 'commit', label: 'Commits' },
  { key: 'b:', mode: 'branch', label: 'Branches' },
  { key: 'v:', mode: 'view', label: 'Views' },
  { key: 'r:', mode: 'repo', label: 'Repos' },
  { key: 'w:', mode: 'workspace', label: 'Workspaces' },
  { key: 'p:', mode: 'profile', label: 'Profiles' },
]
const input = ref<HTMLInputElement>()
const list = ref<HTMLElement>()
const finderId = useId()
const icons = { repo: PhArchive, workspace: PhSquaresFour, profile: PhUserList, branch: PhGitBranch, commit: PhGitCommit, file: PhFileText, content: PhMagnifyingGlass, view: PhSquaresFour, search: PhClockCounterClockwise }
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

const branches = ref<Branch[]>([])
const files = ref<string[]>([])
const commits = ref<Commit[]>([])
const contentMatches = ref<{ Path: string; Line: number; Column: number; Text: string }[]>([])
const searchLoading = ref(false)
const searchError = ref('')
const contentAvailable = ref(false)
const contentTruncated = ref(false)

type Seg = { t: string; hit: boolean }
type Row = {
  id: string
  label: string
  segs: Seg[]
  sub?: string
  kind: 'branch' | 'commit' | 'file' | 'content' | 'view' | 'search' | 'repo' | 'workspace' | 'profile'
  detail?: string
  author?: string
  commit?: string
  data?: unknown
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
    .sort((a, b) => !query.value ? 0 : (a.hits[0] ?? 0) - (b.hits[0] ?? 0) || text(a.item).length - text(b.item).length)
}

const LIMIT = 8
const UNIFIED_GROUP_LIMIT = 8

function viewEntries() {
  const order = ['graph', 'status', 'branches', 'stashes', 'diff', 'commit']
  return NAV_GROUPS.flatMap((g) => g.items.filter((i) => order.includes(i.id)).map((i) => ({ ...i, group: g.title }))).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
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
  return source.slice(0, cap).map(item => {
    const hits = subseqHits(item, query.value) ?? []
    const split = item.lastIndexOf('/') + 1
    return { id: item, label: item.slice(split), segs: toSegs(item.slice(split), hits.filter(hit => hit >= split).map(hit => hit - split)), detail: item.slice(0, split) || 'Repository root', kind: 'file' as const, data: item }
  })
}
function contentRows(): Row[] {
  return contentMatches.value.map(item => ({
    id: `${item.Path}:${item.Line}:${item.Column}`, label: item.Text,
    segs: toSegs(item.Text, subseqHits(item.Text, query.value) ?? []),
    detail: `${item.Path}:${item.Line}`, sub: 'Text match', kind: 'content', data: item.Path,
  }))
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
  return match(profiles.state.profiles, p => `${p.Label} ${p.Name} ${p.Email}`).slice(0, cap).map(({item, hits}) => ({ id: item.ID, label: item.Label, segs: toSegs(item.Label, hits.filter(i => i < item.Label.length)), detail: `${item.Name} <${item.Email}>`, sub: 'Edit profile and assignments', kind: 'profile', data: item.ID }))
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
      // Rank across sources rather than putting one category ahead of every other.
      const groups = [
        repositoryRows(UNIFIED_GROUP_LIMIT),
        workspaceRows(UNIFIED_GROUP_LIMIT),
        profileRows(UNIFIED_GROUP_LIMIT),
        viewRows(UNIFIED_GROUP_LIMIT),
        branchRows(UNIFIED_GROUP_LIMIT),
        fileRows(UNIFIED_GROUP_LIMIT),
        query.value.trim().length >= 2 ? commitRows(UNIFIED_GROUP_LIMIT) : [],
      ].filter((g) => g.length)
      const q = query.value.toLowerCase().trim()
      const score = (row: Row) => {
        const label = row.label.toLowerCase()
        if (label === q) return 0
        if (label.startsWith(q)) return 1
        if (label.includes(q)) return 2
        if ((row.detail ?? '').toLowerCase().includes(q)) return 3
        return 4
      }
      return groups.flat().sort((a, b) => score(a) - score(b) || a.label.length - b.label.length).slice(0, LIMIT)
    }
    const recentSearches: Row[] = finderHistory.searches.slice(0, 3).map(value => ({ id: value, label: value, segs: toSegs(value, []), sub: 'Recent search', kind: 'search', data: value }))
    const recentFiles = fileRows(6, finderHistory.files.filter(file => files.value.includes(file)))
      .sort((a, b) => finderHistory.files.indexOf(a.id) - finderHistory.files.indexOf(b.id)).slice(0, 3)
    return [...recentFiles, ...repositoryRows(2), ...recentSearches.slice(0, 2), ...viewRows(4)].slice(0, LIMIT)
  }
  if (mode.value === 'branch') return branchRows(LIMIT)
  if (mode.value === 'repo') return repositoryRows(LIMIT)
  if (mode.value === 'workspace') return workspaceRows(LIMIT)
  if (mode.value === 'profile') return profileRows(LIMIT)
  if (mode.value === 'file') return fileRows(LIMIT)
  if (mode.value === 'content') return contentRows()
  if (mode.value === 'commit') return commitRows(LIMIT)
  return viewRows(LIMIT)
})

watch([query, mode], () => { cursor.value = 0 })
watch(results, (rows, previous) => {
  const selected = previous[cursor.value]
  const at = selected ? rows.findIndex(row => row.kind === selected.kind && row.id === selected.id) : -1
  cursor.value = at >= 0 ? at : Math.min(cursor.value, Math.max(0, rows.length - 1))
})

// unified root: `b:` / `c:` / `f:` / `v:` prefixes lock a mode mid-typing
const PREFIX_MODES: Record<string, Mode> = { g: 'content', b: 'branch', c: 'commit', f: 'file', v: 'view', r: 'repo', w: 'workspace', p: 'profile' }
watch(query, (q) => {
  if (mode.value !== 'root') return
  const prefixed = /^([bcfgvrwp]):(.*)$/i.exec(q)
  if (prefixed) {
    const rest = prefixed[2]!
    enterMode(PREFIX_MODES[prefixed[1]!.toLowerCase()]!)
    query.value = rest
  }
}, { immediate: true })

// Cancel obsolete backend searches as the query or scope changes.
let commitTimer: ReturnType<typeof setTimeout> | undefined
watch([query, mode], ([q, m], _, onCleanup) => {
  let cancelled = false
  let request: { cancel?: () => void } | undefined
  onCleanup(() => { cancelled = true; clearTimeout(commitTimer); request?.cancel?.() })
  commits.value = []
  commitError.value = false
  loadingCommits.value = false
  if ((m !== 'commit' && m !== 'root') || q.trim().length < 2) return
  loadingCommits.value = true
  commitTimer = setTimeout(async () => {
    try {
      const pending = GraphService.SearchCommits(q, 12)
      request = pending
      const found = await pending
      if (!cancelled) commits.value = (found ?? []).filter((c): c is Commit => Boolean(c))
    } catch {
      if (!cancelled) commitError.value = true
    } finally {
      if (!cancelled) loadingCommits.value = false
    }
  }, 160)
}, { immediate: true })

watch([query, mode], async ([q, m], _, onCleanup) => {
  let cancelled = false
  let request: { cancel?: () => void } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => { cancelled = true; clearTimeout(timer); request?.cancel?.() })
  files.value = []
  contentMatches.value = []
  searchError.value = ''
  searchLoading.value = false
  contentTruncated.value = false
  if (!['root', 'file', 'content'].includes(m)) return
  if (m === 'content' && !q.trim()) return
  searchLoading.value = true
  const search = async () => {
    try {
      if (m === 'content') {
        const pending = SearchService.Content(q, LIMIT)
        request = pending
        const found = await pending
        if (!cancelled) { contentMatches.value = found?.Matches ?? []; contentTruncated.value = found?.Truncated ?? false }
      } else {
        const pending = SearchService.Files(q, LIMIT, finderHistory.files)
        request = pending
        const found = await pending
        if (!cancelled) files.value = (found?.Matches ?? []).map(item => item.Path)
      }
    } catch (error) {
      if (!cancelled) searchError.value = error instanceof Error ? error.message : String(error)
    } finally { if (!cancelled) searchLoading.value = false }
  }
  if (m === 'content') timer = setTimeout(() => { void search() }, 180)
  else await search()
}, { immediate: true })

function enterMode(next: Mode) {
  mode.value = next
  cursor.value = 0
  void nextTick(() => input.value?.focus())
}

function backToRoot() {
  mode.value = 'root'
  workspaceFilter.value = ''
  query.value = ''
  cursor.value = 0
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
      emit('navigate', 'branches', row.id)
      emit('close')
      return
    case 'view':
      emit('navigate', row.data as string)
      emit('close')
      return
    case 'commit':
      emit('navigate', 'graph', (row.data as Commit).Hash)
      emit('close')
      return
    case 'content':
      emit('navigate', 'blame', row.data as string)
      emit('close')
      return
    case 'file':
      emit('navigate', 'file-log', row.data as string)
      emit('close')
      return
  }
}

const placeholder = computed(() => mode.value === 'root' ? 'Find a file, commit, branch, or workspace…' : `Search ${MODES.find(item => item.mode === mode.value)?.label.toLowerCase()}…`)
const selectedRow = computed(() => results.value[cursor.value])
const actionHint = computed(() => {
  if (openingRepo.value) return 'Switching repository…'
  const kind = selectedRow.value?.kind
  return ({ branch: 'Inspect branch', content: 'Open file blame', file: 'Open file history', commit: 'Open commit', repo: 'Switch repository', workspace: 'Browse repositories', profile: 'Configure profile', search: 'Repeat search', view: 'Open view' })[kind ?? 'view']
})
const activeScope = computed(() => MODES.find(item => item.mode === mode.value))
const prefixSuggestions = computed(() => mode.value === 'root' && /^[fcbgvrwp]$/i.test(query.value) ? MODES.filter(item => item.key.startsWith(query.value.toLowerCase()) && (item.mode !== 'content' || contentAvailable.value)) : [])
function applyPrefix(next: Mode) { query.value = ''; enterMode(next) }
const previewOpen = ref(false)
const previewPane = ref<HTMLElement>()
const previewLoading = ref(false)
const previewError = ref('')
const previewText = ref('')
const canPreview = computed(() => !!selectedRow.value && !['search', 'view'].includes(selectedRow.value.kind))
async function openPreview() {
  if (!canPreview.value) return
  previewOpen.value = true
  await nextTick()
  previewPane.value?.focus()
}
function closePreview() { previewOpen.value = false; void nextTick(() => input.value?.focus()) }
watch([previewOpen, selectedRow], async ([open, row], _, onCleanup) => {
  let cancelled = false
  let request: { cancel?: () => void } | undefined
  onCleanup(() => { cancelled = true; request?.cancel?.() })
  previewText.value = ''
  previewError.value = ''
  previewLoading.value = false
  if (!open || !row) return
  previewLoading.value = true
  try {
    let text = ''
    if (row.kind === 'file') {
      const pending = InspectService.WorkingFilePreview(row.id)
      request = pending
      const preview = await pending
      if (!preview) throw new Error('Preview unavailable')
      text = preview.Binary ? 'Binary file — no text preview.' : preview.Content.split('\n').slice(0, 100).join('\n').slice(0, 16000)
      if (!preview.Binary && (preview.Truncated || text.length < preview.Content.length)) text += '\n… Preview truncated'
    } else if (row.kind === 'content') {
      text = `${row.detail}\n\n${row.label}`
    } else if (row.kind === 'commit') {
      const pending = GraphService.LoadCommit(row.id)
      request = pending
      const detail = await pending
      text = detail ? [detail.Subject, detail.Body, detail.Author, detail.Stats ? `${detail.Stats.FilesChanged} files · +${detail.Stats.Insertions} −${detail.Stats.Deletions}` : ''].filter(Boolean).join('\n\n') : 'Commit details unavailable.'
    } else if (row.kind === 'branch') {
      const branch = row.data as Branch
      const current = branches.value.find(b => b.IsCurrent)
      const pending = current && current.Name !== branch.Name ? RefService.BranchDivergence(current.Name, branch.Name) : null
      request = pending ?? undefined
      const comparison = pending ? await pending : null
      text = [branch.Name, branch.IsCurrent ? 'Checked out' : branch.IsRemote ? 'Remote branch' : 'Local branch', branch.LastMsg, comparison ? `Compared with ${current!.Name}:\n${comparison.AheadB} commits ahead · ${comparison.AheadA} behind` : '', branch.Upstream ? `Upstream: ${branch.Upstream}` : ''].filter(Boolean).join('\n\n')
    } else if (row.kind === 'workspace') {
      text = workspaces.state.repos.filter(repo => repo.workspace === row.id).map(repo => `${repo.name}\n${repo.path}`).join('\n\n') || 'No repositories in this workspace.'
    } else if (row.kind === 'profile') {
      const profile = profiles.state.profiles.find(p => p.ID === row.id)
      text = [row.detail, profile?.Source, 'Opens Git Profiles to edit this identity and its workspace assignments.'].filter(Boolean).join('\n\n')
    } else text = [row.label, row.detail, row.sub].filter(Boolean).join('\n\n')
    if (!cancelled) previewText.value = text || 'No preview content.'
  } catch (error) { if (!cancelled) previewError.value = error instanceof Error ? error.message : String(error) }
  finally { if (!cancelled) previewLoading.value = false }
})
watch([cursor, results], () => {
  void nextTick(() => list.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }))
})

function onKey(event: KeyboardEvent) {
  if (openingRepo.value) { event.preventDefault(); event.stopPropagation(); return }
  event.stopPropagation()
  if (event.isComposing) return
  const k = event.key
  if (k === 'Escape') { event.preventDefault(); if (previewOpen.value) closePreview(); else emit('close'); return }
  if (k === 'Tab') {
    const focusable = [...(input.value?.closest('.finderbar')?.querySelectorAll<HTMLElement>('input, button:not(:disabled), [tabindex="0"]') ?? [])].filter(el => el.getClientRects().length)
    const at = focusable.indexOf(document.activeElement as HTMLElement)
    if (focusable.length) {
      event.preventDefault()
      focusable[(at + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length]?.focus()
    }
    return
  }
  if (k === 'ArrowRight' && event.target === input.value && input.value?.selectionStart === query.value.length && input.value.selectionEnd === query.value.length && canPreview.value && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault(); void openPreview(); return
  }
  if (k === 'ArrowLeft' && previewPane.value?.contains(event.target as Node)) {
    event.preventDefault(); closePreview(); return
  }
  if (k === 'Backspace' && !query.value && mode.value !== 'root') {
    event.preventDefault(); backToRoot(); return
  }
  if (k === 'ArrowUp' || k === 'ArrowDown' || (event.ctrlKey && ['p', 'n', 'j', 'k'].includes(k.toLowerCase()))) {
    event.preventDefault()
    const delta = k === 'ArrowUp' || (event.ctrlKey && ['p', 'k'].includes(k.toLowerCase())) ? -1 : 1
    if (results.value.length) cursor.value = (cursor.value + results.value.length + delta) % results.value.length
    return
  }
  if (k === 'Enter' && (event.target === input.value || event.target === window || event.target === previewPane.value)) {
    event.preventDefault()
    const row = results.value[cursor.value]
    if (row) activate(row)
    return
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
  void SearchService.Capabilities().then(value => { contentAvailable.value = value.ContentAvailable }).catch(() => {})
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
  <div class="finder-backdrop" @mousedown.self="!openingRepo && emit('close')">
    <section class="finderbar" :class="{ 'with-preview': previewOpen }" role="dialog" aria-modal="true" aria-label="Global search">
      <div class="fb-prompt">
        <PhMagnifyingGlass :size="21" aria-hidden="true" />
        <button v-if="mode !== 'root'" class="fb-scope-chip" aria-label="Clear search scope" @click="backToRoot">{{ activeScope?.key }} ×</button>
        <input ref="input" v-model="query" class="fb-query" :placeholder="placeholder" aria-label="Find files, commits, branches, repositories, and profiles"
          role="combobox" aria-autocomplete="list" aria-expanded="true" :aria-controls="`${finderId}-results`"
          :aria-activedescendant="results.length ? `${finderId}-result-${cursor}` : undefined" autocomplete="off" spellcheck="false" />
        <button class="fb-close" aria-label="Close search" @click="emit('close')">Esc</button>
      </div>
      <div v-if="prefixSuggestions.length" class="fb-prefixes"><button v-for="scope in prefixSuggestions" :key="scope.mode" @click="applyPrefix(scope.mode)"><kbd>{{ scope.key }}</kbd> Search {{ scope.label.toLowerCase() }}</button></div>
      <div v-if="workspaceFilter" class="fb-summary"><span>Workspace: {{ workspaces.state.workspaces.find(w => w.id === workspaceFilter)?.name }}</span><button @click="workspaceFilter = ''">All repositories</button></div>
      <div v-if="profiles.state.error && mode === 'profile'" class="fb-summary" role="alert">{{ profiles.state.error }}</div>
      <div class="fb-summary" aria-live="polite">
        <span>{{ !query && mode === 'root' ? 'Recent & suggested' : `${results.length} results` }}</span>
        <span>{{ searchLoading ? 'Searching…' : searchError ? searchError : contentTruncated ? 'More matches available; refine your search' : loadingCommits ? 'Searching commits…' : commitError ? 'Commit search unavailable' : mode === 'root' && !query ? 'Files · commits · branches · workspaces' : activeScope?.label ?? '' }}</span>
      </div>
      <div class="fb-body">
      <div :id="`${finderId}-results`" ref="list" class="fb-rows" role="listbox" aria-label="Search results" :aria-busy="loadingCommits || searchLoading || openingRepo">
        <div v-for="(row, i) in results" :id="`${finderId}-result-${i}`" :key="`${row.kind}:${row.id}`"
          class="fb-row" :class="{ sel: cursor === i }"
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
          <span class="fb-sub"><span class="fb-kind">{{ row.kind === 'repo' ? 'Repository' : row.kind }}</span><span v-if="row.sub">{{ row.sub }}</span></span>
          <PhArrowElbowDownLeft class="fb-enter" :size="14" aria-hidden="true" />
        </div>
        <div v-if="!results.length" class="fb-empty">
          <PhMagnifyingGlass :size="28" aria-hidden="true" />
          <b>{{ searchLoading ? 'Searching…' : searchError || (loadingCommits ? 'Searching commits…' : mode === 'commit' && query.trim().length < 2 ? 'Find a commit' : 'No matches found') }}</b>
          <span>{{ mode === 'commit' && query.trim().length < 2 ? 'Type at least two characters from a message or hash.' : 'Try a shorter search or a prefix such as f: or b:.' }}</span>
        </div>
      </div>
      <aside v-if="previewOpen" ref="previewPane" class="fb-preview" tabindex="0" aria-label="Result preview">
        <header><span>{{ selectedRow?.label || 'Preview' }}</span><button aria-label="Close preview" @click="closePreview">×</button></header>
        <p v-if="previewLoading" role="status">Loading preview…</p>
        <p v-else-if="previewError" role="alert">{{ previewError }}</p>
        <pre v-else :class="{ 'file-preview': selectedRow?.kind === 'file' }">{{ previewText }}</pre>
      </aside>
      </div>
      <footer class="fb-footer"><span v-if="results.length"><kbd>↵</kbd> {{ actionHint }}</span><button v-if="canPreview" class="fb-preview-toggle" @click="previewOpen ? closePreview() : openPreview()"><kbd>{{ previewOpen ? '←' : '→' }}</kbd> {{ previewOpen ? 'Back to results' : 'Preview' }}</button></footer>
    </section>
  </div>
</template>
