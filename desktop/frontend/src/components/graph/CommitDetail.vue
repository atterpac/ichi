<script setup lang="ts">
import CommitFileRow from './CommitFileRow.vue'
import { commitFileModel } from './commitFileModel'
import WindowedList from '../common/WindowedList.vue'
import AuthorAvatar from '../common/AuthorAvatar.vue'
import RefLabel from '../common/RefLabel.vue'
import { setModeline } from '../../composables/useModeline'
import { isEditable, isModified, returnFromPane } from '../../composables/keyboard'
import { computed, nextTick, ref, watch } from 'vue'
import { PhArchive, PhCaretRight, PhCherries, PhDotsThree, PhDownloadSimple, PhGitBranch, PhTrash } from '@phosphor-icons/vue'
import {
  type Commit,
  type CommitDetail,
  type CommitMetadata,
  type StatusEntry,
} from '../../bindings/github.com/atterpac/ichi/internal/git'
import type { RepoInfo } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import { usePreferenceBindings } from '../../customization/usePreferences'
import SurfaceState from '../common/SurfaceState.vue'
import UiButton from '../common/UiButton.vue'
import DiffBar from '../common/DiffBar.vue'
import FileHeatmap from '../common/FileHeatmap.vue'
import { showsHeatmap } from '../common/heatmapThreshold'
import WorkingTreePane from './WorkingTreePane.vue'
import type { WorktreeDeltas } from './worktreeHeat'

const props = withDefaults(
  defineProps<{
    commit: Commit
    detail: CommitDetail | null
    metadata?: CommitMetadata | null
    metadataLoading?: boolean
    metadataError?: string
    loading: boolean
    error: string
    repo: RepoInfo | null
    resizable?: boolean
    workingEntries?: StatusEntry[]
    workingDeltas?: WorktreeDeltas
  }>(),
  { resizable: true, workingEntries: () => [], workingDeltas: () => ({}) },
)
const emit = defineEmits<{
  copy: [hash: string]
  parent: [hash: string]
  retry: []
  metadataTab: [active: boolean]
  retryMetadata: []
  navigate: [view: string, focus?: string, file?: string]
  menu: [event: MouseEvent]
  action: [id: 'branch-here' | 'cherry-pick' | 'stash-apply' | 'stash-pop' | 'stash-drop']
}>()
const pane = ref<HTMLElement | null>(null)
const workingPane = ref<InstanceType<typeof WorkingTreePane> | null>(null)
const fileWindow = ref<{ scrollToIndex: (index: number) => void } | null>(null)
let pendingFileFocus = false
async function focusFiles() {
  pendingFileFocus = props.loading
  if (largeFileList.value) fileWindow.value?.scrollToIndex(fileIndices.value.get(selectedFile.value) ?? 0)
  await nextTick()
  if (working.value && workingPane.value) {
    await workingPane.value.focusFiles()
    return
  }
  const target = pane.value?.querySelector<HTMLElement>('.detail-file-row.heat-selected')
    ?? pane.value?.querySelector<HTMLElement>('#commit-files-panel') ?? pane.value
  target?.focus()
}
watch(() => props.loading, (loading) => {
  if (!loading && pendingFileFocus && pane.value?.contains(document.activeElement)) void focusFiles()
}, { flush: 'post' })
function paneKey(event: KeyboardEvent) {
  if (event.key === 'Tab' && event.shiftKey && !isModified(event) && !isEditable(event.target) &&
      event.target instanceof Element && event.target.closest('#commit-files-panel, .heat-pane')) {
    event.preventDefault()
    event.stopPropagation()
    documentGraphList()?.focus()
    return
  }
  returnFromPane(event, documentGraphList())
}
defineExpose({ focusFiles })
function fileKey(event: KeyboardEvent, path: string) {
  if (isModified(event) || event.defaultPrevented) return
  if (event.key === 'Enter') {
    event.preventDefault()
    if (!event.repeat) reviewFile(path)
    return
  }
  if (['l', 'ArrowRight'].includes(event.key)) {
    event.preventDefault(); return
  }
  if (!['j', 'k', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'G'].includes(event.key)) return
  event.preventDefault()
  const index = fileIndices.value.get(path) ?? 0
  const nextIndex = event.key === 'Home' ? 0 : ['End', 'G'].includes(event.key) ? sortedFiles.value.length - 1
    : Math.max(0, Math.min(sortedFiles.value.length - 1, index + (['j', 'ArrowDown'].includes(event.key) ? 1 : -1)))
  const next = sortedFiles.value[nextIndex]
  if (next) void selectHeatFile(next.Path).then(focusFiles)
}
function reviewFile(path: string) {
  emit('navigate', 'diff', props.commit.Hash, path)
}
const documentGraphList = () => document.querySelector<HTMLElement>('.commit-list')
const settings = usePreferenceBindings()
// Branch containment and signatures are costly, so they load only while Details is open.
const detailsOpen = ref(false)
watch(detailsOpen, (open) => emit('metadataTab', open), { immediate: true })
const messageOpen = ref(false)
const expanded = ref(false)
const working = computed(() => props.commit.Hash === '__ichi_working_changes__')
const author = computed(() => props.detail?.Author || props.commit.Author)
const subject = computed(() => props.detail?.Subject || props.commit.Message)
const body = computed(() => {
  const text = props.detail?.Body.trim() || ''
  return text.startsWith(subject.value) ? text.slice(subject.value.length).trim() : text
})
const hash = computed(() =>
  settings['graph.detailHash'] === 'short'
    ? props.commit.ShortHash || props.commit.Hash.slice(0, 7)
    : props.commit.Hash,
)
const authorDate = computed(() => props.detail?.AuthorDate || props.commit.Date)
const longBody = computed(() => body.value.length > 280 || body.value.split('\n').length > 5)
const committerDiffers = computed(() => {
  const d = props.detail
  return !!d?.Committer && (d.Committer !== d.Author || d.CommitterEmail !== d.AuthorEmail)
})
const committedLater = computed(() => {
  const committed = new Date(props.detail?.CommitterDate ?? '').getTime()
  const authored = new Date(authorDate.value ?? '').getTime()
  return Number.isFinite(committed) && Number.isFinite(authored) && Math.abs(committed - authored) > 60_000
})
const signature = computed(() => {
  const status = props.metadata?.GPGStatus
  if (!props.metadata) return props.metadataLoading ? 'Checking…' : 'Unavailable'
  if (!status?.Signed) return 'Unsigned'
  return `${status.Valid ? 'Valid' : 'Invalid'}${status.Signer ? ` · ${status.Signer}` : ''}`
})
// A stash's extra parents hold its index and untracked files; only the base is history.
const parents = computed(() => {
  const all = props.detail?.Parents ?? props.commit.Parents ?? []
  return props.commit.IsStash ? all.slice(0, 1) : all
})
const REF_ORDER = ['branch', 'remote', 'tag']
// Same chips as the graph row, all shown: the current branch first, then locals, remotes, tags.
const refs = computed(() =>
  [...(props.commit.Decorations ?? [])].sort(
    (a, b) =>
      Number(b.IsHead) - Number(a.IsHead) ||
      (REF_ORDER.indexOf(a.Kind) + 1 || 9) - (REF_ORDER.indexOf(b.Kind) + 1 || 9),
  ),
)
const files = computed(() => props.detail?.Files ?? [])
const fileModel = computed(() => commitFileModel(props.detail))
const sortedFiles = computed(() => fileModel.value.files)
const largeFileList = computed(() => sortedFiles.value.length > 200)
const showHeatmap = computed(() => showsHeatmap(sortedFiles.value.length))
const fileIndices = computed(() => fileModel.value.indices)
const selectedFile = ref('')
const heatFiles = computed(() =>
  sortedFiles.value.map((file) => ({
    path: file.Path,
    added: file.Insertions,
    removed: file.Deletions,
    known: !file.Binary,
  })),
)
async function selectHeatFile(path: string) {
  selectedFile.value = path
  const index = fileIndices.value.get(path) ?? 0
  if (largeFileList.value) fileWindow.value?.scrollToIndex(index)
  else if (index >= 10) expanded.value = true
  await nextTick()
  document
    .getElementById(`commit-heat-file-${index}`)
    ?.scrollIntoView({ block: 'nearest' })
}
const groups = computed(() => {
  const result = new Map<string, typeof files.value>()
  for (const file of expanded.value ? sortedFiles.value : sortedFiles.value.slice(0, 10)) {
    const slash = file.Path.lastIndexOf('/')
    const directory = slash < 0 ? '.' : file.Path.slice(0, slash)
    if (!result.has(directory)) result.set(directory, [])
    result.get(directory)!.push(file)
  }
  return Array.from(result, ([directory, entries]) => ({ directory, entries }))
})
watch(
  () => props.commit.Hash,
  () => {
    expanded.value = false
    messageOpen.value = false
    selectedFile.value = ''
  },
)
function date(value: string | undefined) {
  if (!value || Number.isNaN(new Date(value).getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}
const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60],
]
function relative(value: string | undefined) {
  const time = value ? new Date(value).getTime() : NaN
  if (Number.isNaN(time)) return ''
  const seconds = (time - Date.now()) / 1000
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  for (const [unit, size] of RELATIVE_UNITS)
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  return format.format(0, 'minute')
}
// Pointer capture keeps drag events local, with no global listeners to leak.
let drag: { x: number; width: number; pointer: number } | null = null
function setWidth(width: number) {
  settings['graph.detailWidth'] = Math.max(320, Math.min(640, Math.round(width)))
}
function beginResize(event: PointerEvent) {
  if (event.button !== 0) return
  const handle = event.currentTarget as HTMLElement
  drag = {
    x: event.clientX,
    width: handle.parentElement!.getBoundingClientRect().width,
    pointer: event.pointerId,
  }
  handle.setPointerCapture(event.pointerId)
  event.preventDefault()
  handle.focus()
}
function resize(event: PointerEvent) {
  if (drag && event.pointerId === drag.pointer) setWidth(drag.width + drag.x - event.clientX)
}
function endResize(event: PointerEvent) {
  const handle = event.currentTarget as HTMLElement
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
  drag = null
}
function resizeKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  setWidth(
    event.key === 'Home'
      ? 320
      : event.key === 'End'
        ? 640
        : settings['graph.detailWidth'] + (event.key === 'ArrowLeft' ? 16 : -16),
  )
}
</script>

<template>
  <aside ref="pane" id="commit-inspector" class="commit-detail" aria-label="Commit details" tabindex="0" data-keyboard-pane
    @keydown="paneKey" @focus.self="focusFiles" @focusin="setModeline({ mode: 'INSPECT', hints: 'j/k file · Enter diff · Shift+Tab graph · h graph' })">
    <div
      v-if="resizable !== false && settings['graph.detailPosition'] === 'right'"
      class="detail-resize"
      role="separator"
      tabindex="0"
      aria-label="Resize commit inspector"
      aria-orientation="vertical"
      aria-controls="commit-inspector"
      :aria-valuenow="settings['graph.detailWidth']"
      :aria-valuemin="320"
      :aria-valuemax="640"
      @pointerdown="beginResize"
      @pointermove="resize"
      @pointerup="endResize"
      @pointercancel="endResize"
      @lostpointercapture="drag = null"
      @keydown="resizeKey"
      @dblclick="setWidth(370)"
    />
    <div class="detail-scroll" :class="{ 'working-scroll': working && !loading && !error }">
      <SurfaceState
        v-if="loading && working"
        compact
        tone="loading"
        title="Loading commit details"
      />
      <SurfaceState
        v-else-if="error"
        compact
        tone="error"
        title="Unable to load commit"
        :message="error"
        action-label="Retry"
        @action="emit('retry')"
      />
      <WorkingTreePane
        ref="workingPane"
        v-else-if="working"
        :entries="workingEntries"
        :deltas="workingDeltas"
        :repo="repo"
        @retry="emit('retry')"
        @navigate="(view, focus) => emit('navigate', view, focus)"
      />
      <template v-else>
        <div class="detail-overview">
          <header class="detail-head">
            <h3>{{ subject }}</h3>
            <div v-if="refs.length" class="detail-refs" role="list" aria-label="Refs on this commit">
              <span v-for="decoration in refs" :key="`${decoration.Kind}:${decoration.Name}`" role="listitem">
                <RefLabel expanded :name="decoration.Name" :kind="decoration.Kind" :current="decoration.IsHead" />
              </span>
            </div>
            <div class="detail-meta">
              <span v-if="settings['graph.detailShowAuthorDate']" class="detail-person">
                <AuthorAvatar :name="author" :commit="commit.Hash" :email="detail?.AuthorEmail" :size="20" />
                <span class="detail-author">{{ author }}</span>
                <time class="detail-date" :datetime="authorDate" :title="date(authorDate)">{{ relative(authorDate) }}</time>
              </span>
              <span class="detail-ids">
                <button
                  type="button"
                  class="detail-sha"
                  :title="`Copy full SHA: ${commit.Hash}`"
                  aria-label="Copy full SHA"
                  @click="emit('copy', commit.Hash)"
                >{{ hash }}</button>
                <span v-if="parents.length" class="detail-parents" :title="parents.length > 1 ? 'Merge parents' : 'Parent'">
                  <span class="detail-parent-arrow" aria-hidden="true">←</span>
                  <button
                    v-for="(parent, index) in parents"
                    :key="parent"
                    type="button"
                    :title="detail?.ParentSubjects?.[index] || parent"
                    :aria-label="`Open parent ${parent}`"
                    @click="emit('parent', parent)"
                  >{{ parent.slice(0, 7) }}</button>
                </span>
              </span>
            </div>
          </header>
          <div v-if="body" class="detail-message" :class="{ clamped: longBody && !messageOpen }">
            <p>{{ body }}</p>
            <button v-if="longBody" type="button" class="detail-text-toggle" :aria-expanded="messageOpen" @click="messageOpen = !messageOpen">
              {{ messageOpen ? 'Show less' : 'Show more' }}
            </button>
          </div>
          <section class="detail-info">
            <button
              type="button"
              class="detail-info-toggle"
              :aria-expanded="detailsOpen"
              aria-controls="commit-metadata-panel"
              @click="detailsOpen = !detailsOpen"
            ><PhCaretRight weight="bold" :size="12" />Details</button>
            <div v-if="detailsOpen" id="commit-metadata-panel">
              <dl>
                <div v-if="settings['graph.detailShowAuthorDate'] && detail?.AuthorEmail">
                  <dt>Email</dt>
                  <dd>{{ detail.AuthorEmail }}</dd>
                </div>
                <div v-if="committerDiffers && detail">
                  <dt>Committer</dt>
                  <dd class="author-identity">
                    <AuthorAvatar :name="detail.Committer" :email="detail.CommitterEmail" :size="16" />
                    {{ detail.Committer }}<template v-if="detail.CommitterEmail"> &lt;{{ detail.CommitterEmail }}&gt;</template>
                  </dd>
                </div>
                <div v-if="settings['graph.detailShowAuthorDate'] && committedLater">
                  <dt>Committed</dt>
                  <dd>{{ date(detail?.CommitterDate) }}</dd>
                </div>
                <div>
                  <dt>Branches</dt>
                  <dd v-if="metadata?.Branches?.length" class="detail-chips">
                    <span v-for="branch in metadata.Branches" :key="branch" class="detail-chip">{{ branch }}</span>
                  </dd>
                  <dd v-else>{{ metadata ? 'No containing branches' : metadataLoading ? 'Loading…' : 'Unavailable' }}</dd>
                </div>
                <div>
                  <dt>Signature</dt>
                  <dd>{{ signature }}</dd>
                </div>
              </dl>
              <div v-if="metadataError" class="detail-info-error" role="alert">
                {{ metadataError }} <UiButton size="sm" @click="emit('retryMetadata')">Retry</UiButton>
              </div>
            </div>
          </section>
        </div>
        <div class="detail-content">
          <p v-if="loading" class="detail-loading" role="status">Loading files…</p>
          <div v-else id="commit-files-panel" class="detail-files" role="group" aria-label="Changed files" tabindex="0">
            <div v-if="detail?.Stats" class="detail-summary" aria-label="Commit change summary">
              <span>{{ detail.Stats.FilesChanged }} {{ detail.Stats.FilesChanged === 1 ? 'file' : 'files' }}</span
              ><span class="delta-add">+{{ detail.Stats.Insertions }}</span
              ><span class="delta-del">−{{ detail.Stats.Deletions }}</span>
              <DiffBar :additions="detail.Stats.Insertions" :deletions="detail.Stats.Deletions" />
            </div>
            <FileHeatmap
              v-if="showHeatmap"
              :files="heatFiles"
              :selected-path="selectedFile"
              @select="selectHeatFile"
            />
            <WindowedList v-if="largeFileList" ref="fileWindow" class="detail-file-window"
              :items="sortedFiles" :row-height="30" :key-of="file => file.Path">
              <template #default="{ item: file, index }">
                <CommitFileRow :file="file" :index="index" :selected="(selectedFile || sortedFiles[0]?.Path) === file.Path" show-directory
                  @review="reviewFile" @keydown="fileKey($event, file.Path)" />
              </template>
            </WindowedList>
            <template v-else>
              <section
                v-for="group in groups"
                :key="group.directory"
                class="detail-file-group"
                :aria-label="group.directory === '.' ? 'Repository root' : group.directory"
              >
                <h4>{{ group.directory === '.' ? 'Repository root' : group.directory + '/' }}</h4>
                <CommitFileRow
                  v-for="file in group.entries"
                  :key="`${file.Status}:${file.OldPath}:${file.Path}`"
                  :file="file" :index="fileIndices.get(file.Path)!"
                  :selected="(selectedFile || sortedFiles[0]?.Path) === file.Path"
                  @review="reviewFile"
                  @keydown="fileKey($event, file.Path)"
                />
              </section>
            </template>
            <button
              v-if="!largeFileList && files.length > 10"
              type="button"
              class="detail-text-toggle detail-show-files"
              :aria-expanded="expanded"
              @click="expanded = !expanded"
            >{{ expanded ? 'Show fewer files' : `Show all ${files.length} files` }}</button>
            <p v-if="!files.length" class="detail-more">No changed files in this commit.</p>
          </div>
        </div>
      </template>
    </div>
    <footer v-if="!working && !loading && !error && commit.IsStash" class="detail-footer">
      <UiButton @click="emit('action', 'stash-apply')"
        ><PhDownloadSimple weight="bold" :size="16" />Apply</UiButton
      >
      <UiButton @click="emit('action', 'stash-pop')"
        ><PhArchive weight="bold" :size="16" />Pop</UiButton
      >
      <UiButton variant="ghost" @click="emit('action', 'stash-drop')"
        ><PhTrash weight="bold" :size="16" />Drop</UiButton
      >
    </footer>
    <footer v-else-if="!working && !loading && !error" class="detail-footer">
      <UiButton @click="emit('action', 'branch-here')"
        ><PhGitBranch weight="bold" :size="16" />Create branch</UiButton
      >
      <UiButton @click="emit('action', 'cherry-pick')"
        ><PhCherries weight="bold" :size="16" />Cherry-pick</UiButton
      >
      <UiButton
        icon-only
        variant="ghost"
        aria-label="Commit actions"
        title="Commit actions"
        @click="emit('menu', $event)"
        ><PhDotsThree weight="bold" :size="16"
      /></UiButton>
    </footer>
  </aside>
</template>
