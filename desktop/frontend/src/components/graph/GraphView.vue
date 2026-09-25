<script setup lang="ts">
import AuthorAvatar from '../common/AuthorAvatar.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { setModeline, resetModeline } from '../../composables/useModeline'
import GraphCanvas from './GraphCanvas.vue'
import { createCommitDetailCache } from './commitDetailCache'
import RefCluster from './RefCluster.vue'
import CommitDetailPanel from './CommitDetail.vue'
import { rowLaneColorVar } from './laneColors'
import { GRAPH_ROW_HEIGHTS } from './rowDensity'
import { tallyWorktreeDiffs, type WorktreeDeltas } from './worktreeHeat'
import SurfaceState from '../common/SurfaceState.vue'
import UiButton from '../common/UiButton.vue'
import ContextMenu, { type ContextMenuItem } from '../overlays/ContextMenu.vue'
import OperationConfirmModal, {
  type OperationConfirmRequest,
} from '../overlays/OperationConfirmModal.vue'
import { commitRefActions } from './refMenu'
import { useShellSettings } from '../../composables/useShellSettings'
import { notify } from '../../composables/useToasts'
import { useVimList } from '../../composables/useVimList'
import {
  GraphService,
  RemoteService,
  RepoService,
  WorktreeService,
  DiffService,
  type GraphLayout,
  type GraphLayoutRow,
  type RepoInfo,
} from '../../bindings/github.com/atterpac/ichi/desktop/services'
import { PhArrowLineUp, PhCopy } from '@phosphor-icons/vue'
import {
  Commit,
  type CommitDetail,
  type StatusEntry,
} from '../../bindings/github.com/atterpac/ichi/internal/git'

const props = defineProps<{ focusHash?: string }>()

const emit = defineEmits<{
  navigate: [view: string, focus?: string]
}>()

const loading = ref(true)
const error = ref('')
const repo = ref<RepoInfo | null>(null)
const layout = ref<GraphLayout | null>(null)
const selectedHash = ref('')
const commitDetail = ref<CommitDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
const workingEntries = ref<StatusEntry[]>([])
const workingDeltas = ref<WorktreeDeltas>({})
const settings = useShellSettings()
const pendingOperation = ref<OperationConfirmRequest | null>(null)

const graphRows = computed(() =>
  (layout.value?.Rows ?? []).filter(
    (row): row is GraphLayoutRow & { Commit: Commit } => row.Commit !== null,
  ),
)
const laneCount = computed(() => Math.max(layout.value?.LaneCount ?? 1, 1))
const railWidth = computed(() => laneCount.value * 3 * 12 + 16)
const rowHeight = computed(
  () => GRAPH_ROW_HEIGHTS[settings.graphRowDensity] ?? GRAPH_ROW_HEIGHTS.comfortable,
)
const detailVisible = computed(() => settings.graphDetailPosition !== 'hidden')
const selected = computed(() => {
  const row = graphRows.value.find((row) => row.Commit.Hash === selectedHash.value)
  if (row) return row.Commit
  if (!selectedHash.value) return graphRows.value[0]?.Commit
  // Parent/finder targets can fall outside the loaded graph window.
  return new Commit({
    Hash: selectedHash.value,
    ShortHash: commitDetail.value?.ShortHash || selectedHash.value.slice(0, 7),
    Message: commitDetail.value?.Subject || selectedHash.value.slice(0, 7),
    Author: commitDetail.value?.Author || '',
    Parents: commitDetail.value?.Parents || [],
    IsMerge: (commitDetail.value?.Parents?.length ?? 0) > 1,
  })
})

const detailCache = createCommitDetailCache((hash) => GraphService.LoadCommit(hash))
let detailRequest = 0
let prefetchTimer: ReturnType<typeof setTimeout> | undefined
let prefetchVersion = 0
let disposed = false
function stopPrefetch() {
  prefetchVersion++
  clearTimeout(prefetchTimer)
}
function schedulePrefetch() {
  stopPrefetch()
  if (!detailVisible.value || disposed) return
  const version = prefetchVersion
  // Let selection/rendering settle; only one background Git request at a time.
  prefetchTimer = setTimeout(async () => {
    const index = Math.max(
      0,
      graphRows.value.findIndex((row) => row.Commit.Hash === selectedHash.value),
    )
    const nearby = graphRows.value.slice(Math.max(0, index - 2), index + 13)
    for (const row of nearby) {
      if (version !== prefetchVersion || disposed) break
      const hash = row.Commit.Hash
      if (hash === '__ichi_working_changes__' || hash === selectedHash.value) continue
      try {
        await detailCache.get(hash)
      } catch {
        /* Retry on explicit selection. */
      }
    }
  }, 250)
}
onUnmounted(() => {
  resetModeline()
  disposed = true
  detailRequest++
  stopPrefetch()
  detailCache.clear()
})
watch(detailVisible, (visible) => {
  if (visible) schedulePrefetch()
  else stopPrefetch()
})

async function loadGraph() {
  stopPrefetch()
  detailCache.clear()
  detailRequest++
  loading.value = true
  error.value = ''
  try {
    repo.value = await RepoService.Info()
    layout.value = await GraphService.LoadGraphLayout(settings.graphLimit)
    const firstHash = graphRows.value[0]?.Commit.Hash ?? ''
    if (selectedHash.value === firstHash) void loadCommitDetail(firstHash)
    else selectedHash.value = firstHash
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

function formatDate(value: unknown) {
  if (!value) return ''
  const date = new Date(value as string)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

async function loadCommitDetail(hash: string) {
  const request = ++detailRequest
  schedulePrefetch()
  if (!hash) {
    commitDetail.value = null
    detailError.value = ''
    detailLoading.value = false
    return
  }
  if (hash === '__ichi_working_changes__') {
    commitDetail.value = null
    await loadWorkingEntries()
    return
  }

  const requestHash = hash
  const cached = detailCache.peek(hash)
  detailLoading.value = !cached
  detailError.value = ''
  commitDetail.value = cached
  if (cached) return
  try {
    const detail = await detailCache.get(requestHash)
    if (!detail) throw new Error('Commit details unavailable')
    if (request === detailRequest && selectedHash.value === requestHash) commitDetail.value = detail
  } catch (err) {
    if (request === detailRequest && selectedHash.value === requestHash) {
      commitDetail.value = null
      detailError.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    if (request === detailRequest && selectedHash.value === requestHash) detailLoading.value = false
  }
}

async function loadWorkingDeltas(): Promise<WorktreeDeltas> {
  // Reuse the existing batch diff APIs; never fetch every file individually.
  const read = async (staged: boolean) => {
    try {
      const raw = await (staged ? DiffService.StagedDiff() : DiffService.WorkingDiff())
      return raw ? await DiffService.ParseDiff(raw) : []
    } catch {
      return []
    } // File navigation stays available if counts cannot be read.
  }
  const [working, staged] = await Promise.all([read(false), read(true)])
  return tallyWorktreeDiffs(working, staged)
}

async function loadWorkingEntries() {
  detailLoading.value = true
  detailError.value = ''
  try {
    const [entries, deltas, info] = await Promise.all([
      WorktreeService.Status(),
      loadWorkingDeltas(),
      RepoService.Info(),
    ])
    if (selectedHash.value === '__ichi_working_changes__') {
      workingEntries.value = entries ?? []
      workingDeltas.value = deltas
      repo.value = info
    }
  } catch (err) {
    if (selectedHash.value === '__ichi_working_changes__')
      detailError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (selectedHash.value === '__ichi_working_changes__') detailLoading.value = false
  }
}

// vim-style keyboard navigation over the commit list. Cursor == selection.
const listEl = ref<HTMLElement | null>(null)
const vim = useVimList(graphRows, {
  autoListen: false, // scoped to the list's focus, not the window
  text: (row) =>
    `${row.Commit.Message} ${row.Commit.Author} ${row.Commit.ShortHash} ${row.Commit.Refs.join(' ')}`,
  onAction(action, payload) {
    const row = payload.items[0]
    if (action === 'open' && row) selectCommit(row.Commit)
  },
})

// Ref action palette (combo 02 + 06): `r` opens the verbs for the refs on the
// selected commit; the inline cluster badge opens it by click.
function onKey(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) return
  if (!vim.search.active.value && !event.ctrlKey && !event.metaKey && !event.altKey && ['l', 'ArrowRight', 'Enter'].includes(event.key)) {
    if (!detailVisible.value) settings.graphDetailPosition = 'right'
    void nextTick(() => document.getElementById('commit-inspector')?.focus())
    event.preventDefault()
    return
  }
  if (event.key === 'r' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (selected.value && selected.value.Hash !== '__ichi_working_changes__') {
      openRowMenuKey()
      event.preventDefault()
      return
    }
  }
  if (vim.handleKey(event)) event.preventDefault()
}

function scrollToCursor() {
  const rows = listEl.value?.querySelectorAll<HTMLElement>('.commit-row')
  rows?.[vim.cursor.value]?.scrollIntoView({ block: 'nearest' })
}

watch(
  () => vim.cursor.value,
  () => {
    const row = graphRows.value[vim.cursor.value]
    if (row) selectedHash.value = row.Commit.Hash
    void nextTick(scrollToCursor)
  },
)

watch(
  () => settings.graphLimit,
  () => {
    void loadGraph()
  },
)

watch(
  () => selectedHash.value,
  (hash) => {
    void loadCommitDetail(hash)
  },
)

function selectCommit(commit: Commit) {
  const index = graphRows.value.findIndex((row) => row.Commit.Hash === commit.Hash)
  if (index >= 0) {
    selectedHash.value = graphRows.value[index]!.Commit.Hash
    vim.moveTo(index)
  } else selectedHash.value = commit.Hash
}

function isSelected(row: GraphLayoutRow & { Commit: Commit }, index: number) {
  return selectedHash.value ? row.Commit.Hash === selectedHash.value : index === vim.cursor.value
}

// right-click context menu over commit rows.
const menu = ref<InstanceType<typeof ContextMenu> | null>(null)

async function copy(text: string) {
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable')
    await navigator.clipboard.writeText(text)
    notify({ tone: 'success', title: 'Copied to clipboard' })
  } catch {
    notify({ tone: 'danger', title: 'Unable to copy to clipboard' })
  }
}

async function runRef(fn: () => Promise<void>) {
  try {
    await fn()
    await loadGraph()
    notify({ tone: 'success', title: 'Operation complete' })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    throw err
  }
}

function openOperation(request: OperationConfirmRequest) {
  pendingOperation.value = request
}

async function pushCurrentBranch(values?: Record<string, string>) {
  try {
    const remote = values?.remote?.trim()
    const branch = values?.branch?.trim()
    if (remote && branch) await RemoteService.PushSetUpstream(remote, branch)
    else await RemoteService.Push()
    await loadGraph()
    notify({
      tone: 'success',
      title: 'Push complete',
      message: repo.value?.Branch ? `Pushed ${repo.value.Branch}` : undefined,
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    throw err
  }
}

async function openPushConfirm() {
  const branch = repo.value?.Branch || ''
  const hasUpstream = await RemoteService.HasUpstream().catch(() => true)
  openOperation({
    title: hasUpstream ? 'Push current branch?' : 'Set upstream and push?',
    message: hasUpstream
      ? 'Push local commits to the configured upstream remote.'
      : 'No upstream is configured. Enter the remote and branch to publish this branch.',
    confirmLabel: hasUpstream ? 'Push' : 'Push with upstream',
    target: branch || 'detached HEAD',
    details: [
      {
        label: 'Ahead',
        value: `${repo.value?.Ahead ?? 0} commit${repo.value?.Ahead === 1 ? '' : 's'}`,
      },
      {
        label: 'Behind',
        value: `${repo.value?.Behind ?? 0} commit${repo.value?.Behind === 1 ? '' : 's'}`,
      },
    ],
    inputs: hasUpstream
      ? undefined
      : [
          { id: 'remote', label: 'Remote', value: 'origin', required: true, pattern: '^[^\\s]+$' },
          { id: 'branch', label: 'Branch', value: branch, required: true, pattern: '^[^\\s]+$' },
        ],
    icon: PhArrowLineUp,
    tone: hasUpstream ? 'default' : 'warning',
    onConfirm: pushCurrentBranch,
  })
}

// Copy rows + (for real commits) the shared branch/reset/ref action set. Same
// list feeds the right-click menu and the `r` keybind.
function rowMenuItems(commit: Commit): ContextMenuItem[] {
  const items: ContextMenuItem[] = [
    { id: 'copy-sha', label: 'Copy SHA', icon: PhCopy, action: () => copy(commit.Hash) },
    {
      id: 'copy-short',
      label: 'Copy short SHA',
      icon: PhCopy,
      action: () => copy(commit.ShortHash),
    },
    { id: 'copy-msg', label: 'Copy message', icon: PhCopy, action: () => copy(commit.Message) },
  ]
  if (commit.Hash !== '__ichi_working_changes__') {
    items.push(
      { separator: true },
      ...commitRefActions(commit, {
        currentBranch: repo.value?.Branch ?? '',
        laneColorForRef: (name) => {
          const row = graphRows.value.find((row) =>
            row.Commit.Decorations?.some((ref) => ref.Name === name),
          )
          return row
            ? settings.graphCanvasStyle === 'mono'
              ? '--accent'
              : rowLaneColorVar(row)
            : undefined
        },
        run: runRef,
        confirm: openOperation,
      }),
    )
  }
  return items
}

function runDetailAction(id: 'branch-here' | 'cherry-pick') {
  if (!selected.value) return
  const item = rowMenuItems(selected.value).find((item) => !item.separator && item.id === id)
  if (item && !item.disabled) void item.action?.()
}

function openRowMenu(event: MouseEvent, commit: Commit) {
  selectCommit(commit)
  menu.value?.open(event, rowMenuItems(commit))
}

// `r` opens the same menu for the selected commit, anchored to its row so it
// reads as a commit action and stays keyboard-drivable (j/k, shortcuts, ⏎).
function openRowMenuKey() {
  const commit = selected.value
  if (!commit) return
  const rows = listEl.value?.querySelectorAll<HTMLElement>('.commit-row')
  const rect = rows?.[vim.cursor.value]?.getBoundingClientRect()
  const at = rect
    ? { clientX: rect.left + 40, clientY: rect.bottom }
    : { clientX: 200, clientY: 200 }
  menu.value?.open(at, rowMenuItems(commit))
}

// Land on an externally-requested commit (finder commit-enter, branches `o`).
// If the hash is in the loaded window we move the cursor to it; otherwise we still
// select it so the detail pane loads, even though it isn't a visible row.
function focusOn(hash: string) {
  if (!hash) return
  const index = graphRows.value.findIndex(
    (row) => row.Commit.Hash === hash || row.Commit.ShortHash === hash,
  )
  if (index >= 0) {
    selectedHash.value = graphRows.value[index]!.Commit.Hash
    vim.moveTo(index)
  } else selectedHash.value = hash
}

watch(
  () => props.focusHash,
  (hash) => {
    if (hash) focusOn(hash)
  },
)

onMounted(() => {
  void loadGraph().then(() => {
    if (props.focusHash) focusOn(props.focusHash)
    nextTick(() => listEl.value?.focus())
  })
})
</script>

<template>
  <div class="graph-view">
    <Teleport defer to="#view-header-context">
      <span v-if="repo" class="header-sync" aria-label="Branch sync status"
        ><span class="sync-ahead">↑{{ repo.Ahead }}</span> ahead
        <span>↓{{ repo.Behind }}</span> behind</span
      >
      <UiButton size="sm" title="Push current branch" @click="openPushConfirm">
        <PhArrowLineUp :size="16" weight="bold" />
        Push <span v-if="repo?.Ahead" class="push-count">{{ repo.Ahead }}</span>
      </UiButton>
    </Teleport>

    <SurfaceState
      v-if="loading"
      tone="loading"
      title="Loading history"
      message="Reading commits, refs, and worktree state."
    />
    <SurfaceState
      v-else-if="error"
      tone="error"
      title="Unable to load history"
      :message="error"
      action-label="Retry"
      @action="loadGraph"
    />
    <SurfaceState
      v-else-if="!graphRows.length"
      title="No commits yet"
      message="Create the first commit to begin this repository's history."
    />
    <div
      v-else
      class="graph-grid"
      :style="{ '--detail-width': `${settings.graphDetailWidth}px` }"
      :class="[`detail-${settings.graphDetailPosition}`, { 'detail-hidden': !detailVisible }]"
    >
      <section
        ref="listEl"
        class="commit-list"
        :class="[
          `density-${settings.graphRowDensity}`,
          { 'no-author-column': !settings.graphShowAuthor },
        ]"
        :style="{ '--graph-row-height': `${rowHeight}px` }"
        aria-label="Commit graph"
        data-keyboard-pane
        tabindex="0"
        @keydown="onKey"
        @focusin="setModeline({ mode: 'GRAPH', hints: 'j/k commit · l inspector · r refs · / search' })"
      >
        <div
          v-if="vim.search.active.value || vim.pending.value || vim.count.value"
          class="vim-cmdline"
        >
          <template v-if="vim.search.active.value"
            >/{{ vim.search.query.value }}<span class="vim-caret">▌</span></template
          >
          <template v-else>{{ vim.count.value }}{{ vim.pending.value }}</template>
        </div>
        <div class="commit-table-head" :style="{ '--rail-width': `${railWidth}px` }">
          <span class="th-refs">Refs</span>
          <span>Graph</span>
          <span>Subject</span>
          <span>Hash</span>
          <span v-if="settings.graphShowAuthor">Author</span>
          <span>Date</span>
        </div>
        <div class="commit-list-canvas" :style="{ '--rail-width': `${railWidth}px` }">
          <GraphCanvas :rows="graphRows" :lane-count="laneCount" />
          <button
            v-for="(row, index) in graphRows"
            :key="row.Commit.Hash"
            class="commit-row"
            :data-commit-hash="row.Commit.Hash"
            :tabindex="isSelected(row, index) ? 0 : -1"
            :style="{
              '--row-lane':
                settings.graphCanvasStyle === 'mono'
                  ? 'var(--accent)'
                  : `var(${rowLaneColorVar(row)})`,
            }"
            :class="{ selected: isSelected(row, index), merge: row.Commit.IsMerge }"
            type="button"
            @click="selectCommit(row.Commit)"
            @contextmenu.prevent="openRowMenu($event, row.Commit)"
          >
            <span class="commit-refs">
              <RefCluster
                v-if="row.Commit.Decorations?.length"
                :decorations="row.Commit.Decorations"
                @click.stop="openRowMenu($event, row.Commit)"
              />
            </span>
            <span class="commit-rail" aria-hidden="true" />
            <span class="commit-main">
              <span class="commit-subject">{{ row.Commit.Message }}</span>
            </span>
            <span class="commit-hash">{{ row.Commit.ShortHash }}</span>
            <span v-if="settings.graphShowAuthor" class="commit-table-author author-identity"><AuthorAvatar v-if="row.Commit.Hash !== '__ichi_working_changes__'" :name="row.Commit.Author" :commit="row.Commit.Hash" :size="18" /><span class="author-name">{{ row.Commit.Author }}</span></span>
            <span class="commit-table-date">{{ formatDate(row.Commit.Date) }}</span>
          </button>
        </div>
      </section>

      <CommitDetailPanel
        v-if="detailVisible && selected"
        :commit="selected"
        :detail="commitDetail"
        :loading="detailLoading"
        :error="detailError"
        :repo="repo"
        :working-entries="workingEntries"
        :working-deltas="workingDeltas"
        @retry="loadCommitDetail(selectedHash)"
        @copy="copy"
        @parent="focusOn"
        @navigate="(view, focus) => emit('navigate', view, focus)"
        @menu="(event) => selected && openRowMenu(event, selected)"
        @action="runDetailAction"
      />
    </div>

    <ContextMenu ref="menu" />
    <OperationConfirmModal
      v-if="pendingOperation"
      :request="pendingOperation"
      @close="pendingOperation = null"
    />
  </div>
</template>
