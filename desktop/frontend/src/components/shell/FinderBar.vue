<script setup lang="ts">
// Finder omnibar (D+B): a vim-style prompt seated above the modeline, mode-first
// like pigeon's CommandMenu — pick a kind at root (b/c/f/v), then type-to-filter.
// No real input element: a capture-phase window listener owns the keyboard while
// mounted, so views and shell nav never see finder keystrokes.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import OperationConfirmModal, { type OperationConfirmRequest } from '../overlays/OperationConfirmModal.vue'
import { NAV_GROUPS } from './nav'
import { notify } from '../../composables/useToasts'
import { setModeline, useModeline } from '../../composables/useModeline'
import { useShellSettings } from '../../composables/useShellSettings'
import { CompletionService, GraphService, RefService } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import type { Branch, Commit } from '../../bindings/github.com/atterpac/ichi/internal/git'

const props = withDefaults(defineProps<{ initialQuery?: string }>(), { initialQuery: '' })

const emit = defineEmits<{ (e: 'close'): void; (e: 'navigate', view: string, focus?: string): void }>()

const settings = useShellSettings()
// A submitted header search searches all sources without changing the saved finder mode.
const unified = computed(() => settings.finderUnified || Boolean(props.initialQuery))

type Mode = 'root' | 'branch' | 'commit' | 'file' | 'view'
const MODES: { key: string; mode: Mode; label: string; hint: string }[] = [
  { key: 'b', mode: 'branch', label: 'Branches', hint: '⏎ checkout · ^d delete' },
  { key: 'c', mode: 'commit', label: 'Commits', hint: '⏎ jump to graph' },
  { key: 'f', mode: 'file', label: 'Files', hint: '⏎ file log' },
  { key: 'v', mode: 'view', label: 'Views', hint: '⏎ go' },
]
const MODE_ORDER: Mode[] = ['branch', 'commit', 'file', 'view']

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
  kind: 'mode' | 'branch' | 'commit' | 'file' | 'view' | 'create'
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
      sub: item.IsRemote ? 'remote' : [item.IsCurrent ? 'current' : '', item.Ahead ? `↑${item.Ahead}` : '', item.Behind ? `↓${item.Behind}` : ''].filter(Boolean).join(' ') || undefined,
      kind: 'branch' as const,
      data: item,
    }))
}

function viewRows(cap: number): Row[] {
  return match(viewEntries(), (v) => v.label)
    .slice(0, cap)
    .map(({ item, hits }) => ({ id: item.id, label: item.label, segs: toSegs(item.label, hits), sub: item.group, kind: 'view' as const, data: item.id }))
}

function fileRows(cap: number): Row[] {
  return match(files.value, (f) => f)
    .slice(0, cap)
    .map(({ item, hits }) => ({ id: item, label: item, segs: toSegs(item, hits), kind: 'file' as const, data: item }))
}

function commitRows(cap: number): Row[] {
  return commits.value.slice(0, cap).map((c) => ({
    id: c.Hash,
    label: c.Message,
    segs: toSegs(c.Message, subseqHits(c.Message, query.value) ?? []),
    sub: c.ShortHash || c.Hash.slice(0, 7),
    kind: 'commit' as const,
    data: c,
  }))
}

const results = computed<Row[]>(() => {
  if (mode.value === 'root') {
    if (unified.value && query.value) {
      // unified: everything at once, grouped by kind — instant sources first
      const groups = [
        viewRows(UNIFIED_GROUP_LIMIT),
        branchRows(UNIFIED_GROUP_LIMIT),
        fileRows(UNIFIED_GROUP_LIMIT),
        query.value.trim().length >= 2 ? commitRows(UNIFIED_GROUP_LIMIT) : [],
      ].filter((g) => g.length)
      return groups.flatMap((g, gi) => g.map((row, ri) => ({ ...row, groupStart: gi > 0 && ri === 0 })))
    }
    return MODES.map((m) => ({
      id: m.mode,
      label: m.label,
      segs: toSegs(m.label, []),
      sub: unified.value ? `${m.key}:` : m.key,
      kind: 'mode' as const,
      data: m.mode,
    }))
  }
  if (mode.value === 'branch') {
    const rows = branchRows(LIMIT)
    const q = query.value.trim()
    if (q && !branches.value.some((b) => b.Name === q)) {
      rows.push({ id: '\0create', label: `＋ create branch “${q}”`, segs: toSegs(`＋ create branch “${q}”`, []), kind: 'create' })
    }
    return rows
  }
  if (mode.value === 'file') return fileRows(LIMIT)
  if (mode.value === 'commit') return commitRows(LIMIT)
  return viewRows(LIMIT)
})

watch([query, mode], () => { cursor.value = 0 })
watch(results, () => { if (cursor.value >= results.value.length) cursor.value = Math.max(0, results.value.length - 1) })

// unified root: `b:` / `c:` / `f:` / `v:` prefixes lock a mode mid-typing
const PREFIX_MODES: Record<string, Mode> = { b: 'branch', c: 'commit', f: 'file', v: 'view' }
watch(query, (q) => {
  if (mode.value !== 'root' || !unified.value) return
  const prefixed = /^([bcfv]):(.*)$/i.exec(q)
  if (prefixed) {
    const rest = prefixed[2]!
    enterMode(PREFIX_MODES[prefixed[1]!.toLowerCase()]!)
    query.value = rest
  }
})

// commit search is the only async source: debounce against the backend
let commitTimer: ReturnType<typeof setTimeout> | undefined
watch([query, mode], ([q, m]) => {
  const wantsCommits = m === 'commit' || (m === 'root' && unified.value)
  if (!wantsCommits) return
  clearTimeout(commitTimer)
  if ((q as string).trim().length < 2) {
    commits.value = []
    return
  }
  commitTimer = setTimeout(async () => {
    try {
      const found = await GraphService.SearchCommits(q as string, 12)
      commits.value = (found ?? []).filter((c): c is Commit => Boolean(c))
    } catch {
      commits.value = []
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
  query.value = ''
  cursor.value = 0
  if (next === 'file') loadFiles()
}

function backToRoot() {
  mode.value = 'root'
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
  switch (row.kind) {
    case 'mode':
      enterMode(row.data as Mode)
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

const promptBadge = computed(() => (mode.value === 'root' ? 'find' : mode.value))
const hint = computed(() => {
  if (mode.value === 'root') {
    return unified.value ? 'type to search · b: c: f: v: narrow · tab modes' : 'b c f v pick · tab cycle · esc close'
  }
  const m = MODES.find((x) => x.mode === mode.value)
  return `${m?.hint ?? ''} · ⌫ back · tab cycle`
})

function onKey(event: KeyboardEvent) {
  if (pendingOperation.value) return
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return
  // the finder owns the keyboard: nothing leaks to views or shell nav
  event.preventDefault()
  event.stopPropagation()

  const k = event.key
  const printable = k.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey

  if (k === 'Escape') {
    if (mode.value !== 'root' || query.value) backToRoot()
    else emit('close')
    return
  }
  if (k === 'Tab') {
    const at = MODE_ORDER.indexOf(mode.value as Mode)
    enterMode(MODE_ORDER[(at + (event.shiftKey ? MODE_ORDER.length - 1 : 1)) % MODE_ORDER.length]!)
    return
  }
  if (k === 'Backspace') {
    if (query.value) query.value = query.value.slice(0, -1)
    else if (mode.value !== 'root') backToRoot()
    else emit('close')
    return
  }
  if (k === 'ArrowUp' || (event.ctrlKey && k.toLowerCase() === 'p')) {
    if (results.value.length) cursor.value = (cursor.value + 1) % results.value.length
    return
  }
  if (k === 'ArrowDown' || (event.ctrlKey && k.toLowerCase() === 'n')) {
    if (results.value.length) cursor.value = (cursor.value + results.value.length - 1) % results.value.length
    return
  }
  if (k === 'Enter') {
    const row = results.value[cursor.value]
    if (row) activate(row)
    return
  }
  if (event.ctrlKey && k.toLowerCase() === 'd' && mode.value === 'branch') {
    const row = results.value[cursor.value]
    if (row?.kind === 'branch') deleteBranch(row.data as Branch)
    return
  }
  if (mode.value === 'root' && !unified.value) {
    const picked = MODES.find((m) => m.key === k.toLowerCase())
    if (picked) enterMode(picked.mode)
    return
  }
  if (printable) query.value += k
}

const savedModeline = { mode: '', hints: '' }

onMounted(async () => {
  window.addEventListener('keydown', onKey, true)
  const ml = useModeline()
  Object.assign(savedModeline, { mode: ml.mode, hints: ml.hints })
  setModeline({ mode: 'FIND', hints: '⏎ act · esc close' })
  if (unified.value) loadFiles()
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
})
</script>

<template>
  <div class="finderbar" role="combobox" aria-expanded="true" aria-label="Finder">
    <div class="fb-rows">
      <div
        v-for="(row, i) in results"
        :key="row.id"
        class="fb-row"
        :class="{ sel: cursor === i, create: row.kind === 'create', 'group-start': row.groupStart }"
        @mouseenter="cursor = i"
        @click="activate(row)"
      >
        <kbd v-if="row.kind === 'mode'">{{ row.sub }}</kbd>
        <span v-else class="fb-kind" :class="row.kind">{{ row.kind }}</span>
        <span class="fb-label"><template v-for="(seg, si) in row.segs" :key="si"><mark v-if="seg.hit">{{ seg.t }}</mark><template v-else>{{ seg.t }}</template></template></span>
        <span v-if="row.kind !== 'mode' && row.sub" class="fb-sub">{{ row.sub }}</span>
      </div>
      <p v-if="(mode !== 'root' || query) && !results.length" class="fb-empty">
        {{ mode === 'commit' && query.trim().length < 2 ? 'type at least 2 characters to search commits' : 'no matches' }}
      </p>
    </div>
    <div class="fb-prompt">
      <span class="fb-badge" :class="mode">{{ promptBadge }}›</span>
      <span class="fb-query">{{ query }}</span><span class="fb-caret"></span>
      <span class="fb-hint">{{ hint }}</span>
    </div>

    <OperationConfirmModal
      v-if="pendingOperation"
      :request="pendingOperation"
      @close="pendingOperation = null"
    />
  </div>
</template>
