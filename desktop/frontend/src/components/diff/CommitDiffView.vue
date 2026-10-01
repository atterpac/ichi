<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, shallowRef, watch } from 'vue'
import {
  DiffService,
  GraphService,
  InspectService,
} from '../../bindings/github.com/atterpac/ichi/desktop/services'
import type { CommitDetail } from '../../bindings/github.com/atterpac/ichi/internal/git'
import { isEditable, isModified } from '../../composables/keyboard'
import { resetModeline, setModeline } from '../../composables/useModeline'
import { useVimList } from '../../composables/useVimList'
import { createCommitDetailCache } from '../graph/commitDetailCache'
import { commitFileModel } from '../graph/commitFileModel'
import { useChangeDiff } from '../status/useChangeDiff'
import FileStatusIcon from '../common/FileStatusIcon.vue'
import SurfaceState from '../common/SurfaceState.vue'
import UiButton from '../common/UiButton.vue'
import WindowedList from '../common/WindowedList.vue'
import DiffView from './DiffView.vue'

const props = defineProps<{ focusHash?: string; focusFile?: string; repositoryPath?: string }>()
const emit = defineEmits<{ back: [] }>()
const listPane = ref<HTMLElement | null>(null)
const fileWindow = ref<{ scrollToIndex: (index: number) => void } | null>(null)
const diffPane = ref<HTMLElement | null>(null)
const diffView = ref<InstanceType<typeof DiffView> | null>(null)
const detail = shallowRef<CommitDetail | null>(null)
const loading = ref(true)
const error = ref('')
const files = computed(() => commitFileModel(detail.value).files)
const selectedFile = computed(() => files.value[vim.cursor.value])
const detailCache = createCommitDetailCache(
  (hash) => GraphService.LoadCommit(hash),
  80,
  Infinity,
  () => props.repositoryPath ?? '',
)
let generation = 0
let alive = true
let activeDetail: (Promise<CommitDetail | null> & { cancel?: () => void }) | undefined
let activeContent: (Promise<string> & { cancel?: () => void }) | undefined

const vim = useVimList(files, {
  autoListen: false,
  text: (file) => `${file.Path} ${file.OldPath}`,
  onAction(action) {
    if (action === 'open') void focusDiff()
  },
})
const target = computed(() =>
  selectedFile.value
    ? {
        path: selectedFile.value.Path,
        oldPath: selectedFile.value.OldPath || '',
        staged: false,
        untracked: false,
        conflict: false,
      }
    : undefined,
)
const {
  diff,
  loading: diffLoading,
  error: diffError,
  clear: clearPatches,
  retry,
} = useChangeDiff({
  row: target,
  refreshing: loading,
  running: ref(false),
  showingCached: ref(false),
  statusError: error,
  fetch: (file) => {
    const commit = detail.value!
    const parent = commit.Parents[0]
    // Include both rename paths and compare merges with their first parent.
    if (parent) return DiffService.DiffBetweenFile(parent, commit.Hash, file.path, file.oldPath)
    return DiffService.FileDiff(commit.Hash, file.path).then(
      (patches) => patches.find((patch) => patch?.Path === file.path) ?? null,
    )
  },
})
const textDiff = computed(
  () => !!diff.value && !diff.value.Binary && diff.value.Hunks.some((hunk) => !!hunk?.Lines.length),
)

async function loadCommit() {
  const version = ++generation
  detailCache.cancelPending()
  activeDetail?.cancel?.()
  clearPatches()
  activeContent?.cancel?.()
  detail.value = null
  loading.value = true
  error.value = ''
  try {
    const hash = props.focusHash || 'HEAD'
    // HEAD changes after a commit or checkout; cache only explicit commits.
    const request = hash === 'HEAD' ? GraphService.LoadCommit(hash) : detailCache.get(hash)
    activeDetail = request
    const commit = await request
    if (!alive || version !== generation) return
    if (!commit) throw new Error('Commit details unavailable')
    detail.value = commit
    await nextTick()
    const initial = files.value.findIndex((file) => file.Path === props.focusFile)
    vim.moveTo(Math.max(0, initial))
  } catch (cause) {
    if (alive && version === generation)
      error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (alive && version === generation) {
      loading.value = false
      activeDetail = undefined
      await nextTick()
      if (document.activeElement === document.body) void focusFiles()
    }
  }
}
watch([() => props.focusHash, () => props.repositoryPath], loadCommit, { immediate: true })
watch(
  () => props.focusFile,
  (path) => {
    const index = files.value.findIndex((file) => file.Path === path)
    if (index >= 0) vim.moveTo(index)
  },
)

async function focusFiles() {
  fileWindow.value?.scrollToIndex(vim.cursor.value)
  await nextTick()
  const row = listPane.value?.querySelector<HTMLElement>(`[data-file-index="${vim.cursor.value}"]`)
  if (row) row.focus({ preventScroll: true })
  else listPane.value?.focus()
}
async function focusDiff() {
  await nextTick()
  if (diffView.value) diffView.value.focus()
  else diffPane.value?.focus()
}
watch(
  () => vim.cursor.value,
  async () => {
    activeContent?.cancel?.()
    const focused = document.activeElement
    const ownsFocus = listPane.value?.contains(focused)
    fileWindow.value?.scrollToIndex(vim.cursor.value)
    await nextTick()
    if (
      ownsFocus &&
      (document.activeElement === focused || document.activeElement === document.body)
    )
      void focusFiles()
  },
)
watch(diff, async (patch) => {
  if (!patch) return
  await nextTick()
  if (document.activeElement === diffPane.value) diffView.value?.focus()
})
const loadFileContent = computed(() => {
  if (!detail.value || !selectedFile.value || diff.value?.Deleted || diff.value?.Binary) return null
  const hash = detail.value.Hash
  const path = selectedFile.value.Path
  return async () => {
    activeContent?.cancel?.()
    const request = InspectService.FileContent(hash, path)
    activeContent = request
    try {
      return await request
    } finally {
      if (activeContent === request) activeContent = undefined
    }
  }
})
function onListKey(event: KeyboardEvent) {
  if (event.defaultPrevented || isEditable(event.target) || isModified(event)) return
  if (!vim.search.active.value && ['Tab', 'Enter', 'l', 'ArrowRight'].includes(event.key)) {
    event.preventDefault()
    void focusDiff()
    return
  }
  if (!vim.search.active.value && ['h', 'ArrowLeft', 'Escape'].includes(event.key)) {
    event.preventDefault()
    emit('back')
    return
  }
  if (vim.handleKey(event)) event.preventDefault()
}
function onDiffKey(event: KeyboardEvent) {
  if (event.defaultPrevented || isEditable(event.target) || isModified(event)) return
  if (
    event.key === 'Tab' ||
    (!textDiff.value && ['h', 'ArrowLeft', 'Escape'].includes(event.key))
  ) {
    event.preventDefault()
    void focusFiles()
  }
}
onUnmounted(() => {
  alive = false
  generation++
  detailCache.cancelPending()
  activeDetail?.cancel?.()
  activeContent?.cancel?.()
  resetModeline()
})
</script>

<template>
  <section class="commit-diff-view" aria-label="Commit diff">
    <header class="commit-diff-header">
      <UiButton size="sm" @click="emit('back')">Back</UiButton>
      <code>{{ detail?.ShortHash || focusHash?.slice(0, 7) || 'HEAD' }}</code>
      <strong :title="detail?.Subject">{{ detail?.Subject || 'Commit diff' }}</strong>
      <span v-if="detail" class="commit-comparison">
        {{
          detail.Parents.length > 1
            ? 'First parent'
            : detail.Parents.length
              ? 'Parent'
              : 'Initial commit'
        }}
        <code v-if="detail.Parents.length">{{ detail.Parents[0]?.slice(0, 7) }}</code>
      </span>
    </header>
    <SurfaceState v-if="loading" tone="loading" title="Loading commit" />
    <SurfaceState
      v-else-if="error"
      tone="error"
      title="Unable to load commit"
      :message="error"
      action-label="Retry"
      @action="loadCommit"
    />
    <div v-else class="commit-diff-grid">
      <section
        ref="listPane"
        class="commit-files"
        tabindex="0"
        aria-label="Commit changed files"
        data-keyboard-pane
        @keydown="onListKey"
        @focus.self="focusFiles"
        @focusin="
          setModeline({ mode: 'FILES', hints: 'j/k file · Enter diff · Tab diff · Esc back' })
        "
      >
        <header class="commit-files-heading">
          <h2>
            Changed files <span>{{ files.length }}</span>
          </h2>
          <span v-if="detail?.Stats" class="commit-delta"
            ><span class="delta-add">+{{ detail.Stats.Insertions }}</span
            ><span class="delta-del">−{{ detail.Stats.Deletions }}</span></span
          >
        </header>
        <p v-if="vim.search.active.value" class="commit-file-search" role="status">
          /{{ vim.search.query.value }}
        </p>
        <WindowedList
          ref="fileWindow"
          class="commit-file-list"
          :items="files"
          :row-height="40"
          :key-of="(file) => file.Path"
        >
          <template #default="{ item: file, index }">
            <button
              class="change-row commit-file-row"
              :class="{ selected: index === vim.cursor.value }"
              type="button"
              :data-file-index="index"
              :aria-current="index === vim.cursor.value ? 'true' : undefined"
              :tabindex="index === vim.cursor.value ? 0 : -1"
              :title="file.OldPath ? `${file.OldPath} → ${file.Path}` : file.Path"
              @click="vim.moveTo(index)"
            >
              <FileStatusIcon class="file-status" :status="file.Status" />
              <span class="change-file-label"
                ><span class="change-name">{{ file.Path.split('/').pop() }}</span
                ><span class="change-dir">{{
                  file.OldPath
                    ? `from ${file.OldPath}`
                    : file.Path.includes('/')
                      ? file.Path.slice(0, file.Path.lastIndexOf('/'))
                      : ''
                }}</span></span
              >
              <span v-if="file.Binary" class="commit-binary">binary</span>
              <span v-else class="commit-delta"
                ><span class="delta-add">+{{ file.Insertions }}</span
                ><span class="delta-del">−{{ file.Deletions }}</span></span
              >
            </button>
          </template>
          <template #empty
            ><SurfaceState
              compact
              title="No changed files"
              message="This commit has no changes against its parent."
          /></template>
        </WindowedList>
      </section>
      <section
        ref="diffPane"
        class="commit-patch"
        :tabindex="textDiff ? -1 : 0"
        aria-label="Selected commit file diff"
        :data-keyboard-pane="textDiff ? undefined : ''"
        @keydown="onDiffKey"
        @focusin="
          setModeline({ mode: 'DIFF', hints: 'j/k hunk · t layout · Tab files · Esc files' })
        "
      >
        <header v-if="selectedFile" class="commit-patch-heading">
          <strong>{{ selectedFile.Path }}</strong
          ><small v-if="selectedFile.OldPath">from {{ selectedFile.OldPath }}</small>
        </header>
        <SurfaceState v-if="diffLoading" compact tone="loading" title="Loading diff" />
        <SurfaceState
          v-else-if="diffError"
          compact
          tone="error"
          title="Unable to load diff"
          :message="diffError"
          action-label="Retry"
          @action="retry"
        />
        <SurfaceState
          v-else-if="diff?.Binary"
          compact
          title="Binary file"
          message="This file's contents cannot be displayed as a text diff."
        />
        <DiffView
          v-else-if="textDiff"
          ref="diffView"
          :key="`${detail?.Hash}:${selectedFile?.Path}`"
          :diff="diff"
          read-only
          :load-file-content="loadFileContent"
          @exit="focusFiles"
        />
        <SurfaceState
          v-else
          compact
          :title="selectedFile ? 'No text changes' : 'No file selected'"
        />
      </section>
    </div>
  </section>
</template>

<style scoped>
.commit-diff-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.commit-diff-header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
}
.commit-diff-header > strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.commit-diff-header code {
  color: var(--accent-text);
  font: var(--fs-sm) var(--font-mono);
}
.commit-comparison {
  display: flex;
  gap: var(--space-2);
  color: var(--text-mut);
  font-size: var(--fs-xs);
}
.commit-diff-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(220px, min(330px, 35%)) minmax(0, 1fr);
}
.commit-files,
.commit-patch {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  outline: none;
}
.commit-files {
  border-right: 1px solid var(--border);
}
.commit-files-heading,
.commit-patch-heading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  min-height: 42px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-panel);
}
.commit-files-heading h2 {
  flex: 1;
  font-size: var(--fs-sm);
  margin: 0;
}
.commit-files-heading h2 span {
  color: var(--text-mut);
  margin-left: var(--space-2);
}
.commit-files:focus-within .commit-files-heading,
.commit-patch:focus-within .commit-patch-heading {
  color: var(--accent-text);
  background: color-mix(in oklab, var(--accent) 7%, var(--surface-panel));
}
.commit-file-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--space-2);
  overscroll-behavior: contain;
}
.commit-file-row {
  height: 40px;
  min-height: 40px;
  max-height: 40px;
  padding: var(--space-2);
  gap: var(--space-2);
}
.commit-delta {
  display: flex;
  gap: var(--space-2);
  font: var(--fs-xs) var(--font-mono);
  white-space: nowrap;
}
.commit-binary,
.commit-file-search {
  color: var(--text-mut);
  font: var(--fs-xs) var(--font-mono);
}
.commit-file-search {
  padding: var(--space-2) var(--space-4);
  margin: 0;
}
.commit-patch-heading {
  flex-wrap: wrap;
  overflow-wrap: anywhere;
  font: var(--fs-sm) var(--font-mono);
}
.commit-patch-heading small {
  color: var(--text-mut);
}
.commit-patch > :deep(.diff-view) {
  flex: 1;
  min-height: 0;
}
</style>
