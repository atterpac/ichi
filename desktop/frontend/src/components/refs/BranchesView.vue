<script setup lang="ts">
import { useRepoSwitchGuard } from '../../composables/useRepoSwitchGuard'
import { isEditable, isModified, returnFromPane } from '../../composables/keyboard'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { PhCaretRight, PhArrowsClockwise, PhGitBranch, PhMagnifyingGlass, PhFile } from '@phosphor-icons/vue'
import OperationConfirmModal, { type OperationConfirmRequest } from '../overlays/OperationConfirmModal.vue'
import BranchAncestryMap from './BranchAncestryMap.vue'
import DiffView from '../diff/DiffView.vue'
import SurfaceState from '../common/SurfaceState.vue'
import DiffBar from '../common/DiffBar.vue'
import UiButton from '../common/UiButton.vue'
import { setModeline, resetModeline } from '../../composables/useModeline'
import { useShellSettings } from '../../composables/useShellSettings'
import { notify } from '../../composables/useToasts'
import { useVimList } from '../../composables/useVimList'
import { RefService, RemoteService, StashService, DiffService } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import type { Branch, FileChurn, FileDiff } from '../../bindings/github.com/atterpac/ichi/internal/git'

const props = defineProps<{ focusBranch?: string }>()
const emit = defineEmits<{ (e: 'navigate', view: string, focus?: string): void }>()

const settings = useShellSettings()

function splitPath(path: string) {
  const cut = path.lastIndexOf('/') + 1
  return { dir: path.slice(0, cut), base: path.slice(cut) }
}

const loading = ref(true)
const error = ref('')
const busy = ref(false)
useRepoSwitchGuard(() => busy.value ? 'Wait for the Git operation to finish.' : '')
const locals = ref<Branch[]>([])
const remotes = ref<Branch[]>([])
const pendingOperation = ref<OperationConfirmRequest | null>(null)
const listEl = ref<HTMLElement | null>(null)
const folded = ref(new Set<string>())
const detailChurn = ref<FileChurn[]>([])

const query = ref('')
const scope = ref('all')
const baseline = ref('')
const detailError = ref('')
const detailLoading = ref(false)
const preview = ref<FileDiff | null>(null)
const diffViewer = ref<InstanceType<typeof DiffView> | null>(null)
const previewLoading = ref(false)
const previewError = ref('')
let previewReq = 0
const allBranches = computed(() => [...locals.value, ...remotes.value])
const comparison = computed(() => baseline.value || current.value?.Name || '')
const filteredLocals = computed(() => scope.value === 'remote' ? [] : locals.value.filter(matches))
const filteredRemotes = computed(() => scope.value === 'local' ? [] : remotes.value.filter(matches))
function matches(b: Branch) { return b.Name.toLowerCase().includes(query.value.toLowerCase()) }
async function selectMapBranch(branch: Branch) {
  query.value = ''
  scope.value = 'all'
  folded.value = new Set()
  await nextTick()
  vim.moveTo(displayRows.value.findIndex(row => row.kind === 'branch' && row.b === branch))
  scrollToCursor()
}
watch([() => props.focusBranch, allBranches], ([name, branches]) => {
  const branch = branches.find(b => b.Name === name)
  if (branch) void selectMapBranch(branch)
}, { immediate: true })
function clickGroup(index: number, id: string) { vim.moveTo(index); toggleFold(id) }
function closePreview() { previewReq++; preview.value = null; listEl.value?.focus() }
async function openFile(path: string) {
  const selected = detailBranch.value
  if (!selected || !comparison.value) return
  const req = ++previewReq
  preview.value = null
  previewError.value = ''
  previewLoading.value = true
  try {
    const raw = await DiffService.DiffBetween(comparison.value, selected.Name)
    if (req !== previewReq) return
    const files = await DiffService.ParseDiff(raw)
    if (req === previewReq) {
      preview.value = files.find(f => f?.Path === path || f?.OldPath === path) ?? null
      if (!preview.value) previewError.value = 'No textual diff available for this file.'
      await nextTick()
      if (req === previewReq) diffViewer.value?.focus()
    }
  } catch (err) { if (req === previewReq) previewError.value = String(err) }
  finally { if (req === previewReq) previewLoading.value = false }
}

const current = computed(() => locals.value.find((b) => b.IsCurrent) ?? null)

type DisplayRow =
  | { kind: 'branch'; b: Branch; short: string; child: boolean; group?: string; sectBefore?: string }
  | { kind: 'group'; id: string; label: string; count: number; folded: boolean }

// origin/feature/x -> { remote: 'origin', short: 'feature/x' }
function splitRemote(name: string) {
  const slash = name.indexOf('/')
  return { remote: name.slice(0, slash), short: name.slice(slash + 1) }
}

function branchRow(b: Branch, over: Partial<Extract<DisplayRow, { kind: 'branch' }>> = {}): DisplayRow {
  return { kind: 'branch', b, short: b.Name, child: false, ...over }
}

const displayRows = computed<DisplayRow[]>(() => {
  if (!settings.branchesGrouped) {
    return [
      ...filteredLocals.value.map((b, i) => branchRow(b, i === 0 ? { sectBefore: `Local — ${filteredLocals.value.length}` } : {})),
      ...filteredRemotes.value.map((b, i) => branchRow(b, i === 0 ? { sectBefore: `Remote — ${filteredRemotes.value.length}` } : {})),
    ]
  }

  const rows: DisplayRow[] = []
  // Locals: slash prefixes shared by 2+ branches become foldable groups;
  // singletons stay flat so short names never gain pointless nesting.
  const byPrefix = new Map<string, Branch[]>()
  const singles: Branch[] = []
  for (const b of filteredLocals.value) {
    const slash = b.Name.indexOf('/')
    if (slash > 0) {
      const prefix = b.Name.slice(0, slash + 1)
      byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), b])
    } else {
      singles.push(b)
    }
  }
  for (const [prefix, members] of byPrefix) {
    if (members.length < 2) {
      singles.push(...members)
      byPrefix.delete(prefix)
    }
  }
  singles.sort((a, b) => filteredLocals.value.indexOf(a) - filteredLocals.value.indexOf(b))
  rows.push(...singles.map((b) => branchRow(b)))
  for (const [prefix, members] of [...byPrefix].sort(([a], [b]) => a.localeCompare(b))) {
    const id = `local:${prefix}`
    const isFolded = folded.value.has(id)
    rows.push({ kind: 'group', id, label: prefix, count: members.length, folded: isFolded })
    if (!isFolded) rows.push(...members.map((b) => branchRow(b, { child: true, group: id, short: b.Name.slice(prefix.length) })))
  }
  // Remotes: one foldable root per remote name.
  const byRemote = new Map<string, Branch[]>()
  for (const b of filteredRemotes.value) {
    const { remote } = splitRemote(b.Name)
    byRemote.set(remote, [...(byRemote.get(remote) ?? []), b])
  }
  for (const [remote, members] of [...byRemote].sort(([a], [b]) => a.localeCompare(b))) {
    const id = `remote:${remote}`
    const isFolded = folded.value.has(id)
    rows.push({ kind: 'group', id, label: `${remote}/`, count: members.length, folded: isFolded })
    if (!isFolded) rows.push(...members.map((b) => branchRow(b, { child: true, group: id, short: splitRemote(b.Name).short })))
  }
  return rows
})

async function refresh() {
  try {
    const all = await RefService.ListBranches()
    locals.value = all.filter((b) => !b.IsRemote)
    remotes.value = all.filter((b) => b.IsRemote)
    error.value = ''
    if (baseline.value && !all.some(b => b.Name === baseline.value)) baseline.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

async function run(label: string, op: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  try {
    await op()
    await refresh()
    notify({ tone: 'success', title: label })
  } catch (err) {
    notify({ tone: 'danger', title: `${label} failed`, message: err instanceof Error ? err.message : String(err) })
  } finally {
    busy.value = false
  }
}

// git refuses checkout when the switch would clobber uncommitted work.
function isDirtyTreeError(err: unknown) {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return msg.includes('would be overwritten') || msg.includes('stash them') || msg.includes('local changes')
}

async function doCheckout(name: string) {
  await RefService.CheckoutBranch(name, false)
  await refresh()
  notify({ tone: 'success', title: `Checked out ${name}` })
}

function checkout(row: Branch) {
  if (row.IsCurrent || busy.value) return
  // Remote rows check out the short name: git DWIMs a local tracking branch.
  const name = row.IsRemote ? splitRemote(row.Name).short : row.Name
  busy.value = true
  doCheckout(name)
    .catch((err) => {
      if (isDirtyTreeError(err)) offerStashAndSwitch(name)
      else notify({ tone: 'danger', title: 'Checkout failed', message: err instanceof Error ? err.message : String(err) })
    })
    .finally(() => { busy.value = false })
}

// Dirty-tree checkout recovery: stash the worktree (incl. untracked), switch, done.
// The stash stays on the list so the user can pop it back onto the new branch.
function offerStashAndSwitch(name: string) {
  pendingOperation.value = {
    title: 'Stash and switch',
    message: `Uncommitted changes block the switch to ${name}. Stash them (including untracked files) and check out?`,
    confirmLabel: 'Stash & switch',
    target: name,
    tone: 'warning',
    onConfirm: () =>
      run(`Stashed and checked out ${name}`, async () => {
        await StashService.StashPush(`ichi: switch to ${name}`, true)
        await RefService.CheckoutBranch(name, false)
      }),
  }
}

function openInGraph(row: Branch) {
  emit('navigate', 'graph', row.LastCommit)
}

function createFrom(row: Branch) {
  pendingOperation.value = {
    title: 'New branch',
    message: `Create a branch at ${row.Name} and check it out.`,
    confirmLabel: 'Create',
    target: row.Name,
    icon: PhGitBranch,
    inputs: [{ id: 'name', label: 'Branch name', placeholder: 'feature/…', required: true, pattern: '^[^\\s]+$' }],
    onConfirm: ({ name }) =>
      run(`Created ${name}`, async () => {
        await RefService.CreateBranchAt(name!, row.Name)
        await RefService.CheckoutBranch(name!, false)
      }),
  }
}

function rename(row: Branch) {
  if (row.IsRemote) {
    notify({ tone: 'danger', title: 'Cannot rename a remote branch' })
    return
  }
  pendingOperation.value = {
    title: 'Rename branch',
    message: `Rename ${row.Name}.`,
    confirmLabel: 'Rename',
    target: row.Name,
    icon: PhGitBranch,
    inputs: [{ id: 'name', label: 'New name', value: row.Name, required: true, pattern: '^[^\\s]+$' }],
    onConfirm: ({ name }) => run(`Renamed to ${name}`, () => RefService.RenameBranch(row.Name, name!)),
  }
}

function remove(row: Branch) {
  if (row.IsCurrent) {
    notify({ tone: 'danger', title: 'Cannot delete the checked-out branch' })
    return
  }
  const remote = row.IsRemote ? splitRemote(row.Name) : null
  pendingOperation.value = {
    title: remote ? 'Delete remote branch' : 'Delete branch',
    message: remote
      ? `Delete ${row.Name} from ${remote.remote}. This affects everyone using the remote.`
      : `Delete local branch ${row.Name}.`,
    confirmLabel: 'Delete',
    target: row.Name,
    tone: 'danger',
    onConfirm: () =>
      run(`Deleted ${row.Name}`, () =>
        remote ? RefService.DeleteRemoteBranch(remote.remote, remote.short) : RefService.DeleteBranch(row.Name, false),
      ),
  }
}

function merge(row: Branch) {
  if (row.IsCurrent || !current.value) return
  pendingOperation.value = {
    title: 'Merge branch',
    message: `Merge ${row.Name} into ${current.value.Name}.`,
    confirmLabel: 'Merge',
    target: row.Name,
    tone: 'warning',
    onConfirm: () => run(`Merged ${row.Name}`, () => RefService.MergeBranch(row.Name)),
  }
}

function rebase(row: Branch) {
  if (row.IsCurrent || !current.value) return
  pendingOperation.value = {
    title: 'Rebase branch',
    message: `Rebase ${current.value.Name} onto ${row.Name}.`,
    confirmLabel: 'Rebase',
    target: row.Name,
    tone: 'warning',
    onConfirm: () => run(`Rebased onto ${row.Name}`, () => RefService.RebaseBranch(row.Name)),
  }
}

function fetch() {
  void run('Fetched all remotes', () => RemoteService.FetchAll())
}

function toggleFold(id: string) {
  const next = new Set(folded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  folded.value = next
}

function toggleGrouping() {
  settings.branchesGrouped = !settings.branchesGrouped
  vim.moveTo(0)
}

const vim = useVimList(displayRows, {
  autoListen: false,
  text: (row) => (row.kind === 'branch' ? row.b.Name : row.label),
  onAction: (action, { items }) => {
    const row = items[0]
    if (!row) return
    if (row.kind === 'group') {
      if (action === 'open') toggleFold(row.id)
      return
    }
    if (action === 'open') checkout(row.b)
    if (action === 'delete') remove(row.b)
  },
})

const cursorRow = computed<DisplayRow | null>(() => displayRows.value[vim.cursor.value] ?? null)
const detailBranch = computed<Branch | null>(() => (cursorRow.value?.kind === 'branch' ? cursorRow.value.b : null))

// Divergence bars: ahead (green, from the left) vs behind (red, from the
// right), proportional but clamped so a 1-commit side stays visible.
function divergenceBar(ahead: number, behind: number) {
  const total = ahead + behind
  if (!total) return { ahead: 0, behind: 0, aheadPct: 0, behindPct: 0, sync: true }
  const clamp = (n: number) => (n === 0 ? 0 : Math.min(88, Math.max(12, Math.round((n / total) * 100))))
  return { ahead, behind, aheadPct: clamp(ahead), behindPct: clamp(behind), sync: false }
}

const divergence = computed(() => {
  const b = detailBranch.value
  if (!b || b.IsRemote || !b.IsTracking) return null
  return divergenceBar(b.Ahead, b.Behind)
})


const upstreamRemote = computed(() => {
  const b = detailBranch.value
  return b?.IsTracking ? splitRemote(b.Upstream).remote : 'origin'
})

// Refresh the file comparison when the selection or baseline changes.
let detailReq = 0
watch(
  [() => settings.branchesDetailVisible, () => detailBranch.value?.Name, () => comparison.value, () => locals.value],
  async ([open, selected, head]) => {
    const req = ++detailReq
    previewReq++
    preview.value = null
    previewLoading.value = false
    previewError.value = ''
    detailError.value = ''
    detailChurn.value = []
    detailLoading.value = false
    if (!open || !selected || !head || selected === head) return
    detailLoading.value = true
    const failed = (err: unknown) => { if (req === detailReq) detailError.value = String(err); return null }
    const churn = await RefService.DiffFiles(head, selected).catch(failed)
    if (req !== detailReq) return
    detailLoading.value = false
    detailChurn.value = (churn ?? []).filter(Boolean)
  },
  { immediate: true },
)

const FILE_LIST_LIMIT = 500

const changedFiles = computed(() => {
  const total = { files: detailChurn.value.length, added: 0, deleted: 0 }
  for (const f of detailChurn.value) {
    total.added += f.Added
    total.deleted += f.Deleted
  }
  const files = [...detailChurn.value]
    .sort((a, b) => b.Added + b.Deleted - (a.Added + a.Deleted))
    .slice(0, FILE_LIST_LIMIT)
  return { files, total, more: Math.max(0, total.files - FILE_LIST_LIMIT) }
})

const filterEl = ref<HTMLInputElement | null>(null)

function onFilterKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    if (query.value) query.value = ''
    else listEl.value?.focus()
  } else if (event.key === 'Enter' || event.key === 'ArrowDown') {
    event.preventDefault()
    listEl.value?.focus()
  }
}

function onListKey(event: KeyboardEvent) {
  if (event.defaultPrevented || isEditable(event.target)) return
  if (isModified(event)) { if (vim.handleKey(event)) event.preventDefault(); return }
  if (pendingOperation.value) return
  // One search surface: / jumps into the filter field rather than vim's inline
  // search, so typing narrows the list the same way clicking the field does.
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    filterEl.value?.focus()
    filterEl.value?.select()
    return
  }
  // 'g' belongs to global nav (graph) — let it bubble to the shell instead of
  // feeding vim's gg motion. G still jumps to the bottom of the list.
  if (event.key === 'g' && !event.ctrlKey && !event.metaKey && !event.altKey) return

  if (event.key === 'Escape' && vim.mode.value === 'normal') return
  const row = cursorRow.value
  const branch = row?.kind === 'branch' ? row.b : null
  switch (event.key) {
    case 'i':
      settings.branchesDetailVisible = !settings.branchesDetailVisible
      event.preventDefault()
      return
    case 't':
      toggleGrouping()
      event.preventDefault()
      return
    case 'h':
      if (row?.kind === 'group' && !row.folded) toggleFold(row.id)
      else if (row?.kind === 'branch' && row.group) {
        const group = row.group
        toggleFold(group)
        vim.moveTo(displayRows.value.findIndex((r) => r.kind === 'group' && r.id === group))
      }
      event.preventDefault()
      return
    case 'l':
      if (row?.kind === 'group' && row.folded) toggleFold(row.id)
      else {
        settings.branchesDetailVisible = true
        void nextTick(() => document.querySelector<HTMLElement>('[aria-label="Branch details"]')?.focus())
      }
      event.preventDefault()
      return
    case 'n':
      if (branch) createFrom(branch)
      event.preventDefault()
      return
    case 'r':
      if (branch) rename(branch)
      event.preventDefault()
      return
    case 'd':
      if (branch) remove(branch)
      event.preventDefault()
      return
    case 'm':
      if (branch) merge(branch)
      event.preventDefault()
      return
    case 'R':
      if (branch) rebase(branch)
      event.preventDefault()
      return
    case 'f':
      fetch()
      event.preventDefault()
      return
    case 'o':
      if (branch) openInGraph(branch)
      event.preventDefault()
      return
  }
  if (vim.handleKey(event)) event.preventDefault()
}

function scrollToCursor() {
  const items = listEl.value?.querySelectorAll<HTMLElement>('.branch-row, .branch-group')
  items?.[vim.cursor.value]?.scrollIntoView?.({ block: 'nearest' })
}
watch(vim.cursor, () => nextTick(scrollToCursor))

onMounted(async () => {
  setModeline({
    mode: 'NORMAL',
    hints: '⏎ checkout · o graph · n new · r rename · d delete · m merge · R rebase · t group · i inspector · F6 pane · / filter',
  })
  await refresh()
  await nextTick()
  listEl.value?.focus()
})
watch([query, scope], () => vim.moveTo(0))
onUnmounted(() => { detailReq++; previewReq++; resetModeline() })
</script>

<template>
  <div class="branches-view branch-map-view">
    <Teleport defer to="#view-header-context">
      <span class="header-meta">{{ locals.length }} local</span>
      <span class="header-meta">{{ remotes.length }} remote</span>
      <UiButton
        size="sm"
        icon-only
        :active="settings.branchesGrouped"
        :title="settings.branchesGrouped ? 'Flat list (t)' : 'Group by prefix (t)'"
        :aria-pressed="settings.branchesGrouped"
        @click="toggleGrouping"
      >
        <PhGitBranch :size="16" weight="bold" />
      </UiButton>
      <UiButton size="sm" title="Fetch all remotes (f)" :disabled="busy" @click="fetch">
        <PhArrowsClockwise :size="16" weight="bold" />
        Fetch
      </UiButton>
    </Teleport>

    <SurfaceState v-if="loading" tone="loading" title="Loading branches" message="Reading local and remote refs." />
    <SurfaceState v-else-if="error" tone="error" title="Unable to load branches" :message="error" action-label="Retry" @action="refresh" />

    <div v-else class="branches-body" :class="{ 'detail-open': settings.branchesDetailVisible }">
      <section
        ref="listEl"
        class="branches-list"
        tabindex="0"
        aria-label="Branches"
        @keydown="onListKey" data-keyboard-pane
      >
        <div class="branch-browser-tools">
          <label class="branch-filter ui-control size-md">
            <PhMagnifyingGlass :size="14" weight="bold" aria-hidden="true" />
            <input ref="filterEl" v-model="query" aria-label="Filter branches" placeholder="Filter branches…" @keydown="onFilterKey" />
            <kbd v-if="!query" aria-hidden="true">/</kbd>
          </label>
          <div class="branch-scope"><button v-for="item in ['all', 'local', 'remote']" :key="item" :aria-pressed="scope === item" @click="scope = item">{{ item }}</button></div>
        </div>
        <p v-if="!displayRows.length" class="bd-empty">No matching branches.</p>

        <template v-for="(row, i) in displayRows" :key="row.kind === 'branch' ? row.b.Name : row.id">
          <div v-if="row.kind === 'branch' && row.sectBefore" class="branch-sect">{{ row.sectBefore }}</div>

          <button
            v-if="row.kind === 'group'"
            type="button"
            class="branch-group"
            :class="{ selected: vim.cursor.value === i }"
            @click="clickGroup(i, row.id)"
          >
            <PhCaretRight class="branch-twist disclosure-icon" :class="{ expanded: !row.folded }" :size="12" weight="bold" aria-hidden="true" />
            <span class="branch-name">{{ row.label }}</span>
            <span class="branch-count">{{ row.count }}</span>
          </button>

          <button
            v-else
            type="button"
            class="branch-row"
            :class="{ selected: vim.cursor.value === i, remote: row.b.IsRemote, child: row.child }"
            @click="vim.moveTo(i)"
            @dblclick="checkout(row.b)"
          >
            <span class="branch-cur" :class="{ on: row.b.IsCurrent }">●</span>
            <span class="branch-name">{{ row.short }}</span>
            <span v-if="!row.b.IsRemote" class="branch-up">{{ row.b.IsTracking ? `→ ${row.b.Upstream}` : 'no upstream' }}</span>
            <span class="branch-fill"></span>
            <span class="branch-msg">{{ row.b.LastMsg }}</span>
            <span v-if="row.b.Ahead" class="branch-chip ahead" :title="`Ahead of ${row.b.Upstream || 'upstream'}`">↑{{ row.b.Ahead }}</span>
            <span v-if="row.b.Behind" class="branch-chip behind" :title="`Behind ${row.b.Upstream || 'upstream'}`">↓{{ row.b.Behind }}</span>
            <span class="branch-hash">{{ row.b.LastCommit }}</span>
          </button>
        </template>
      </section>

      <div class="branch-workspace">
      <BranchAncestryMap :branches="allBranches" :selected="detailBranch" @open="emit('navigate', 'graph', $event)" />
      <aside v-if="settings.branchesDetailVisible" class="branch-detail" aria-label="Branch details" tabindex="0" data-keyboard-pane @keydown="returnFromPane($event, listEl)">
        <template v-if="detailBranch">
          <h3 class="bd-name">
            {{ detailBranch.Name }}
            <span v-if="detailBranch.IsCurrent" class="bd-current">current</span>
          </h3>

          <label class="branch-compare">Compare against
            <select v-model="baseline" class="ui-field size-sm" aria-label="Compare against">
              <option value="">Current branch{{ current ? ` · ${current.Name}` : '' }}</option>
              <option v-for="b in allBranches" :key="`${b.IsRemote}:${b.Name}`" :value="b.Name">{{ b.Name }}</option>
            </select>
            <span>Tip-to-tip changes</span>
          </label>
          <p v-if="detailLoading" class="bd-empty">Loading branch details…</p>
          <p v-if="detailError" role="alert">{{ detailError }}</p>
          <dl class="bd-meta">
            <div>
              <dt>Upstream</dt>
              <dd>{{ detailBranch.IsRemote ? 'remote branch' : detailBranch.IsTracking ? detailBranch.Upstream : 'no upstream' }}</dd>
            </div>
          </dl>

          <div v-if="divergence" class="bd-div">
            <span class="bd-subhead">sync · {{ detailBranch.Upstream }}</span>
            <div class="bd-div-labels">
              <span class="ahead-label">↑{{ divergence.ahead }} to push</span>
              <span class="behind-label">↓{{ divergence.behind }} to pull</span>
            </div>
            <div class="bd-div-track" :class="{ sync: divergence.sync }">
              <i v-if="divergence.aheadPct" class="ahead" :style="{ width: `${divergence.aheadPct}%` }"></i>
              <i v-if="divergence.behindPct" class="behind" :style="{ width: `${divergence.behindPct}%` }"></i>
            </div>
            <span v-if="divergence.sync" class="bd-div-sync">in sync with {{ upstreamRemote }}</span>
          </div>


          <h4 class="branch-files-heading">Changed files <span>{{ changedFiles.total.files }}</span></h4>
          <div v-if="changedFiles.total.files && comparison" class="bd-churn">
            <span class="bd-subhead">Diff · vs {{ comparison }}</span>
            <div v-for="f in changedFiles.files" :key="f.Path" class="bd-churn-row" role="button" tabindex="0" @click="openFile(f.Path)" @keydown.enter.prevent="openFile(f.Path)" @keydown.space.prevent="openFile(f.Path)">
              <PhFile class="bd-churn-icon" :size="14" aria-hidden="true" />
              <span class="bd-churn-path" :title="f.Path"><span class="bd-churn-base">{{ splitPath(f.Path).base }}</span><span class="bd-churn-dir">{{ splitPath(f.Path).dir || 'Repository root' }}</span></span>
              <span class="bd-churn-delta">
                <em v-if="f.Added" class="add">+{{ f.Added }}</em>
                <em v-if="f.Deleted" class="del">−{{ f.Deleted }}</em>
              </span>
              <DiffBar :additions="f.Added" :deletions="f.Deleted" />
            </div>
            <span v-if="changedFiles.more" class="bd-churn-more">+{{ changedFiles.more }} more files</span>
            <span class="bd-churn-total">{{ changedFiles.total.files }} files · +{{ changedFiles.total.added }} −{{ changedFiles.total.deleted }}</span>
          </div>

          <p v-if="!detailLoading && !detailError && !changedFiles.total.files" class="bd-empty">No file changes against {{ comparison || 'the current branch' }}.</p>
          <p v-if="previewLoading">Loading diff…</p>
          <p v-if="previewError" role="alert">{{ previewError }}</p>
          <UiButton v-if="preview" size="sm" @click="closePreview">Close diff</UiButton>
          <div v-if="preview" class="branch-diff"><DiffView ref="diffViewer" :diff="preview" read-only cursor-review @exit="closePreview" /></div>
          <div class="bd-actions">
            <UiButton size="sm" @click="openInGraph(detailBranch)"><kbd>o</kbd> Graph</UiButton>
            <template v-if="!detailBranch.IsCurrent">
            <UiButton size="sm" :disabled="busy" variant="primary" @click="checkout(detailBranch)"><kbd>↵</kbd> Checkout</UiButton>
            <UiButton size="sm" :disabled="busy" @click="merge(detailBranch)"><kbd>m</kbd> Merge</UiButton>
            <UiButton size="sm" :disabled="busy" @click="rebase(detailBranch)"><kbd>R</kbd> Rebase</UiButton>
            <UiButton size="sm" :disabled="busy" variant="danger" @click="remove(detailBranch)"><kbd>d</kbd> Delete</UiButton>
            </template>
          </div>
        </template>
        <p v-else class="bd-empty">Select a branch</p>
      </aside>
      </div>
    </div>

    <OperationConfirmModal
      v-if="pendingOperation"
      :request="pendingOperation"
      @close="pendingOperation = null"
    />
  </div>
</template>

<style scoped>
.branch-map-view { min-width: 0; }
.branch-map-view .branches-body, .branch-map-view .branches-body.detail-open { grid-template-columns: clamp(260px, 26%, 340px) minmax(0, 1fr); }
.branches-list { padding: 0 var(--space-4) var(--space-4); border-right: 1px solid var(--line-faint); }
.branch-browser-tools { position: sticky; top: 0; z-index: 1; display: flex; flex-direction: column; gap: var(--space-4); margin: 0 calc(-1 * var(--space-4)); padding: var(--space-6) var(--space-6) var(--space-4); background: var(--surface-panel); }
.branch-filter { justify-content: flex-start; width: 100%; color: var(--text-mut); cursor: text; }
.branch-filter:focus-within { border-color: var(--accent-line); box-shadow: var(--focus-ring); }
.branch-filter input { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; outline: 0; background: transparent; color: var(--text); font: var(--fs-md) var(--font-ui); }
.branch-filter input::placeholder { color: var(--text-mut); }
.branch-filter kbd { height: 16px; border-color: transparent; background: var(--hover); color: var(--text-mut); font-size: var(--fs-2xs); }
.branch-scope { display: flex; gap: var(--space-1); padding: var(--space-1); border-radius: calc(var(--control-radius) + 2px); background: color-mix(in oklab, var(--text) 5%, var(--surface-base)); box-shadow: inset 0 0 0 1px var(--line-faint); }
.branch-scope button { flex: 1; height: var(--control-height-sm); border: 0; border-radius: var(--radius-xs); background: transparent; color: var(--text-mut); text-transform: capitalize; font: var(--weight-medium) var(--fs-sm) var(--font-ui); transition: color var(--ease-fast), background var(--ease-fast); }
.branch-scope button:hover { color: var(--text); }
.branch-scope button[aria-pressed=true] { background: var(--surface-raised); color: var(--head); box-shadow: 0 0 0 1px var(--border), 0 1px 2px rgb(0 0 0 / .2); }
.branch-row { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto auto; gap: var(--space-1) var(--space-4); padding: var(--space-4) var(--space-4); }
.branch-cur { grid-row: 1; grid-column: 1; font-size: var(--fs-2xs); }
.branch-name { grid-row: 1; grid-column: 2; overflow: hidden; text-overflow: ellipsis; }
.branch-up, .branch-fill, .branch-hash { display: none; }
.branch-msg { grid-row: 2; grid-column: 2 / -1; }
.branch-chip { grid-row: 1; }
.branch-chip.ahead { grid-column: 3; }
.branch-chip.behind { grid-column: 4; }
.branch-workspace { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: auto; }
.branch-workspace > .branch-map { flex-shrink: 0; }
.branch-detail { overflow: visible; flex: 1; border-left: 0; box-shadow: none; background: var(--surface-panel); padding: var(--space-12); gap: var(--space-10); }
.branch-files-heading { display: flex; align-items: center; gap: var(--space-4); margin: 0; color: var(--head); font: var(--weight-medium) var(--fs-md) var(--font-ui); }
.branch-files-heading span { color: var(--text-mut); font-variant-numeric: tabular-nums; }
.branch-compare { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4); color: var(--text-mut); font: var(--font-label); }
.branch-compare select { max-width: 320px; min-width: 0; }
.bd-meta, .bd-div { max-width: 460px; }
.bd-churn { gap: 0; }
.bd-churn .bd-subhead { margin-bottom: var(--space-3); }
.bd-churn-row { display: flex; align-items: center; gap: var(--space-4); min-height: 52px; padding: var(--space-4); border-bottom: 1px solid var(--line-faint); border-radius: var(--radius-sm); cursor: pointer; }
.bd-churn-row:hover { background: var(--hover); }
.bd-churn-row:focus-visible { outline-offset: -2px; }
.bd-churn-icon { flex: none; color: var(--text-mut); }
.bd-churn-path { display: flex; flex: 1; flex-direction: column; gap: var(--space-1); }
.bd-churn-base { overflow: hidden; text-overflow: ellipsis; }
.bd-churn-dir { font-size: var(--fs-xs); overflow: hidden; text-overflow: ellipsis; }
.bd-churn { border: 1px solid var(--line-faint); border-radius: var(--radius-md); padding: var(--space-8); background: var(--surface-base); }
.bd-churn-total { padding-top: var(--space-6); }
.branch-diff { display: flex; height: 420px; min-height: 0; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-md); }
.bd-actions { display: flex; flex-wrap: wrap; gap: var(--space-4); margin-top: var(--space-4); padding-top: var(--space-8); border-top: 1px solid var(--line-faint); }
@media (max-width: 760px) {
  .branch-map-view .branches-body, .branch-map-view .branches-body.detail-open { grid-template-columns: minmax(0, 1fr); grid-template-rows: 220px minmax(0, 1fr); }
  .branches-list { border-right: 0; border-bottom: 1px solid var(--border); }
  .branch-detail { padding: var(--space-8); }
}
</style>
