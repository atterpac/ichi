<script setup lang="ts">
import { useRepoSwitchGuard } from '../../composables/useRepoSwitchGuard'
// Stash surface — a ranger list of saved worktree snapshots. The detail pane is a
// navigable file list (parsed numstat, not raw diff): step into it with `l`, select
// files with space, and restore just those into the worktree with `a` — a partial
// apply that leaves the rest of the stash intact.
import { isEditable, isModified, returnFromPane } from '../../composables/keyboard'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { PhArchive, PhStack } from '@phosphor-icons/vue'
import OperationConfirmModal, {
  type OperationConfirmRequest,
} from '../overlays/OperationConfirmModal.vue'
import SurfaceState from '../common/SurfaceState.vue'
import UiButton from '../common/UiButton.vue'
import FileHeatmap from '../common/FileHeatmap.vue'
import { setModeline, resetModeline } from '../../composables/useModeline'
import { useShellSettings } from '../../composables/useShellSettings'
import { notify } from '../../composables/useToasts'
import { useVimList } from '../../composables/useVimList'
import { StashService } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import type { FileChurn, Stash } from '../../bindings/github.com/atterpac/ichi/internal/git'

const settings = useShellSettings()

const loading = ref(true)
const error = ref('')
const busy = ref(false)
useRepoSwitchGuard(() => busy.value ? 'Wait for the Git operation to finish.' : '')
const stashes = ref<Stash[]>([])
const pendingOperation = ref<OperationConfirmRequest | null>(null)
const listEl = ref<HTMLElement | null>(null)

// Detail pane: file chips + a second cursor + a selection set. Focus never leaves
// the list element (so it keeps receiving keys); `focusPane` just routes them.
const files = ref<FileChurn[]>([])
const filesLoading = ref(false)
const fileCursor = ref(0)
const selected = ref(new Set<string>())
const focusPane = ref<'stashes' | 'files'>('stashes')

async function refresh() {
  try {
    stashes.value = (await StashService.ListStashes()) ?? []
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
    notify({
      tone: 'danger',
      title: `${label} failed`,
      message: err instanceof Error ? err.message : String(err),
    })
  } finally {
    busy.value = false
  }
}

function apply(s: Stash) {
  void run(`Applied stash@{${s.Index}}`, () => StashService.StashApplyIndex(s.Index))
}

function pop(s: Stash) {
  void run(`Popped stash@{${s.Index}}`, () => StashService.StashPopIndex(s.Index))
}

function drop(s: Stash) {
  pendingOperation.value = {
    title: 'Drop stash',
    message: `Discard stash@{${s.Index}} — “${s.Message}”. This cannot be undone.`,
    confirmLabel: 'Drop',
    target: `stash@{${s.Index}}`,
    tone: 'danger',
    onConfirm: () => run(`Dropped stash@{${s.Index}}`, () => StashService.StashDropIndex(s.Index)),
  }
}

function branchFrom(s: Stash) {
  pendingOperation.value = {
    title: 'Branch from stash',
    message: `Create a branch at the parent of stash@{${s.Index}}, apply the stash onto it, and drop it.`,
    confirmLabel: 'Create branch',
    target: `stash@{${s.Index}}`,
    icon: PhStack,
    inputs: [
      {
        id: 'name',
        label: 'Branch name',
        placeholder: 'fix/…',
        required: true,
        pattern: '^[^\\s]+$',
      },
    ],
    onConfirm: ({ name }) =>
      run(`Branched to ${name}`, () => StashService.StashBranch(name!, s.Index)),
  }
}

function stashWorktree() {
  pendingOperation.value = {
    title: 'Stash changes',
    message: 'Save the current worktree (including untracked files) as a new stash.',
    confirmLabel: 'Stash',
    icon: PhArchive,
    inputs: [{ id: 'message', label: 'Message', placeholder: 'optional' }],
    onConfirm: ({ message }) =>
      run('Stashed changes', () => StashService.StashPush(message ?? '', true)),
  }
}

function clearAll() {
  pendingOperation.value = {
    title: 'Clear all stashes',
    message: `Discard all ${stashes.value.length} stashes. This cannot be undone.`,
    confirmLabel: 'Clear all',
    tone: 'danger',
    onConfirm: () => run('Cleared all stashes', () => StashService.StashClear()),
  }
}

const vim = useVimList(stashes, {
  autoListen: false,
  text: (s) => s.Message,
  onAction: (action, { items }) => {
    const s = items[0]
    if (!s) return
    if (action === 'open') apply(s)
    if (action === 'delete') drop(s)
  },
})

const current = computed<Stash | null>(() => stashes.value[vim.cursor.value] ?? null)
const cursorFile = computed<FileChurn | null>(() => files.value[fileCursor.value] ?? null)

// Restore selected files (or the cursor file when nothing is ticked) into the
// worktree. This is a partial apply: the stash stays put for the remaining files.
function applyFiles(s: Stash) {
  const paths = selected.value.size
    ? [...selected.value]
    : cursorFile.value
      ? [cursorFile.value.Path]
      : []
  if (!paths.length) return
  const label = paths.length === 1 ? paths[0]!.split('/').pop() : `${paths.length} files`
  void run(`Restored ${label} from stash@{${s.Index}}`, async () => {
    await StashService.StashCheckoutFiles(s.Index, paths)
    selected.value = new Set()
  })
}

function toggleSelect(path: string) {
  const next = new Set(selected.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  selected.value = next
}

const heatFiles = computed(() =>
  files.value.map((file) => ({
    path: file.Path,
    added: file.Added,
    removed: file.Deleted,
    known: file.Added + file.Deleted > 0,
  })),
)
async function selectHeatFile(path: string) {
  fileCursor.value = files.value.findIndex((file) => file.Path === path)
  enterFiles()
  await nextTick()
  document
    .getElementById(`stash-heat-file-${fileCursor.value}`)
    ?.scrollIntoView({ block: 'nearest' })
}
function clickFile(index: number, path: string) {
  enterFiles()
  fileCursor.value = index
  toggleSelect(path)
}
function enterFiles() {
  if (!current.value) return
  settings.stashesDetailVisible = true
  focusPane.value = 'files'
  void nextTick(() => document.querySelector<HTMLElement>('[aria-label="Stash details"]')?.focus())
}
function leaveFiles() {
  focusPane.value = 'stashes'
  listEl.value?.focus()
}

// One request id guards the numstat fetch so a fast cursor never renders stale files.
let detailReq = 0
watch(
  [() => settings.stashesDetailVisible, () => current.value?.Index],
  async ([open, index]) => {
    const req = ++detailReq
    filesLoading.value = false
    files.value = []
    focusPane.value = 'stashes'
    fileCursor.value = 0
    selected.value = new Set()
    if (!open || index == null) {
      files.value = []
      return
    }
    filesLoading.value = true
    const churn = await StashService.StashFiles(index).catch(() => [])
    if (req !== detailReq) return
    files.value = (churn ?? []).filter(Boolean)
    filesLoading.value = false
  },
  { immediate: true },
)

watch(fileCursor, () => void nextTick(() => document.getElementById(`stash-heat-file-${fileCursor.value}`)?.scrollIntoView?.({ block: 'nearest' })))
function onFileKey(event: KeyboardEvent): boolean {
  const s = current.value
  switch (event.key) {
    case 'j':
    case 'ArrowDown':
      if (files.value.length)
        fileCursor.value = Math.min(files.value.length - 1, fileCursor.value + 1)
      return true
    case 'k':
    case 'ArrowUp':
      fileCursor.value = Math.max(0, fileCursor.value - 1)
      return true
    case ' ':
      if (cursorFile.value) {
        toggleSelect(cursorFile.value.Path)
        if (fileCursor.value < files.value.length - 1) fileCursor.value++
      }
      return true
    case 'a':
      if (s) applyFiles(s)
      return true
    case 'Enter':
      if (s && cursorFile.value) {
        selected.value = new Set()
        applyFiles(s)
      }
      return true
    case 'h':
    case 'Escape':
    case 'ArrowLeft':
      leaveFiles()
      return true
  }
  return false
}

function onDetailsKey(event: KeyboardEvent) {
  if (event.defaultPrevented || isEditable(event.target) || isModified(event)) return
  if (event.target instanceof HTMLElement && event.target.closest('.bd-actions, .file-heatmap')) { returnFromPane(event, listEl.value); return }
  focusPane.value = 'files'
  if (onFileKey(event)) event.preventDefault()
}
function onListKey(event: KeyboardEvent) {
  if (event.defaultPrevented || isEditable(event.target)) return
  if (isModified(event)) { if (vim.handleKey(event)) event.preventDefault(); return }
  if (pendingOperation.value) return
  if (vim.search.active.value) {
    if (vim.handleKey(event)) event.preventDefault()
    return
  }

  if (focusPane.value === 'files') {
    if (onFileKey(event)) event.preventDefault()
    return
  }

  if (event.key === 'Escape' && vim.mode.value === 'normal') return
  // 'g' belongs to global nav (graph) — let it bubble. G still jumps to bottom.
  if (event.key === 'g' && !event.ctrlKey && !event.metaKey && !event.altKey) return

  const s = current.value
  switch (event.key) {
    case 'i':
      settings.stashesDetailVisible = !settings.stashesDetailVisible
      event.preventDefault()
      return
    case 'l':
    case 'ArrowRight':
      enterFiles()
      event.preventDefault()
      return
    case 'p':
      if (s) pop(s)
      event.preventDefault()
      return
    case 'd':
      if (s) drop(s)
      event.preventDefault()
      return
    case 'b':
      if (s) branchFrom(s)
      event.preventDefault()
      return
    case 'n':
      stashWorktree()
      event.preventDefault()
      return
    case 'x':
      if (stashes.value.length) clearAll()
      event.preventDefault()
      return
  }
  if (vim.handleKey(event)) event.preventDefault()
}

// Hints track which pane owns the keyboard.
watch(focusPane, (pane) => {
  setModeline({
    mode: 'NORMAL',
    hints:
      pane === 'files'
        ? 'j/k file · ␣ select · a restore selected · ⏎ restore file · h back'
        : '⏎ apply · l files · p pop · b branch · n stash · d drop · x clear · i inspector · F6 pane · / search',
  })
})

function scrollToCursor() {
  const items = listEl.value?.querySelectorAll<HTMLElement>('.branch-row')
  items?.[vim.cursor.value]?.scrollIntoView?.({ block: 'nearest' })
}
watch(vim.cursor, () => nextTick(scrollToCursor))

const churnTotal = computed(() => {
  const total = { files: files.value.length, added: 0, deleted: 0 }
  for (const f of files.value) {
    total.added += f.Added
    total.deleted += f.Deleted
  }
  return total
})

onMounted(async () => {
  setModeline({
    mode: 'NORMAL',
    hints: '⏎ apply · l files · p pop · b branch · n stash · d drop · x clear · i inspector · F6 pane · / search',
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
      <span class="header-meta"
        >{{ stashes.length }} stash{{ stashes.length === 1 ? '' : 'es' }}</span
      >
      <UiButton size="sm" title="Stash worktree (n)" :disabled="busy" @click="stashWorktree">
        <PhArchive :size="16" weight="bold" />
        Stash
      </UiButton>
    </Teleport>

    <SurfaceState
      v-if="loading"
      tone="loading"
      title="Loading stashes"
      message="Reading saved worktree snapshots."
    />
    <SurfaceState
      v-else-if="error"
      tone="error"
      title="Unable to load stashes"
      :message="error"
      action-label="Retry"
      @action="refresh"
    />
    <SurfaceState
      v-else-if="!stashes.length"
      title="No saved work"
      message="Stash the current worktree when you need to switch context without committing."
      action-label="Stash worktree"
      @action="stashWorktree"
    />

    <div v-else class="branches-body" :class="{ 'detail-open': settings.stashesDetailVisible }">
      <section
        ref="listEl"
        class="branches-list"
        :class="{ dimmed: focusPane === 'files' }"
        tabindex="0"
        aria-label="Stashes"
        @keydown="onListKey" data-keyboard-pane @focusin="focusPane = 'stashes'"
      >
        <div v-if="vim.search.active.value" class="vim-cmdline">
          /{{ vim.search.query.value }}<span class="vim-caret">▌</span>
        </div>

        <p v-if="!stashes.length" class="bd-empty">
          No stashes — press n to save the current worktree.
        </p>

        <button
          v-for="(s, i) in stashes"
          :key="s.Index"
          type="button"
          class="branch-row"
          :class="{ selected: vim.cursor.value === i }" :tabindex="vim.cursor.value === i ? 0 : -1"
          @click="vim.moveTo(i)"
          @dblclick="apply(s)"
        >
          <span class="stash-idx">{{ s.Index }}</span>
          <span class="branch-name">{{ s.Message }}</span>
          <span class="branch-fill"></span>
          <span v-if="s.Branch" class="stash-branch">on {{ s.Branch }}</span>
        </button>
      </section>

      <aside
        v-if="settings.stashesDetailVisible"
        class="branch-detail"
        :class="{ 'pane-active': focusPane === 'files' }"
        aria-label="Stash details" tabindex="0" data-keyboard-pane @keydown="onDetailsKey" @focusin="focusPane = 'files'"
      >
        <template v-if="current">
          <h3 class="bd-name">stash@{{ '{' }}{{ current.Index }}{{ '}' }}</h3>
          <dl class="bd-meta">
            <div>
              <dt>Message</dt>
              <dd>{{ current.Message }}</dd>
            </div>
            <div v-if="current.Branch">
              <dt>Origin</dt>
              <dd>{{ current.Branch }}</dd>
            </div>
          </dl>

          <FileHeatmap
            v-if="!filesLoading"
            :files="heatFiles"
            :selected-path="cursorFile?.Path"
            @select="selectHeatFile"
          />
          <div class="bd-subhead-row">
            <span class="bd-subhead">Files</span>
            <span v-if="selected.size" class="st-selcount">{{ selected.size }} selected</span>
          </div>

          <p v-if="filesLoading" class="bd-empty">Loading files…</p>
          <p v-else-if="!files.length" class="bd-empty">No files</p>
          <div v-else class="st-files" @click="enterFiles">
            <button
              v-for="(f, i) in files"
              :key="f.Path"
              type="button"
              class="st-file"
              :id="`stash-heat-file-${i}`"
              :class="{
                cursor: focusPane === 'files' && fileCursor === i,
                on: selected.has(f.Path),
              }"
              @click.stop="clickFile(i, f.Path)"
            >
              <span class="st-file-tick">{{ selected.has(f.Path) ? '◉' : '○' }}</span>
              <span class="st-file-path">{{ f.Path }}</span>
              <span class="st-file-delta">
                <em v-if="f.Added" class="add">+{{ f.Added }}</em>
                <em v-if="f.Deleted" class="del">−{{ f.Deleted }}</em>
              </span>
            </button>
            <span class="bd-churn-total"
              >{{ churnTotal.files }} files · +{{ churnTotal.added }} −{{
                churnTotal.deleted
              }}</span
            >
          </div>

          <div class="bd-actions">
            <UiButton size="sm" variant="primary" @click="apply(current)"
              ><kbd>↵</kbd> Apply all</UiButton
            >
            <UiButton size="sm" :disabled="!files.length" @click="applyFiles(current)">
              <kbd>a</kbd> Restore {{ selected.size ? `${selected.size} selected` : 'file' }}
            </UiButton>
            <UiButton size="sm" @click="pop(current)"><kbd>p</kbd> Pop</UiButton>
            <UiButton size="sm" variant="danger" @click="drop(current)"><kbd>d</kbd> Drop</UiButton>
          </div>
        </template>
        <p v-else class="bd-empty">Select a stash</p>
      </aside>
    </div>

    <OperationConfirmModal
      v-if="pendingOperation"
      :request="pendingOperation"
      @close="pendingOperation = null"
    />
  </div>
</template>
