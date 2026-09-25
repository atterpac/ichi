<script setup lang="ts">
import AuthorAvatar from '../common/AuthorAvatar.vue'
import { setModeline } from '../../composables/useModeline'
import { returnFromPane } from '../../composables/keyboard'
import { computed, nextTick, ref, watch } from 'vue'
import { PhCherries, PhCopy, PhDotsThree, PhGitBranch } from '@phosphor-icons/vue'
import {
  FileStatus,
  type Commit,
  type CommitDetail,
  type StatusEntry,
} from '../../bindings/github.com/atterpac/ichi/internal/git'
import type { RepoInfo } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import { useShellSettings } from '../../composables/useShellSettings'
import SurfaceState from '../common/SurfaceState.vue'
import UiButton from '../common/UiButton.vue'
import DiffBar from '../common/DiffBar.vue'
import FileHeatmap from '../common/FileHeatmap.vue'
import WorkingTreePane from './WorkingTreePane.vue'
import type { WorktreeDeltas } from './worktreeHeat'

const props = withDefaults(
  defineProps<{
    commit: Commit
    detail: CommitDetail | null
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
  navigate: [view: string, focus?: string]
  menu: [event: MouseEvent]
  action: [id: 'branch-here' | 'cherry-pick']
}>()
function focusFiles() {
  document.querySelector<HTMLElement>('#commit-inspector .heat-file.selected, #commit-inspector .detail-file-row.heat-selected')?.focus()
}
function fileKey(event: KeyboardEvent, path: string) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return
  if (['l', 'ArrowRight'].includes(event.key)) {
    event.preventDefault(); emit('navigate', 'file-log', path); return
  }
  if (!['j', 'k', 'ArrowDown', 'ArrowUp'].includes(event.key)) return
  event.preventDefault()
  const index = sortedFiles.value.findIndex(file => file.Path === path)
  const next = sortedFiles.value[Math.max(0, Math.min(sortedFiles.value.length - 1, index + (['j', 'ArrowDown'].includes(event.key) ? 1 : -1)))]
  if (next) void selectHeatFile(next.Path).then(focusFiles)
}
const documentGraphList = () => document.querySelector<HTMLElement>('.commit-list')
const settings = useShellSettings()
const tab = ref<'files' | 'metadata'>('files')
const expanded = ref(false)
const working = computed(() => props.commit.Hash === '__ichi_working_changes__')
const author = computed(() => props.detail?.Author || props.commit.Author)
const subject = computed(() => props.detail?.Subject || props.commit.Message)
const body = computed(() => {
  const text = props.detail?.Body.trim() || ''
  return text.startsWith(subject.value) ? text.slice(subject.value.length).trim() : text
})
const hash = computed(() =>
  settings.graphDetailHash === 'short' ? props.commit.ShortHash : props.commit.Hash,
)
const parents = computed(() => props.detail?.Parents ?? props.commit.Parents ?? [])
const files = computed(() => props.detail?.Files ?? [])
const sortedFiles = computed(() => [...files.value].sort((a, b) => a.Path.localeCompare(b.Path)))
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
  if (sortedFiles.value.findIndex((file) => file.Path === path) >= 10) expanded.value = true
  await nextTick()
  document
    .getElementById(`commit-heat-file-${sortedFiles.value.findIndex((file) => file.Path === path)}`)
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
    selectedFile.value = ''
  },
)
function status(status: FileStatus) {
  switch (status) {
    case FileStatus.FileAdded:
      return { letter: 'A', name: 'Added', tone: 'positive' }
    case FileStatus.FileDeleted:
      return { letter: 'D', name: 'Deleted', tone: 'negative' }
    case FileStatus.FileRenamed:
      return { letter: 'R', name: 'Renamed', tone: 'accent' }
    case FileStatus.FileCopied:
      return { letter: 'C', name: 'Copied', tone: 'accent' }
    case FileStatus.FileUntracked:
      return { letter: '?', name: 'Untracked', tone: 'warning' }
    case FileStatus.FileConflict:
      return { letter: '!', name: 'Conflict', tone: 'negative' }
    case FileStatus.FileUnchanged:
      return { letter: '–', name: 'Unchanged', tone: 'neutral' }
    default:
      return { letter: 'M', name: 'Modified', tone: 'warning' }
  }
}
function date(value: string | undefined) {
  if (!value || Number.isNaN(new Date(value).getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}
function onTabKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  tab.value =
    event.key === 'Home'
      ? 'files'
      : event.key === 'End'
        ? 'metadata'
        : tab.value === 'files'
          ? 'metadata'
          : 'files'
  void nextTick(() => document.getElementById(`commit-${tab.value}-tab`)?.focus())
}
// Pointer capture keeps drag events local, with no global listeners to leak.
let drag: { x: number; width: number; pointer: number } | null = null
function setWidth(width: number) {
  settings.graphDetailWidth = Math.max(320, Math.min(640, Math.round(width)))
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
        : settings.graphDetailWidth + (event.key === 'ArrowLeft' ? 16 : -16),
  )
}
</script>

<template>
  <aside id="commit-inspector" class="commit-detail" aria-label="Commit details" tabindex="0" data-keyboard-pane
    @keydown="returnFromPane($event, documentGraphList())" @focus.self="focusFiles" @focusin="setModeline({ mode: 'INSPECT', hints: working ? 'j/k file · l review · h graph' : 'j/k file · l history · h graph' })">
    <div
      v-if="resizable !== false && settings.graphDetailPosition === 'right'"
      class="detail-resize"
      role="separator"
      tabindex="0"
      aria-label="Resize commit inspector"
      aria-orientation="vertical"
      aria-controls="commit-inspector"
      :aria-valuenow="settings.graphDetailWidth"
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
        v-else-if="working"
        :entries="workingEntries"
        :deltas="workingDeltas"
        :repo="repo"
        @retry="emit('retry')"
        @navigate="(view, focus) => emit('navigate', view, focus)"
      />
      <template v-else>
        <header class="detail-head">
          <div v-if="settings.graphDetailShowAuthorDate" class="detail-person">
            <AuthorAvatar :name="author" :commit="commit.Hash" :email="detail?.AuthorEmail" :size="32" />
            <div>
              <span class="detail-author">{{ author }}</span
              ><time class="detail-date">{{ date(detail?.AuthorDate || commit.Date) }}</time>
            </div>
          </div>
          <h3>{{ subject }}</h3>
        </header>
        <div v-if="body" class="detail-message">
          <p>{{ body }}</p>
        </div>
        <div class="detail-identifiers">
          <UiButton
            size="sm"
            class="detail-sha"
            :title="`Copy full SHA: ${commit.Hash}`"
            aria-label="Copy full SHA"
            @click="emit('copy', commit.Hash)"
            ><PhCopy weight="bold" :size="16" />{{ hash }}</UiButton
          >
          <div v-if="parents.length" class="detail-parents">
            <span>Parents</span
            ><UiButton
              v-for="(parent, index) in parents"
              :key="parent"
              size="sm"
              variant="ghost"
              :title="detail?.ParentSubjects?.[index] || parent"
              :aria-label="`Open parent ${parent}`"
              @click="emit('parent', parent)"
              >{{ parent.slice(0, 7) }}</UiButton
            >
          </div>
        </div>
        <p v-if="loading" class="detail-loading" role="status">Loading files and metadata…</p>
        <template v-else>
          <div
            class="detail-tabs ui-tabs"
            role="tablist"
            aria-label="Commit information"
            @keydown="onTabKey"
          >
            <button
              id="commit-files-tab"
              type="button"
              role="tab"
              :aria-selected="tab === 'files'"
              :tabindex="tab === 'files' ? 0 : -1"
              aria-controls="commit-files-panel"
              @click="tab = 'files'"
            >
              Files <span>{{ files.length }}</span>
            </button>
            <button
              id="commit-metadata-tab"
              type="button"
              role="tab"
              :aria-selected="tab === 'metadata'"
              :tabindex="tab === 'metadata' ? 0 : -1"
              aria-controls="commit-metadata-panel"
              @click="tab = 'metadata'"
            >
              Metadata
            </button>
          </div>
          <div
            v-show="tab === 'files'"
            id="commit-files-panel"
            role="tabpanel"
            aria-labelledby="commit-files-tab"
            tabindex="0"
          >
            <div v-if="detail?.Stats" class="detail-summary" aria-label="Commit change summary">
              <span>{{ detail.Stats.FilesChanged }} files</span
              ><span class="delta-add">+{{ detail.Stats.Insertions }}</span
              ><span class="delta-del">−{{ detail.Stats.Deletions }}</span>
              <DiffBar :additions="detail.Stats.Insertions" :deletions="detail.Stats.Deletions" />
            </div>
            <FileHeatmap
              :files="heatFiles"
              :selected-path="selectedFile"
              @select="selectHeatFile"
            />
            <section
              v-for="group in groups"
              :key="group.directory"
              class="detail-file-group"
              :aria-label="group.directory === '.' ? 'Repository root' : group.directory"
            >
              <h4>{{ group.directory === '.' ? 'Repository root' : group.directory + '/' }}</h4>
              <button
                v-for="file in group.entries"
                :key="`${file.Status}:${file.OldPath}:${file.Path}`"
                class="detail-file-row"
                :id="`commit-heat-file-${sortedFiles.findIndex((entry) => entry.Path === file.Path)}`"
                :class="{ 'heat-selected': (selectedFile || sortedFiles[0]?.Path) === file.Path }"
                type="button"
                :title="`View file history: ${file.Path}`"
                @click="emit('navigate', 'file-log', file.Path)"
                @keydown="fileKey($event, file.Path)"
              >
                <span
                  class="file-status"
                  :class="`status-${status(file.Status).tone}`"
                  :aria-label="status(file.Status).name"
                  :title="status(file.Status).name"
                  >{{ status(file.Status).letter }}</span
                >
                <span class="file-path"
                  >{{ file.Path.split('/').pop()
                  }}<small v-if="file.OldPath">from {{ file.OldPath }}</small></span
                >
                <span class="file-change-stats">
                  <span class="file-delta"
                    ><template v-if="file.Binary">binary</template
                    ><template v-else
                      ><span class="delta-add">+{{ file.Insertions }}</span
                      ><span class="delta-del">−{{ file.Deletions }}</span></template
                    ></span
                  >
                  <DiffBar
                    v-if="!file.Binary"
                    :additions="file.Insertions"
                    :deletions="file.Deletions"
                  />
                </span>
              </button>
            </section>
            <UiButton
              v-if="files.length > 10"
              class="detail-show-files"
              size="sm"
              :aria-expanded="expanded"
              @click="expanded = !expanded"
              >{{ expanded ? 'Show fewer files' : `Show all ${files.length} files` }}</UiButton
            >
            <p v-if="!files.length" class="detail-more">No changed files in this commit.</p>
          </div>
          <div
            v-show="tab === 'metadata'"
            id="commit-metadata-panel"
            role="tabpanel"
            aria-labelledby="commit-metadata-tab"
            tabindex="0"
          >
            <dl>
              <div v-if="settings.graphDetailShowAuthorDate && detail?.AuthorEmail">
                <dt>Email</dt>
                <dd class="author-identity"><AuthorAvatar :name="author" :commit="commit.Hash" :email="detail?.AuthorEmail" :size="18" />{{ detail.AuthorEmail }}</dd>
              </div>
              <div v-if="settings.graphDetailShowAuthorDate && detail?.Committer">
                <dt>Committer</dt>
                <dd class="author-identity">
                  <AuthorAvatar :name="detail.Committer" :email="detail.CommitterEmail" :size="18" />
                  {{ detail.Committer
                  }}<template v-if="detail.CommitterEmail">
                    &lt;{{ detail.CommitterEmail }}&gt;</template
                  >
                </dd>
              </div>
              <div v-if="settings.graphDetailShowAuthorDate && detail?.CommitterDate">
                <dt>Committed</dt>
                <dd>{{ date(detail.CommitterDate) }}</dd>
              </div>
              <div>
                <dt>Branches</dt>
                <dd>{{ detail?.Branches?.join(', ') || 'No containing branches' }}</dd>
              </div>
              <div>
                <dt>Signature</dt>
                <dd>
                  {{
                    !detail?.GPGStatus?.Signed
                      ? 'Unsigned'
                      : detail.GPGStatus.Valid
                        ? 'Valid'
                        : 'Invalid'
                  }}<template v-if="detail?.GPGStatus?.Signer">
                    — {{ detail.GPGStatus.Signer }}</template
                  >
                </dd>
              </div>
            </dl>
          </div>
        </template>
      </template>
    </div>
    <footer v-if="!working && !loading && !error" class="detail-footer">
      <UiButton @click="emit('action', 'branch-here')"
        ><PhGitBranch weight="bold" :size="16" />Create branch</UiButton
      >
      <UiButton @click="emit('action', 'cherry-pick')"
        ><PhCherries weight="bold" :size="16" />Cherry-pick</UiButton
      >
      <UiButton
        icon-only
        aria-label="Commit actions"
        title="Commit actions"
        @click="emit('menu', $event)"
        ><PhDotsThree weight="bold" :size="16"
      /></UiButton>
    </footer>
  </aside>
</template>
