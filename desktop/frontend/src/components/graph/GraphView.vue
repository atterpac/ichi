<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import GraphCanvas from './GraphCanvas.vue'
import ContextMenu, { type ContextMenuItem } from '../overlays/ContextMenu.vue'
import OperationConfirmModal, { type OperationConfirmRequest } from '../overlays/OperationConfirmModal.vue'
import { useShellSettings } from '../../composables/useShellSettings'
import { notify } from '../../composables/useToasts'
import { useVimList } from '../../composables/useVimList'
import {
  GraphService,
  RefService,
  RemoteService,
  RepoService,
  type GraphLayout,
  type GraphLayoutRow,
  type RepoInfo,
} from '../../bindings/github.com/atterpac/ichi/desktop/services'
import { PhArrowLineUp, PhCheck, PhCopy, PhCherries, PhGitBranch, PhGitMerge, PhTag } from '@phosphor-icons/vue'
import { FileStatus, type ChangedFile, type Commit, type CommitDetail } from '../../bindings/github.com/atterpac/ichi/internal/git'

const loading = ref(true)
const error = ref('')
const repo = ref<RepoInfo | null>(null)
const layout = ref<GraphLayout | null>(null)
const selectedHash = ref('')
const commitDetail = ref<CommitDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
const settings = useShellSettings()
const pendingOperation = ref<OperationConfirmRequest | null>(null)

const graphRows = computed(() =>
  (layout.value?.Rows ?? []).filter((row): row is GraphLayoutRow & { Commit: Commit } => row.Commit !== null),
)
const laneCount = computed(() => Math.max(layout.value?.LaneCount ?? 1, 1))
const railWidth = computed(() => laneCount.value * 3 * 12 + 16)
const detailVisible = computed(() => settings.graphDetailPosition !== 'hidden')
const detailHash = computed(() => {
  if (!selected.value) return ''
  return settings.graphDetailHash === 'short' ? selected.value.ShortHash : selected.value.Hash
})

const selected = computed(
  () => graphRows.value.find((row) => row.Commit.Hash === selectedHash.value)?.Commit ?? graphRows.value[0]?.Commit,
)
const isWorkingChangesSelected = computed(() => selected.value?.Hash === '__ichi_working_changes__')
const selectedStats = computed(() => commitDetail.value?.Stats)
const shownFiles = computed(() => commitDetail.value?.Files.slice(0, detailFileLimit.value) ?? [])
const commitBody = computed(() => {
  const body = commitDetail.value?.Body.trim() ?? ''
  const subject = commitDetail.value?.Subject.trim() ?? selected.value?.Message.trim() ?? ''
  if (!body || body === subject) return ''
  return body.startsWith(subject) ? body.slice(subject.length).trim() : body
})
const detailFileLimit = computed(() => 10)

const pills = computed(() => {
  if (!repo.value) return ['loading']
  const status = repo.value.HasUncommitted ? 'dirty' : 'clean'
  return [
    repo.value.Branch || 'detached',
    `${repo.value.Ahead} ahead`,
    `${repo.value.Behind} behind`,
    status,
  ]
})

async function loadGraph() {
  loading.value = true
  error.value = ''
  try {
    repo.value = await RepoService.Info()
    layout.value = await GraphService.LoadGraphLayout(settings.graphLimit)
    selectedHash.value = graphRows.value[0]?.Commit.Hash ?? ''
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

function formatDetailDate(value: unknown) {
  if (!value) return ''
  const date = new Date(value as string)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function formatSigned(value: number) {
  return new Intl.NumberFormat(undefined, { signDisplay: 'always' }).format(value)
}

function fileStatusLabel(status: FileStatus) {
  switch (status) {
    case FileStatus.FileAdded:
      return 'A'
    case FileStatus.FileDeleted:
      return 'D'
    case FileStatus.FileRenamed:
      return 'R'
    case FileStatus.FileCopied:
      return 'C'
    case FileStatus.FileUntracked:
      return '?'
    case FileStatus.FileConflict:
      return '!'
    case FileStatus.FileModified:
    default:
      return 'M'
  }
}

async function loadCommitDetail(hash: string) {
  if (!hash || hash === '__ichi_working_changes__') {
    commitDetail.value = null
    detailError.value = ''
    detailLoading.value = false
    return
  }

  const requestHash = hash
  detailLoading.value = true
  detailError.value = ''
  commitDetail.value = null
  try {
    const detail = await GraphService.LoadCommit(requestHash)
    if (selectedHash.value === requestHash) commitDetail.value = detail
  } catch (err) {
    if (selectedHash.value === requestHash) {
      commitDetail.value = null
      detailError.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    if (selectedHash.value === requestHash) detailLoading.value = false
  }
}

// vim-style keyboard navigation over the commit list. Cursor == selection.
const listEl = ref<HTMLElement | null>(null)
const vim = useVimList(graphRows, {
  autoListen: false, // scoped to the list's focus, not the window
  text: (row) => `${row.Commit.Message} ${row.Commit.Author} ${row.Commit.ShortHash} ${row.Commit.Refs.join(' ')}`,
  onAction(action, payload) {
    const row = payload.items[0]
    if (action === 'open' && row) selectCommit(row.Commit)
  },
})

function onKey(event: KeyboardEvent) {
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
  if (index >= 0) vim.moveTo(index)
  else selectedHash.value = commit.Hash
}

function isSelected(row: GraphLayoutRow & { Commit: Commit }, index: number) {
  return index === vim.cursor.value || row.Commit.Hash === selectedHash.value || (!selectedHash.value && index === 0)
}

// right-click context menu over commit rows.
const menu = ref<InstanceType<typeof ContextMenu> | null>(null)

async function copy(text: string) {
  try {
    await navigator.clipboard?.writeText(text)
  } catch {
    /* clipboard unavailable */
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

function refBranch(commit: Commit) {
  if (commit.Branch) return commit.Branch
  return commit.Refs.find((ref) => !ref.startsWith('tag:') && !ref.startsWith('origin/') && !ref.includes('/')) ?? ''
}

async function pushCurrentBranch(values?: Record<string, string>) {
  try {
    const remote = values?.remote?.trim()
    const branch = values?.branch?.trim()
    if (remote && branch) await RemoteService.PushSetUpstream(remote, branch)
    else await RemoteService.Push()
    await loadGraph()
    notify({ tone: 'success', title: 'Push complete', message: repo.value?.Branch ? `Pushed ${repo.value.Branch}` : undefined })
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
      { label: 'Ahead', value: `${repo.value?.Ahead ?? 0} commit${repo.value?.Ahead === 1 ? '' : 's'}` },
      { label: 'Behind', value: `${repo.value?.Behind ?? 0} commit${repo.value?.Behind === 1 ? '' : 's'}` },
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

function openRowMenu(event: MouseEvent, commit: Commit) {
  selectCommit(commit)
  const mergeBranch = refBranch(commit)
  const items: ContextMenuItem[] = [
    { id: 'copy-sha', label: 'Copy SHA', icon: PhCopy, action: () => copy(commit.Hash) },
    { id: 'copy-short', label: 'Copy short SHA', icon: PhCopy, action: () => copy(commit.ShortHash) },
    { id: 'copy-msg', label: 'Copy message', icon: PhCopy, action: () => copy(commit.Message) },
  ]
  if (commit.Hash !== '__ichi_working_changes__') {
    items.push(
      { separator: true },
      { id: 'checkout', label: 'Checkout', icon: PhCheck, action: () => runRef(() => RefService.Checkout(commit.Hash)) },
      {
        id: 'branch',
        label: 'Create branch here…',
        icon: PhGitBranch,
        action: () => openOperation({
          title: 'Create branch here?',
          message: 'Create a new local branch at the selected commit.',
          confirmLabel: 'Create branch',
          target: `${commit.ShortHash} ${commit.Message}`,
          inputs: [{ id: 'name', label: 'Branch name', placeholder: 'feature/name', required: true, pattern: '^[^\\s]+$' }],
          icon: PhGitBranch,
          onConfirm: (values) => runRef(() => RefService.CreateBranchAt((values.name ?? '').trim(), commit.Hash)),
        }),
      },
      {
        id: 'cherry',
        label: 'Cherry-pick',
        icon: PhCherries,
        action: () => openOperation({
          title: 'Cherry-pick this commit?',
          message: 'Apply the selected commit on top of the current branch.',
          confirmLabel: 'Cherry-pick',
          target: `${commit.ShortHash} ${commit.Message}`,
          details: [
            { label: 'Author', value: commit.Author },
            { label: 'Current', value: repo.value?.Branch || 'detached HEAD' },
          ],
          icon: PhCherries,
          tone: 'warning',
          onConfirm: () => runRef(() => RefService.CherryPick(commit.Hash)),
        }),
      },
      {
        id: 'tag',
        label: 'Create tag…',
        icon: PhTag,
        action: () => openOperation({
          title: 'Create tag here?',
          message: 'Create a lightweight tag at the selected commit.',
          confirmLabel: 'Create tag',
          target: `${commit.ShortHash} ${commit.Message}`,
          inputs: [{ id: 'name', label: 'Tag name', placeholder: 'v1.0.0', required: true, pattern: '^[^\\s]+$' }],
          icon: PhTag,
          onConfirm: (values) => runRef(() => RefService.CreateTag((values.name ?? '').trim(), commit.Hash, '')),
        }),
      },
    )
    if (mergeBranch && mergeBranch !== repo.value?.Branch) {
      items.push({
        id: 'merge',
        label: `Merge ${mergeBranch}`,
        icon: PhGitMerge,
        action: () => openOperation({
          title: `Merge ${mergeBranch}?`,
          message: 'Merge this branch into the current branch.',
          confirmLabel: 'Merge branch',
          target: `${mergeBranch} -> ${repo.value?.Branch || 'current branch'}`,
          details: [{ label: 'Commit', value: `${commit.ShortHash} ${commit.Message}` }],
          icon: PhGitMerge,
          tone: 'warning',
          onConfirm: () => runRef(() => RefService.MergeBranch(mergeBranch)),
        }),
      })
    }
  }
  menu.value?.open(event, items)
}

onMounted(() => {
  void loadGraph().then(() => nextTick(() => listEl.value?.focus()))
})
</script>

<template>
  <div class="graph-view">
    <header class="graph-toolbar">
      <div>
        <p class="placeholder-kicker">{{ repo?.Path || 'current repository' }}</p>
        <h2>Commit Graph</h2>
      </div>
      <div class="repo-pills">
        <span v-for="pill in pills" :key="pill">{{ pill }}</span>
        <button class="graph-toolbar-action" type="button" title="Push current branch" @click="openPushConfirm">
          <PhArrowLineUp :size="14" weight="bold" />
          Push
        </button>
      </div>
    </header>

    <div v-if="loading" class="graph-state">Loading graph...</div>
    <div v-else-if="error" class="graph-state error">
      <strong>Unable to load graph</strong>
      <span>{{ error }}</span>
    </div>
    <div
      v-else
      class="graph-grid"
      :class="[`detail-${settings.graphDetailPosition}`, { 'detail-hidden': !detailVisible }]"
    >
      <section
        ref="listEl"
        class="commit-list"
        :class="[
          `density-${settings.graphRowDensity}`,
          { 'no-author-column': !settings.graphShowAuthor },
        ]"
        aria-label="Commit graph"
        tabindex="0"
        @keydown="onKey"
      >
        <div
          v-if="vim.search.active.value || vim.pending.value || vim.count.value"
          class="vim-cmdline"
        >
          <template v-if="vim.search.active.value">/{{ vim.search.query.value }}<span class="vim-caret">▌</span></template>
          <template v-else>{{ vim.count.value }}{{ vim.pending.value }}</template>
        </div>
        <div class="commit-table-head" :style="{ '--rail-width': `${railWidth}px` }">
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
            :class="{ selected: isSelected(row, index), merge: row.Commit.IsMerge }"
            type="button"
            @click="selectCommit(row.Commit)"
            @contextmenu.prevent="openRowMenu($event, row.Commit)"
          >
            <span class="commit-rail" aria-hidden="true" />
            <span class="commit-main">
              <span class="commit-subject">{{ row.Commit.Message }}</span>
            </span>
            <span class="commit-hash">{{ row.Commit.ShortHash }}</span>
            <span v-if="settings.graphShowAuthor" class="commit-table-author">{{ row.Commit.Author }}</span>
            <span class="commit-table-date">{{ formatDate(row.Commit.Date) }}</span>
          </button>
        </div>
      </section>

      <aside v-if="detailVisible" class="commit-detail" :class="`file-chip-${settings.graphFileChipStyle}`">
        <p class="placeholder-kicker">{{ detailHash }}</p>
        <h3>{{ selected?.Message }}</h3>
        <div v-if="detailLoading" class="detail-state">Loading commit details...</div>
        <div v-else-if="detailError" class="detail-state error">{{ detailError }}</div>
        <dl v-if="isWorkingChangesSelected">
          <div>
            <dt>Type</dt>
            <dd>Uncommitted worktree changes</dd>
          </div>
          <div>
            <dt>Files</dt>
            <dd>
              {{ repo?.Staged.Files ?? 0 }} staged,
              {{ repo?.Unstaged.Files ?? 0 }} unstaged,
              {{ repo?.Unstaged.Untracked ?? 0 }} untracked
            </dd>
          </div>
          <div>
            <dt>Diff</dt>
            <dd>
              +{{ (repo?.Staged.Insertions ?? 0) + (repo?.Unstaged.Insertions ?? 0) }}
              -{{ (repo?.Staged.Deletions ?? 0) + (repo?.Unstaged.Deletions ?? 0) }}
            </dd>
          </div>
        </dl>
        <template v-else>
          <div class="detail-content content-review">
            <div v-if="commitBody" class="detail-message">
              <p class="detail-subhead">Message</p>
              <p>{{ commitBody }}</p>
            </div>

            <div v-if="selectedStats" class="detail-stats" aria-label="Commit change summary">
              <span>
                <b>{{ selectedStats.FilesChanged }}</b>
                <small>files</small>
              </span>
              <span>
                <b>+{{ selectedStats.Insertions }}</b>
                <small>added</small>
              </span>
              <span>
                <b>-{{ selectedStats.Deletions }}</b>
                <small>removed</small>
              </span>
            </div>

            <div v-if="shownFiles.length" class="detail-files">
              <p class="detail-subhead">Changed files</p>
              <div v-for="file in shownFiles" :key="`${file.Status}:${file.OldPath}:${file.Path}`" class="detail-file-row">
                <span class="file-status">{{ fileStatusLabel(file.Status) }}</span>
                <span class="file-path">
                  <template v-if="file.OldPath">{{ file.OldPath }} -> </template>{{ file.Path }}
                </span>
                <span class="file-delta">
                  <template v-if="file.Binary">binary</template>
                  <template v-else>
                    <span class="delta-add">{{ formatSigned(file.Insertions) }}</span>
                    <span class="delta-del">{{ formatSigned(file.Deletions > 0 ? -file.Deletions : 0) }}</span>
                  </template>
                </span>
              </div>
              <p v-if="commitDetail && commitDetail.Files.length > shownFiles.length" class="detail-more">
                {{ commitDetail.Files.length - shownFiles.length }} more files
              </p>
            </div>

            <dl>
              <div v-if="settings.graphDetailShowAuthorDate">
                <dt>Author</dt>
                <dd>{{ commitDetail?.Author || selected?.Author }}<template v-if="commitDetail?.AuthorEmail"> &lt;{{ commitDetail.AuthorEmail }}&gt;</template></dd>
              </div>
              <div v-if="settings.graphDetailShowAuthorDate">
                <dt>Date</dt>
                <dd>{{ formatDetailDate(commitDetail?.AuthorDate || selected?.Date) }}</dd>
              </div>
              <div>
                <dt>Hash</dt>
                <dd>{{ detailHash }}</dd>
              </div>
              <div v-if="commitDetail?.Branches.length">
                <dt>Branches</dt>
                <dd>{{ commitDetail.Branches.join(', ') }}</dd>
              </div>
              <div v-if="commitDetail?.GPGStatus.Signed">
                <dt>Signature</dt>
                <dd>{{ commitDetail.GPGStatus.Valid ? 'Valid' : 'Invalid' }}<template v-if="commitDetail.GPGStatus.Signer"> - {{ commitDetail.GPGStatus.Signer }}</template></dd>
              </div>
            </dl>
          </div>
        </template>
      </aside>
    </div>

    <ContextMenu ref="menu" :variant="settings.contextMenuStyle" />
    <OperationConfirmModal
      v-if="pendingOperation"
      :request="pendingOperation"
      @close="pendingOperation = null"
    />
  </div>
</template>
