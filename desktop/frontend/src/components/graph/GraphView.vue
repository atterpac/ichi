<script setup lang="ts">
import { navigationGeneration, invalidateNavigationSnapshots, peekNavigationSnapshot, saveNavigationSnapshot, forgetNavigationSnapshot } from '../../composables/navigationSnapshots'

import { useRepoSwitchGuard } from '../../composables/useRepoSwitchGuard'
import AuthorAvatar from '../common/AuthorAvatar.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { setModeline, resetModeline } from '../../composables/useModeline'
import GraphSvg from './GraphSvg.vue'
import { createCommitDetailCache } from './commitDetailCache'
import RefCluster from './RefCluster.vue'
import RefLabel from '../common/RefLabel.vue'
import { branchLabels } from './branchLabels'
import CommitDetailPanel from './CommitDetail.vue'
import { rowLaneColorVar } from './laneColors'
import { GRAPH_ROW_HEIGHTS } from './rowDensity'
import { GRAPH_GLYPH_WIDTH, GRAPH_RAIL_PADDING, graphRailWidth } from './graphGeometry'
import { summaryDeltas, type WorktreeDeltas } from './worktreeHeat'
import SurfaceState from '../common/SurfaceState.vue'
import UiButton from '../common/UiButton.vue'
import ContextMenu, { type ContextMenuItem } from '../overlays/ContextMenu.vue'
import OperationConfirmModal, {
  type OperationConfirmRequest,
} from '../overlays/OperationConfirmModal.vue'
import { commitRefActions } from './refMenu'
import { usePreferenceBindings } from '../../customization/usePreferences'
import { notify } from '../../composables/useToasts'
import { useGitOperation } from '../../composables/useGitOperation'
import { useVirtualWindow } from '../../composables/useVirtualWindow'
import { isEditable, isModified } from '../../composables/keyboard'
import { useVimList } from '../../composables/useVimList'
import {
  GraphService,
  RemoteService,
  StashService,
  WorktreeService,
  type GraphLayout,
  type GraphLayoutRow,
  type RepoInfo,
} from '../../bindings/github.com/atterpac/ichi/desktop/services'
import { PhArchive, PhArrowLineUp, PhCopy, PhDownloadSimple, PhTrash } from '@phosphor-icons/vue'
import { invalidateChangesSnapshots } from '../status/changesSnapshotCache'
import { workingDraft } from './workingDraft'
import {
  Commit,
  type CommitDetail,
  type CommitMetadata,
  type StatusEntry,
} from '../../bindings/github.com/atterpac/ichi/internal/git'

const props = defineProps<{ focusHash?: string; repositoryPath?: string; focusBlocked?: boolean }>()

const emit = defineEmits<{
  navigate: [view: string, focus?: string, file?: string]
}>()
const detailPane = ref<InstanceType<typeof CommitDetailPanel> | null>(null)

const loading = ref(true)
const graphRefreshing = ref(false)
let layoutGeneration = navigationGeneration()
let layoutLimit = 0
const error = ref('')
const repo = ref<RepoInfo | null>(null)
const layout = shallowRef<GraphLayout | null>(null)
const selectedHash = ref('')
const commitDetail = ref<CommitDetail | null>(null)
const commitMetadata = ref<CommitMetadata | null>(null)
const metadataLoading = ref(false)
const metadataError = ref('')
let metadataWanted = false
let metadataRequest = 0
let activeMetadata: (Promise<CommitMetadata | null> & { cancel?: () => void }) | undefined
function stopMetadata() {
  metadataRequest++
  activeMetadata?.cancel?.()
  activeMetadata = undefined
  metadataLoading.value = false
  commitMetadata.value = null
  metadataError.value = ''
}
async function loadMetadata() {
  stopMetadata()
  if (!metadataWanted || !detailVisible.value || !commitDetail.value || disposed) return
  const version = metadataRequest
  const hash = commitDetail.value.Hash || selectedHash.value
  metadataLoading.value = true
  try {
    activeMetadata = GraphService.LoadCommitMetadata(hash)
    const metadata = await activeMetadata
    if (version !== metadataRequest || disposed) return
    if (!metadata) throw new Error('Commit metadata unavailable')
    commitMetadata.value = metadata
  } catch (err) {
    if (version === metadataRequest && !disposed) metadataError.value = String(err)
  } finally {
    if (version === metadataRequest && !disposed) { metadataLoading.value = false; activeMetadata = undefined }
  }
}
function metadataTab(active: boolean) {
  metadataWanted = active
  if (active) void loadMetadata()
  else stopMetadata()
}
const detailLoading = ref(false)
const detailError = ref('')
const workingEntries = ref<StatusEntry[]>([])
const workingDeltas = ref<WorktreeDeltas>({})
const settings = usePreferenceBindings()
const pendingOperation = ref<OperationConfirmRequest | null>(null)

const graphRows = computed(() =>
  (layout.value?.Rows ?? []).filter(
    (row): row is GraphLayoutRow & { Commit: Commit } => row.Commit !== null,
  ),
)
const laneCount = computed(() => Math.max(layout.value?.LaneCount ?? 1, 1))
const commitBranches = computed(() => branchLabels(
  graphRows.value.map((row) => row.Commit),
  layout.value?.CurrentBranch || repo.value?.Branch || '',
))
const railWidth = computed(() => graphRailWidth(laneCount.value))
// The viewport stays fixed while the underlying lane coordinates scroll.
const laneScroller = ref<HTMLElement | null>(null)
const laneViewportWidth = ref(160)
const laneScrollOffset = ref(0)
const lanesOverflow = computed(() => railWidth.value > laneViewportWidth.value)
watch(laneScroller, (element, _, onCleanup) => {
  if (!element) return
  const measure = () => {
    if (element.clientWidth > 0) laneViewportWidth.value = element.clientWidth
    laneScrollOffset.value = element.scrollLeft
  }
  measure()
  if (typeof ResizeObserver === 'undefined') return
  const observer = new ResizeObserver(measure)
  observer.observe(element)
  onCleanup(() => observer.disconnect())
})
function scrollLanes(event: Event) {
  laneScrollOffset.value = (event.currentTarget as HTMLElement).scrollLeft
}
function wheelLanes(event: WheelEvent) {
  const element = laneScroller.value
  const delta = event.deltaX || (event.shiftKey ? event.deltaY : 0)
  if (!element || !delta || event.ctrlKey || event.metaKey) return
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? laneViewportWidth.value : 1
  const next = Math.max(0, Math.min(element.scrollWidth - element.clientWidth, element.scrollLeft + delta * unit))
  if (next === element.scrollLeft) return
  event.preventDefault()
  element.scrollLeft = next
  laneScrollOffset.value = next
}
watch(selectedHash, async hash => {
  await nextTick()
  const element = laneScroller.value
  const row = graphRows.value.find(row => row.Commit.Hash === hash)
  if (!element || !row) return
  for (const [laneIndex, lane] of row.Lanes.entries()) {
    const glyphIndex = lane.Glyphs.findIndex(glyph => ['node', 'head-node', 'merge-node', 'stash-node', 'unstaged-node'].includes(glyph.Kind))
    if (glyphIndex < 0) continue
    const x = GRAPH_RAIL_PADDING + ((lane.Column ?? laneIndex) * 3 + glyphIndex) * GRAPH_GLYPH_WIDTH + GRAPH_GLYPH_WIDTH / 2
    const margin = 14
    if (x - margin < element.scrollLeft) element.scrollLeft = Math.max(0, x - margin)
    else if (x + margin > element.scrollLeft + laneViewportWidth.value) element.scrollLeft = x + margin - laneViewportWidth.value
    laneScrollOffset.value = element.scrollLeft
    break
  }
})
const rowHeight = computed(
  () => GRAPH_ROW_HEIGHTS[settings['graph.rowDensity']] ?? GRAPH_ROW_HEIGHTS.comfortable,
)
const detailVisible = computed(() => settings['graph.detailPosition'] !== 'hidden')
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

const detailCache = createCommitDetailCache((hash) => GraphService.LoadCommit(hash), 80, Infinity, () => repo.value?.Path ?? '')
let detailRequest = 0
let prefetchTimer: ReturnType<typeof setTimeout> | undefined
let prefetchVersion = 0
let disposed = false
let graphRequest = 0
function stopPrefetch() {
  prefetchVersion++
  clearTimeout(prefetchTimer)
  detailCache.cancelPending()
}
function schedulePrefetch() {
  stopPrefetch()
  if (!detailVisible.value || disposed || (commitDetail.value?.Files?.length ?? 0) > 200) return
  const version = prefetchVersion
  // Let selection/rendering settle; only one background Git request at a time.
  prefetchTimer = setTimeout(async () => {
    const index = Math.max(
      0,
      graphRows.value.findIndex((row) => row.Commit.Hash === selectedHash.value),
    )
    const nearby = [graphRows.value[index + 1], graphRows.value[index - 1]]
    for (const row of nearby) {
      if (version !== prefetchVersion || disposed) break
      if (!row) continue
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
  if (!graphRefreshing.value && !activeOperations.value && !error.value && repo.value && layout.value) {
    saveNavigationSnapshot('graph', props.repositoryPath ?? '', { info: repo.value, layout: layout.value, selection: selectedHash.value }, layoutGeneration, layoutLimit)
  }
  disposed = true
  graphRequest++
  activeGraphRead?.cancel?.()
  detailRequest++
  stopPrefetch()
  stopMetadata()
})
watch(detailVisible, (visible) => {
  if (visible) void loadCommitDetail(selectedHash.value)
  else { detailRequest++; stopPrefetch(); stopMetadata() }
})

let activeGraphRead: { cancel?: () => void } | undefined
async function loadGraph() {
  activeGraphRead?.cancel?.()
  const request = ++graphRequest
  stopPrefetch()
  stopMetadata()
  detailRequest++
  // A deliberate reload may follow a fetch/deepen, replace-ref or config change.
  // Initial mounting keeps the bounded warm cache from the previous visit.
  if (layoutLimit > 0) detailCache.clearScope()
  graphRefreshing.value = true
  loading.value = !layout.value
  error.value = ''
  const version = navigationGeneration()
  const limit = settings['graph.limit']
  forgetNavigationSnapshot('graph', props.repositoryPath ?? '', limit)
  try {
    const pending = GraphService.LoadGraphLayout(limit, settings['graph.showStashes'])
    activeGraphRead = pending
    const graph = await pending
    if (request !== graphRequest || disposed) return
    if (version !== navigationGeneration()) { await loadGraph(); return }
    layoutGeneration = version
    layoutLimit = limit
    repo.value = graph?.Info ?? null
    layout.value = graph
    const firstHash = graphRows.value[0]?.Commit.Hash ?? ''
    if (!graphRows.value.some(row => row.Commit.Hash === selectedHash.value)) selectedHash.value = firstHash
  } catch (err) {
    if (request !== graphRequest || disposed) return
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (request === graphRequest && !disposed) {
      activeGraphRead = undefined
      loading.value = false
      graphRefreshing.value = false
      if (!error.value) void loadCommitDetail(selectedHash.value)
    }
  }
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
function formatDate(value: unknown) {
  if (!value) return ''
  const date = new Date(value as string)
  if (Number.isNaN(date.getTime())) return ''
  return dateFormatter.format(date)
}

async function loadCommitDetail(hash: string) {
  const request = ++detailRequest
  stopPrefetch()
  stopMetadata()
  if (graphRefreshing.value) { commitDetail.value = null; detailLoading.value = false; return }
  if (!detailVisible.value) { commitDetail.value = null; detailLoading.value = false; return }
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
  if (cached) { schedulePrefetch(); void loadMetadata(); return }
  try {
    const detail = await detailCache.get(requestHash)
    if (!detail) throw new Error('Commit details unavailable')
    if (request === detailRequest && selectedHash.value === requestHash && !disposed) {
      commitDetail.value = detail
      schedulePrefetch()
      void loadMetadata()
    }
  } catch (err) {
    if (request === detailRequest && selectedHash.value === requestHash) {
      commitDetail.value = null
      detailError.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    if (request === detailRequest && selectedHash.value === requestHash) detailLoading.value = false
  }
}

async function loadWorkingEntries() {
  const request = detailRequest
  detailLoading.value = true
  detailError.value = ''
  try {
    const snapshot = await WorktreeService.Summary()
    if (request === detailRequest && !disposed && selectedHash.value === '__ichi_working_changes__') {
      workingEntries.value = snapshot?.Summary?.Entries ?? []
      workingDeltas.value = summaryDeltas(snapshot?.Summary?.Working ?? [], snapshot?.Summary?.Staged ?? [])
      repo.value = snapshot?.Info ?? null
    }
  } catch (err) {
    if (request === detailRequest && !disposed && selectedHash.value === '__ichi_working_changes__')
      detailError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (request === detailRequest && !disposed && selectedHash.value === '__ichi_working_changes__') detailLoading.value = false
  }
}

// vim-style keyboard navigation over the commit list. Cursor == selection.
const listEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLElement | null>(null)
const headerEl = ref<HTMLElement | null>(null)
const footerEl = ref<HTMLElement | null>(null)
const contentOffset = ref(40)
const headerHeight = ref(28)
const footerHeight = ref(18)
watch([listEl, canvasEl, headerEl, footerEl], ([list, canvas, header, footer], _, onCleanup) => {
  if (!list || !canvas || !header || !footer) return
  const measure = () => {
    contentOffset.value = canvas.offsetTop
    headerHeight.value = header.offsetHeight
    footerHeight.value = footer.offsetHeight
  }
  measure()
  if (typeof ResizeObserver !== 'function') return
  const observer = new ResizeObserver(measure)
  for (const element of [list, header, footer]) observer.observe(element)
  onCleanup(() => observer.disconnect())
}, { flush: 'post' })
const { window: virtualWindow, scrollToRow } = useVirtualWindow({
  container: listEl, count: () => graphRows.value.length, rowHeight, overscan: 8,
  offset: contentOffset, paddingStart: headerHeight, paddingEnd: footerHeight,
})
const visibleRows = computed(() => graphRows.value.slice(virtualWindow.value.start, virtualWindow.value.end))
// Keep keyboard ownership when wheel scrolling removes the focused row.
watch(virtualWindow, (range) => {
  const focused = document.activeElement as HTMLElement | null
  if (!focused?.matches('.commit-row') || !listEl.value?.contains(focused)) return
  const index = Number(focused.dataset.rowIndex)
  if (index < range.start || index >= range.end) listEl.value.focus({ preventScroll: true })
})
const keyboardNavigation = ref(false)
const showCommitRefs = ref(false)
const hoveredCommit = ref('')
function releaseCommitRefs(event: KeyboardEvent) {
  if (event.key === 'Shift') showCommitRefs.value = false
}
function resetCommitRefs() { showCommitRefs.value = false; lastYank = null }
function onGraphFocusOut(event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !listEl.value?.contains(event.relatedTarget)) {
    resetCommitRefs()
  }
}
const vim = useVimList(graphRows, {
  autoListen: false, // scoped to the list's focus, not the window
  text: (row) =>
    `${row.Commit.Message} ${row.Commit.Author} ${row.Commit.ShortHash} ${row.Commit.Refs.join(' ')}`,
  onAction(action, payload) {
    const row = payload.items[0]
    if (action === 'open' && row) selectCommit(row.Commit)
  },
})

// Copy immediately to keep clipboard access within the keyboard gesture.
// A second press replaces the SHA with the branch label for the same commit.
let lastYank: { hash: string; at: number } | null = null
function yankCommit(event: KeyboardEvent): boolean {
  if (event.key !== 'y') { lastYank = null; return false }
  if (event.defaultPrevented || isModified(event) || isEditable(event.target) ||
      vim.search.active.value || graphRefreshing.value) { lastYank = null; return false }
  const commit = (!keyboardNavigation.value && hoveredCommit.value
    ? graphRows.value.find(row => row.Commit.Hash === hoveredCommit.value)?.Commit
    : selected.value)
  if (!commit || commit.Hash === '__ichi_working_changes__') { lastYank = null; return false }
  event.preventDefault()
  if (event.repeat) return true
  const now = performance.now()
  if (lastYank?.hash === commit.Hash && now - lastYank.at <= 500) {
    lastYank = null
    const branch = commitBranches.value.get(commit.Hash)
    if (branch) void copy(branch)
    else notify({ tone: 'warning', title: 'No branch name for this commit' })
  } else {
    lastYank = { hash: commit.Hash, at: now }
    void copy(commit.Hash)
  }
  return true
}
// Also allow pointer hovering when the page body owns keyboard focus. Other
// panes and editable controls keep ownership of their keyboard shortcuts.
function onHoverKey(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  if (hoveredCommit.value && (event.target === document.body || event.target === window)) yankCommit(event)
}
watch([selectedHash, hoveredCommit], () => { lastYank = null })

// Ref action palette (combo 02 + 06): `r` opens the verbs for the refs on the
// selected commit; the inline cluster badge opens it by click.
function onKey(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) return
  if (yankCommit(event)) return
  if (!vim.search.active.value && !event.ctrlKey && !event.metaKey && !event.altKey) {
    showCommitRefs.value = event.shiftKey || event.key === 'Shift'
    if (event.key === 'Shift') {
      keyboardNavigation.value = true
      return
    }
  }
  if (!vim.search.active.value && !isModified(event) && event.key === 'Enter') {
    event.preventDefault()
    if (!event.repeat && selected.value) {
      emit('navigate', selected.value.Hash === '__ichi_working_changes__' ? 'status' : 'diff',
        selected.value.Hash === '__ichi_working_changes__' ? '' : selected.value.Hash)
    }
    return
  }
  if (!vim.search.active.value && !isModified(event) && !event.shiftKey && ['Tab', 'l', 'ArrowRight'].includes(event.key) && selected.value) {
    if (!detailVisible.value) settings['graph.detailPosition'] = 'right'
    void nextTick(() => detailPane.value?.focusFiles())
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
  if (vim.handleKey(event)) {
    keyboardNavigation.value = true
    event.preventDefault()
  }
}

async function scrollToCursor() {
  const index = vim.cursor.value
  const focused = document.activeElement
  const ownsFocus = focused === listEl.value ||
    (focused?.matches('.commit-row') && listEl.value?.contains(focused))
  scrollToRow(index)
  await nextTick()
  if (disposed || index !== vim.cursor.value) return
  const row = listEl.value?.querySelector<HTMLElement>(`[data-row-index="${index}"]`)
  // A new pane may have taken focus while the virtual slice mounted.
  if (ownsFocus && (document.activeElement === focused || document.activeElement === listEl.value || document.activeElement === document.body)) {
    row?.focus({ preventScroll: true })
  }
}
watch(rowHeight, () => { void scrollToCursor() }, { flush: 'post' })

watch(
  () => vim.cursor.value,
  () => {
    const row = graphRows.value[vim.cursor.value]
    if (row) selectedHash.value = row.Commit.Hash
    void scrollToCursor()
  },
)

watch(
  () => [settings['graph.limit'], settings['graph.showStashes']],
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
    notify({ tone: 'success', title: 'Copied to clipboard', message: text })
  } catch {
    notify({ tone: 'danger', title: 'Unable to copy to clipboard' })
  }
}

const { busy: activeOperations, run: runOperation } = useGitOperation({
  refresh: loadGraph,
  blocked: () => graphRefreshing.value,
  invalidate: invalidateNavigationSnapshots,
})
useRepoSwitchGuard(() => activeOperations.value ? 'Wait for the Git operation to finish.' : '')
async function runRef(fn: () => Promise<void>) {
  await runOperation(fn, { success: 'Operation complete', rethrow: true })
}

function openOperation(request: OperationConfirmRequest) {
  pendingOperation.value = request
}

async function pushCurrentBranch(values?: Record<string, string>) {
  await runOperation(async () => {
    const remote = values?.remote?.trim()
    const branch = values?.branch?.trim()
    if (remote && branch) await RemoteService.PushSetUpstream(remote, branch)
    else await RemoteService.Push()
  }, {
    success: { title: 'Push complete', message: repo.value?.Branch ? `Pushed ${repo.value.Branch}` : undefined },
    failure: 'Push failed',
    rethrow: true,
  })
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
  if (commit.IsStash) {
    items.push({ separator: true }, ...stashMenuItems(commit))
  } else if (commit.Hash !== '__ichi_working_changes__') {
    items.push(
      { separator: true },
      ...commitRefActions(commit, {
        currentBranch: repo.value?.Branch ?? '',
        laneColorForRef: (name) => {
          const row = graphRows.value.find((row) =>
            row.Commit.Decorations?.some((ref) => ref.Name === name),
          )
          return row
            ? settings['graph.renderStyle'] === 'mono'
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

// ---- working changes and stashes ------------------------------------------

const WORKING_HASH = '__ichi_working_changes__'
const stagedFiles = computed(() => repo.value?.Staged?.Files ?? 0)
const canCommitDraft = computed(() => !!workingDraft.value.trim() && stagedFiles.value > 0)
const commitDraftHint = computed(() =>
  !stagedFiles.value ? 'Stage files in Changes to commit' : !workingDraft.value.trim() ? 'Type a message to commit' : `Commit ${stagedFiles.value} staged ${stagedFiles.value === 1 ? 'file' : 'files'}`,
)
async function commitDraft() {
  const message = workingDraft.value.trim()
  if (!canCommitDraft.value || activeOperations.value) return
  const done = await runOperation(() => WorktreeService.Commit(message), {
    success: { title: 'Commit created', message },
    failure: 'Commit failed',
  })
  if (done) { workingDraft.value = ''; invalidateChangesSnapshots() }
}
async function stashDraft() {
  if (activeOperations.value) return
  const message = workingDraft.value.trim()
  const done = await runOperation(() => StashService.StashPush(message, true), {
    success: { title: 'Stashed changes', message: message || undefined },
    failure: 'Stash failed',
  })
  if (done) { workingDraft.value = ''; invalidateChangesSnapshots() }
}
function setDraft(event: Event) {
  workingDraft.value = (event.target as HTMLInputElement).value
}
function draftKey(event: KeyboardEvent) {
  // The field owns its keys; list navigation must not steal j/k or space.
  event.stopPropagation()
  if (event.key === 'Escape') {
    ;(event.target as HTMLElement).blur()
    listEl.value?.focus()
  } else if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault()
    if (event.altKey) void stashDraft()
    else void commitDraft()
  }
}
function stashIndex(commit: Commit) {
  const match = commit.Refs?.map((ref) => /^stash@\{(\d+)\}$/.exec(ref)).find(Boolean)
  return match ? Number(match[1]) : -1
}
function stashMenuItems(commit: Commit): ContextMenuItem[] {
  const index = stashIndex(commit)
  if (index < 0) return []
  const run = (title: string, operation: () => Promise<void>) => async () => {
    if (await runOperation(operation, { success: title, failure: 'Stash operation failed' })) invalidateChangesSnapshots()
  }
  return [
    { id: 'stash-apply', label: 'Apply stash', icon: PhDownloadSimple, action: run('Stash applied', () => StashService.StashApplyIndex(index)) },
    { id: 'stash-pop', label: 'Pop stash', icon: PhArchive, action: run('Stash popped', () => StashService.StashPopIndex(index)) },
    {
      id: 'stash-drop',
      label: 'Drop stash…',
      icon: PhTrash,
      action: () =>
        openOperation({
          title: 'Drop stash',
          message: `Delete stash@{${index}}. This cannot be undone.`,
          target: commit.Message,
          confirmLabel: 'Drop',
          tone: 'danger',
          icon: PhTrash,
          onConfirm: () => runRef(() => StashService.StashDropIndex(index)),
        }),
    },
  ]
}

type DetailAction = 'branch-here' | 'cherry-pick' | 'stash-apply' | 'stash-pop' | 'stash-drop'
function runDetailAction(id: DetailAction) {
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
async function openRowMenuKey() {
  const commit = selected.value
  if (!commit) return
  await scrollToCursor()
  if (disposed || selected.value?.Hash !== commit.Hash) return
  const rect = listEl.value?.querySelector<HTMLElement>(`[data-row-index="${vim.cursor.value}"]`)?.getBoundingClientRect()
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
    void scrollToCursor()
  } else selectedHash.value = hash
}

watch(
  () => props.focusHash,
  (hash) => {
    if (hash) focusOn(hash)
  },
)

const initialLoadComplete = ref(false)
let initialFocusPending = true
let mountFocus: Element | null = null
watch([listEl, graphRefreshing, initialLoadComplete, () => props.focusBlocked], ([list, refreshing, loaded, blocked]) => {
  if (!initialFocusPending || !list || refreshing || !loaded || blocked) return
  initialFocusPending = false
  // Let a user who moved to another control during loading keep that focus.
  if (document.activeElement === mountFocus || document.activeElement === document.body) {
    list.focus({ preventScroll: true })
  }
}, { flush: 'post' })

onMounted(() => {
  mountFocus = document.activeElement
  window.addEventListener('keydown', onHoverKey)
  window.addEventListener('keyup', releaseCommitRefs)
  window.addEventListener('blur', resetCommitRefs)
  const cached = peekNavigationSnapshot('graph', props.repositoryPath ?? '', settings['graph.limit'])
  if (cached) {
    repo.value = cached.info
    layout.value = cached.layout
    selectedHash.value = cached.selection
    loading.value = false
  }
  void loadGraph().then(() => {
    if (disposed) return
    focusOn(props.focusHash || selectedHash.value)
    initialLoadComplete.value = true
  })
})
onUnmounted(() => {
  window.removeEventListener('keydown', onHoverKey)
  window.removeEventListener('keyup', releaseCommitRefs)
  window.removeEventListener('blur', resetCommitRefs)
})
</script>

<template>
  <div class="graph-view">
    <Teleport defer to="#view-header-context">
      <span v-if="repo" class="header-sync" aria-label="Branch sync status"
        ><span class="sync-ahead">↑{{ repo.Ahead }}</span> ahead
        <span>↓{{ repo.Behind }}</span> behind</span
      >
      <UiButton size="sm" title="Push current branch" :disabled="graphRefreshing || activeOperations" @click="openPushConfirm">
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
      :inert="graphRefreshing || undefined"
      :aria-busy="graphRefreshing"
      :style="{ '--detail-width': `${settings['graph.detailWidth']}px` }"
      :class="[`detail-${settings['graph.detailPosition']}`, { 'detail-hidden': !detailVisible }]"
    >
      <span v-if="graphRefreshing" role="status" style="position: absolute; z-index: 8; background: var(--surface-panel); padding: 4px 8px">Checking latest history…</span>
      <section
        ref="listEl"
        class="commit-list"
        :class="[
          `density-${settings['graph.rowDensity']}`,
          { 'no-author-column': !settings['graph.showAuthor'] },
          { 'keyboard-navigation': keyboardNavigation },
        ]"
        :style="{ '--graph-row-height': `${rowHeight}px` }"
        aria-label="Commit graph"
        data-keyboard-pane
        tabindex="0"
        @keydown="onKey"
        @focusout="onGraphFocusOut"
        @pointermove="keyboardNavigation = false"
        @pointerdown="keyboardNavigation = false"
        @focusin="setModeline({ mode: 'GRAPH', hints: 'j/k commit · Enter diff · Tab files · y SHA · yy branch · r refs · / search' })"
      >
        <div class="commit-table">
          <div ref="headerEl" class="commit-table-head">
            <span class="th-refs">Refs</span>
            <span>Graph</span>
            <span class="th-subject">Subject</span>
            <span class="th-hash">Hash</span>
            <span v-if="settings['graph.showAuthor']" class="th-author">Author</span>
            <span>Date</span>
          </div>
          <div ref="canvasEl" class="commit-list-canvas" :style="{ height: `${virtualWindow.totalHeight}px` }">
            <GraphSvg :segments="layout?.Segments" :rows="visibleRows" :start-index="virtualWindow.start" :total-rows="graphRows.length" :lane-count="laneCount" :viewport-width="laneViewportWidth" :scroll-offset="laneScrollOffset" show-ref-connections />
            <component
              :is="row.Commit.Hash === WORKING_HASH ? 'div' : 'button'"
              v-for="(row, index) in visibleRows"
              :key="row.Commit.Hash"
              class="commit-row"
              :data-commit-hash="row.Commit.Hash"
              :data-row-index="virtualWindow.start + index"
              :tabindex="isSelected(row, virtualWindow.start + index) ? 0 : -1"
              :style="{
                position: 'absolute',
                top: `${(virtualWindow.start + index) * rowHeight}px`,
                '--row-lane':
                  settings['graph.renderStyle'] === 'mono'
                    ? 'var(--accent)'
                    : `var(${rowLaneColorVar(row)})`,
              }"
              :class="{ selected: isSelected(row, virtualWindow.start + index), merge: row.Commit.IsMerge, working: row.Commit.Hash === WORKING_HASH, stash: row.Commit.IsStash }"
              :type="row.Commit.Hash === WORKING_HASH ? undefined : 'button'"
              :role="row.Commit.Hash === WORKING_HASH ? 'button' : undefined"
              @click="selectCommit(row.Commit)"
              @pointerenter="hoveredCommit = row.Commit.Hash; keyboardNavigation = false"
              @pointerleave="hoveredCommit = ''"
              @contextmenu.prevent="openRowMenu($event, row.Commit)"
            >
              <span class="commit-refs">
                <RefCluster
                  v-if="row.Commit.Decorations?.length"
                  :decorations="row.Commit.Decorations"
                  :expanded="showCommitRefs && isSelected(row, virtualWindow.start + index)"
                  :row-hovered="hoveredCommit === row.Commit.Hash"
                  :hover-enabled="!keyboardNavigation"
                  @click.stop="openRowMenu($event, row.Commit)"
                />
                <RefLabel
                  v-else-if="commitBranches.get(row.Commit.Hash)"
                  class="commit-branch-hint"
                  :name="commitBranches.get(row.Commit.Hash)!"
                  kind="branch"
                />
              </span>
              <span class="commit-rail" aria-hidden="true" @wheel="wheelLanes" />
              <span class="commit-main">
                <template v-if="row.Commit.Hash === WORKING_HASH">
                  <input
                    class="wip-input"
                    type="text"
                    :value="workingDraft"
                    placeholder="Name these changes to commit or stash"
                    aria-label="Commit or stash message"
                    spellcheck="false"
                    autocomplete="off"
                    @input="setDraft"
                    @keydown="draftKey"
                  />
                  <span class="wip-actions">
                    <button type="button" class="wip-action" :disabled="!canCommitDraft || activeOperations" :title="`${commitDraftHint} (Enter)`" @click.stop="commitDraft">Commit</button>
                    <button type="button" class="wip-action" :disabled="activeOperations" title="Stash all changes, including untracked files (Alt+Enter)" @click.stop="stashDraft">Stash</button>
                  </span>
                </template>
                <span v-else class="commit-subject">{{ row.Commit.Message }}</span>
              </span>
              <span class="commit-hash">{{ row.Commit.ShortHash }}</span>
              <span v-if="settings['graph.showAuthor']" class="commit-table-author author-identity"><AuthorAvatar v-if="!settings['graph.authorAvatars'] && row.Commit.Hash !== '__ichi_working_changes__'" :name="row.Commit.Author" :commit="row.Commit.Hash" :size="rowHeight - 10" /><span class="author-name">{{ row.Commit.Author }}</span></span>
              <span class="commit-table-date">{{ formatDate(row.Commit.Date) }}</span>
            </component>
          </div>
          <div ref="footerEl" class="graph-lane-footer" :class="{ 'no-overflow': !lanesOverflow }" :inert="!lanesOverflow || undefined" :aria-hidden="!lanesOverflow || undefined">
            <div ref="laneScroller" class="graph-lane-scroll" tabindex="0" aria-label="Scroll graph lanes horizontally" @scroll="scrollLanes" @keydown.stop>
              <div :style="{ width: `${railWidth}px` }" />
            </div>
          </div>
        </div>
      </section>

      <CommitDetailPanel
        ref="detailPane"
        v-if="detailVisible && selected"
        :commit="selected"
        :detail="commitDetail"
        :metadata="commitMetadata"
        :metadata-loading="metadataLoading"
        :metadata-error="metadataError"
        @metadata-tab="metadataTab"
        @retry-metadata="loadMetadata"
        :loading="detailLoading"
        :error="detailError"
        :repo="repo"
        :working-entries="workingEntries"
        :working-deltas="workingDeltas"
        @retry="loadCommitDetail(selectedHash)"
        @copy="copy"
        @parent="focusOn"
        @navigate="(view, focus, file) => emit('navigate', view, focus, file)"
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
