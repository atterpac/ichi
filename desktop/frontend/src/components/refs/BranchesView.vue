<script setup lang="ts">
import { isEditable, isModified, returnFromPane } from '../../composables/keyboard'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { PhCaretRight, PhArrowsClockwise, PhGitBranch } from '@phosphor-icons/vue'
import OperationConfirmModal, { type OperationConfirmRequest } from '../overlays/OperationConfirmModal.vue'
import SurfaceState from '../common/SurfaceState.vue'
import UiButton from '../common/UiButton.vue'
import { setModeline, resetModeline } from '../../composables/useModeline'
import { useShellSettings } from '../../composables/useShellSettings'
import { notify } from '../../composables/useToasts'
import { useVimList } from '../../composables/useVimList'
import { RefService, RemoteService, StashService } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import type { Branch, Divergence, FileChurn, RefCommit } from '../../bindings/github.com/atterpac/ichi/internal/git'

const emit = defineEmits<{ (e: 'navigate', view: string, focus?: string): void }>()

const settings = useShellSettings()

const loading = ref(true)
const error = ref('')
const busy = ref(false)
const locals = ref<Branch[]>([])
const remotes = ref<Branch[]>([])
const pendingOperation = ref<OperationConfirmRequest | null>(null)
const listEl = ref<HTMLElement | null>(null)
const folded = ref(new Set<string>())
const detailFork = ref<Divergence | null>(null)
const detailLog = ref<RefCommit[]>([])
const detailChurn = ref<FileChurn[]>([])

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
      ...locals.value.map((b, i) => branchRow(b, i === 0 ? { sectBefore: `Local — ${locals.value.length}` } : {})),
      ...remotes.value.map((b, i) => branchRow(b, i === 0 ? { sectBefore: `Remote — ${remotes.value.length}` } : {})),
    ]
  }

  const rows: DisplayRow[] = []
  // Locals: slash prefixes shared by 2+ branches become foldable groups;
  // singletons stay flat so short names never gain pointless nesting.
  const byPrefix = new Map<string, Branch[]>()
  const singles: Branch[] = []
  for (const b of locals.value) {
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
  singles.sort((a, b) => locals.value.indexOf(a) - locals.value.indexOf(b))
  rows.push(...singles.map((b) => branchRow(b)))
  for (const [prefix, members] of [...byPrefix].sort(([a], [b]) => a.localeCompare(b))) {
    const id = `local:${prefix}`
    const isFolded = folded.value.has(id)
    rows.push({ kind: 'group', id, label: prefix, count: members.length, folded: isFolded })
    if (!isFolded) rows.push(...members.map((b) => branchRow(b, { child: true, group: id, short: b.Name.slice(prefix.length) })))
  }
  // Remotes: one foldable root per remote name.
  const byRemote = new Map<string, Branch[]>()
  for (const b of remotes.value) {
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

// Pane middle: commit rail (per-ref log ending at the fork point) and the
// tree diff against the checked-out branch. One request id guards all three
// fetches per cursor.
let detailReq = 0
watch(
  [() => settings.branchesDetailVisible, () => detailBranch.value?.Name, () => current.value?.Name],
  async ([open, selected, head]) => {
    if (!open || !selected) {
      detailFork.value = null
      detailLog.value = []
      detailChurn.value = []
      return
    }
    const req = ++detailReq
    const isHead = !head || selected === head
    const [log, fork, churn] = await Promise.all([
      RefService.LogRef(selected, 6).catch(() => null),
      isHead ? null : RefService.BranchDivergence(head!, selected).catch(() => null),
      isHead ? null : RefService.DiffFiles(head!, selected).catch(() => null),
    ])
    if (req !== detailReq) return
    detailLog.value = (log ?? []).filter(Boolean)
    detailFork.value = fork
    detailChurn.value = (churn ?? []).filter(Boolean)
  },
  { immediate: true },
)

type RailRow = { hash: string; subject: string; when: string; fork: boolean; tip: boolean }

// The rail truncates at the fork point when it is within the fetched window,
// otherwise the fork commit is appended so the rail always grounds somewhere.
const rail = computed<RailRow[]>(() => {
  const rows: RailRow[] = detailLog.value.map((c, i) => ({
    hash: c.Hash,
    subject: c.Subject,
    when: c.When,
    fork: false,
    tip: i === 0,
  }))
  const base = detailFork.value?.Base
  if (!base) return rows
  const at = rows.findIndex((r) => r.hash === base)
  if (at >= 0) {
    const cut = rows.slice(0, at + 1)
    cut[at] = { ...cut[at]!, fork: true }
    return cut
  }
  rows.push({ hash: base, subject: detailFork.value?.BaseMsg ?? '', when: '', fork: true, tip: false })
  return rows
})

const FILE_LIST_LIMIT = 12

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

function onListKey(event: KeyboardEvent) {
  if (event.defaultPrevented || isEditable(event.target)) return
  if (isModified(event)) { if (vim.handleKey(event)) event.preventDefault(); return }
  if (pendingOperation.value) return
  if (vim.search.active.value) {
    if (vim.handleKey(event)) event.preventDefault()
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
    hints: '⏎ checkout · o graph · n new · r rename · d delete · m merge · R rebase · t group · i inspector · F6 pane · / search',
  })
  await refresh()
  await nextTick()
  listEl.value?.focus()
})
onUnmounted(resetModeline)
</script>

<template>
  <div class="branches-view">
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
        <div v-if="vim.search.active.value" class="vim-cmdline">
          /{{ vim.search.query.value }}<span class="vim-caret">▌</span>
        </div>

        <template v-for="(row, i) in displayRows" :key="row.kind === 'branch' ? row.b.Name : row.id">
          <div v-if="row.kind === 'branch' && row.sectBefore" class="branch-sect">{{ row.sectBefore }}</div>

          <button
            v-if="row.kind === 'group'"
            type="button"
            class="branch-group"
            :class="{ selected: vim.cursor.value === i }"
            @click="vim.moveTo(i); toggleFold(row.id)"
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
            <span v-if="row.b.Ahead" class="branch-chip ahead">↑{{ row.b.Ahead }}</span>
            <span v-if="row.b.Behind" class="branch-chip behind">↓{{ row.b.Behind }}</span>
            <span class="branch-hash">{{ row.b.LastCommit }}</span>
          </button>
        </template>
      </section>

      <aside v-if="settings.branchesDetailVisible" class="branch-detail" aria-label="Branch details" tabindex="0" data-keyboard-pane @keydown="returnFromPane($event, listEl)">
        <template v-if="detailBranch">
          <h3 class="bd-name">
            {{ detailBranch.Name }}
            <span v-if="detailBranch.IsCurrent" class="bd-current">current</span>
          </h3>

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


          <div v-if="rail.length" class="bd-rail-block">
            <span class="bd-subhead">History</span>
            <div class="bd-rail">
              <div v-for="row in rail" :key="row.hash" class="bd-rail-row" :class="{ fork: row.fork }">
                <div class="bd-rail-glyph"><i class="bd-rail-dot"></i></div>
                <div class="bd-rail-body">
                  <div class="bd-rail-line">
                    <span class="bd-rail-hash">{{ row.hash }}</span>
                    <span class="bd-rail-subj">{{ row.fork && current && detailBranch.Name !== current.Name && (detailFork?.AheadB ?? 0) > 0 ? `forked from ${current.Name} · ${row.subject}` : row.subject }}</span>
                    <span v-if="row.tip" class="bd-rail-badge">tip</span>
                  </div>
                  <span v-if="row.when" class="bd-rail-when">{{ row.when }}</span>
                </div>
              </div>
            </div>
          </div>

          <div v-if="changedFiles.total.files && current" class="bd-churn">
            <span class="bd-subhead">Diff · vs {{ current.Name }}</span>
            <div v-for="f in changedFiles.files" :key="f.Path" class="bd-churn-row">
              <span class="bd-churn-path">{{ f.Path }}</span>
              <span class="bd-churn-delta">
                <em v-if="f.Added" class="add">+{{ f.Added }}</em>
                <em v-if="f.Deleted" class="del">−{{ f.Deleted }}</em>
              </span>
            </div>
            <span v-if="changedFiles.more" class="bd-churn-more">+{{ changedFiles.more }} more files</span>
            <span class="bd-churn-total">{{ changedFiles.total.files }} files · +{{ changedFiles.total.added }} −{{ changedFiles.total.deleted }}</span>
          </div>

          <div class="bd-actions">
            <UiButton size="sm" @click="openInGraph(detailBranch)"><kbd>o</kbd> Graph</UiButton>
            <template v-if="!detailBranch.IsCurrent">
            <UiButton size="sm" variant="primary" @click="checkout(detailBranch)"><kbd>↵</kbd> Checkout</UiButton>
            <UiButton size="sm" @click="merge(detailBranch)"><kbd>m</kbd> Merge</UiButton>
            <UiButton size="sm" @click="rebase(detailBranch)"><kbd>R</kbd> Rebase</UiButton>
            <UiButton size="sm" variant="danger" @click="remove(detailBranch)"><kbd>d</kbd> Delete</UiButton>
            </template>
          </div>
        </template>
        <p v-else class="bd-empty">Select a branch</p>
      </aside>
    </div>

    <OperationConfirmModal
      v-if="pendingOperation"
      :request="pendingOperation"
      @close="pendingOperation = null"
    />
  </div>
</template>
