<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  PhGitBranch,
  PhGitCommit,
  PhCaretDown,
  PhCheck,
  PhWarningCircle,
  PhFileCode,
  PhMagnifyingGlass,
  PhArrowRight,
  PhArrowCounterClockwise,
  PhSidebarSimple,
  PhCaretLeft,
  PhCaretRight,
} from '@phosphor-icons/vue'
import {
  ConflictService,
  type ConflictDocument,
} from '../../bindings/github.com/atterpac/ichi/desktop/services'
import { useConflictWorkspace } from '../../composables/useConflictWorkspace'
import { useRepoStatus } from '../../composables/useRepoStatus'
import { useRepoSwitchGuard } from '../../composables/useRepoSwitchGuard'
import { setModeline, resetModeline } from '../../composables/useModeline'
import UiButton from '../common/UiButton.vue'
import UiIconButton from '../common/UiIconButton.vue'
import UiInput from '../common/UiInput.vue'
import RefLabel from '../common/RefLabel.vue'
import SurfaceState from '../common/SurfaceState.vue'
import OperationConfirmModal, {
  type OperationConfirmRequest,
} from '../overlays/OperationConfirmModal.vue'
import { conflictRegions, hasConflictMarkers, resolveRegion } from './conflictRegions'
import { createConflictDemo } from './conflictDemo'
const props = defineProps<{ focusFile?: string; demo?: boolean }>()
const emit = defineEmits<{ navigate: [view: string, focus?: string] }>()
const demoSession = props.demo ? createConflictDemo() : null
const conflicts = demoSession || useConflictWorkspace()
const service = demoSession || ConflictService
const reviewing = ref(false)
function review() {
  if (demoSession) reviewing.value = !reviewing.value
  else emit('navigate', 'status')
}
function restartDemo() {
  if (!demoSession || !canLeave()) return
  for (const path of Object.keys(drafts)) delete drafts[path]
  selected.value = ''
  notice.value = error.value = fileError.value = ''
  reviewing.value = false
  demoSession.reset()
}
const repo = useRepoStatus()
const workspace = computed(() => conflicts.state.data)
const selected = ref(props.focusFile || '')
const filter = ref('')
const inspector = ref(true)
const showBase = ref(false)
const busy = ref(false)
const loadingFile = ref(false)
const error = ref('')
const fileError = ref('')
const notice = ref('')
const operation = ref<OperationConfirmRequest | null>(null)
const list = ref<HTMLElement>()
const regionIndex = ref(0)
type Draft = { document: ConflictDocument; content: string; choice: string; dirty: boolean }
const drafts = reactive<Record<string, Draft>>({})
const draft = computed(() => drafts[selected.value])
const document = computed(() => draft.value?.document)
const regions = computed(() =>
  conflictRegions(draft.value?.content || '', document.value?.MarkerSize || 7),
)
const region = computed(() => regions.value[regionIndex.value])
const visible = computed(() =>
  (workspace.value?.Files || []).filter((f) =>
    f.Path.toLowerCase().includes(filter.value.toLowerCase()),
  ),
)
const dirty = computed(() => Object.values(drafts).some((d) => d.dirty))
const operationName = computed(
  () =>
    ({
      merge: 'Merge',
      rebase: 'Rebase',
      'cherry-pick': 'Cherry-pick',
      revert: 'Revert',
      am: 'Apply patches',
    })[workspace.value?.Kind || ''] || 'Conflict resolution',
)
const deletion = computed(
  () =>
    (draft.value?.choice === 'current' && !document.value?.Current.Exists) ||
    (draft.value?.choice === 'incoming' && !document.value?.Incoming.Exists),
)
const canStage = computed(
  () =>
    !!draft.value &&
    !!draft.value.choice &&
    !busy.value &&
    !loadingFile.value &&
    (draft.value.choice !== 'edit' ||
      !hasConflictMarkers(draft.value.content, document.value?.MarkerSize || 7)),
)
const canContinue = computed(
  () => !!workspace.value?.Kind && !workspace.value.Files.length && !dirty.value && !busy.value,
)
let loadGeneration = 0
let alive = true
useRepoSwitchGuard(() =>
  busy.value
    ? 'Wait for the conflict operation to finish.'
    : dirty.value
      ? 'Save or discard conflict resolutions before switching repositories.'
      : '',
)
function canLeave() {
  return !busy.value && (!dirty.value || window.confirm('Discard unsaved conflict resolutions?'))
}
defineExpose({ canLeave })
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || busy.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => {
  resetModeline()
  alive = false
  loadGeneration++
  window.removeEventListener('beforeunload', beforeUnload)
})
watch(
  () => [selected.value, busy.value, dirty.value],
  () =>
    setModeline({
      mode: busy.value ? 'BUSY' : 'NORMAL',
      hints: 'j/k files · resolve regions · stage · continue',
    }),
  { immediate: true },
)
async function load(path: string, force = false) {
  const root = workspace.value?.RepoPath
  if (!root || !path) {
    loadingFile.value = false
    return
  }
  if (drafts[path] && !force) {
    loadingFile.value = false
    return
  }
  const request = ++loadGeneration
  loadingFile.value = true
  fileError.value = ''
  try {
    const doc = await service.LoadConflict(root, path)
    if (!alive || request !== loadGeneration || workspace.value?.RepoPath !== root) return
    if (!doc) throw new Error('Could not read conflict file.')
    drafts[path] = {
      document: doc,
      content: doc.Result,
      choice: doc.Editable ? 'edit' : '',
      dirty: false,
    }
  } catch (e) {
    if (request === loadGeneration) fileError.value = errorText(e)
  } finally {
    if (request === loadGeneration) loadingFile.value = false
  }
}
watch(selected, (path) => {
  loadGeneration++
  fileError.value = ''
  regionIndex.value = 0
  void load(path)
})
watch(
  () => workspace.value?.Files.map((f) => f.Path).join('\0'),
  () => {
    if (!workspace.value) return
    const paths = workspace.value?.Files.map((f) => f.Path) || []
    if (!paths.includes(selected.value) && !draft.value?.dirty) {
      selected.value = paths[0] || ''
      return
    }
    if (selected.value && paths.includes(selected.value) && !drafts[selected.value])
      void load(selected.value)
  },
  { immediate: true },
)
watch(
  () => props.focusFile,
  (path) => {
    if (path && !busy.value) selected.value = path
  },
)
watch(
  () => workspace.value?.Token,
  (value, previous) => {
    if (!previous || value === previous || busy.value) return
    if (dirty.value) {
      error.value =
        'The Git operation changed. Your drafts are kept; reload each file before saving.'
      return
    }
    for (const path of Object.keys(drafts)) delete drafts[path]
    if (selected.value) void load(selected.value)
  },
)
function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}
function edit(content: string) {
  if (!draft.value) return
  draft.value.content = content
  draft.value.choice = 'edit'
  draft.value.dirty = true
  regionIndex.value = Math.min(regionIndex.value, Math.max(0, regions.value.length - 1))
}
function chooseRegion(choice: 'current' | 'incoming' | 'both') {
  if (!draft.value || !region.value) return
  edit(resolveRegion(draft.value.content, region.value, choice))
  notice.value =
    choice === 'both'
      ? 'Both alternatives inserted, current first. Review the result before staging.'
      : ''
}
function chooseFile(choice: 'current' | 'incoming' | 'working') {
  if (!draft.value || !document.value) return
  draft.value.choice = choice
  draft.value.dirty = true
  draft.value.content =
    choice === 'current'
      ? document.value.Current.Content
      : choice === 'incoming'
        ? document.value.Incoming.Content
        : document.value.Result
  regionIndex.value = 0
}
async function reloadFile() {
  if (
    busy.value ||
    (draft.value?.dirty && !window.confirm('Discard this draft and reload the file from Git?'))
  )
    return
  delete drafts[selected.value]
  error.value = ''
  await conflicts.refresh()
  if (!workspace.value?.Files.some((f) => f.Path === selected.value)) {
    selected.value = workspace.value?.Files[0]?.Path || ''
    fileError.value = ''
    return
  }
  await load(selected.value, true)
}
async function refresh() {
  await conflicts.refresh()
  if (selected.value && !draft.value?.dirty) await load(selected.value, true)
}
async function save() {
  const current = draft.value
  const root = workspace.value?.RepoPath
  const path = selected.value
  if (!current || !root || !canStage.value || !current.choice) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await service.ResolveConflict(
      root,
      path,
      current.document.Token,
      current.choice,
      current.content,
    )
    delete drafts[path]
    notice.value = `${path} resolved and staged.`
    await conflicts.refresh()
    selected.value = workspace.value?.Files[0]?.Path || ''
  } catch (e) {
    error.value = errorText(e)
    await conflicts.refresh()
  } finally {
    busy.value = false
  }
}
async function control(action: 'continue' | 'abort' | 'skip') {
  const w = workspace.value
  if (!w || busy.value) return
  const name = operationName.value
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await service.ControlConflict(w.RepoPath, w.Token, action)
    for (const path of Object.keys(drafts)) delete drafts[path]
    selected.value = ''
    await conflicts.refresh()
    notice.value =
      action === 'abort'
        ? `${name} aborted.`
        : workspace.value?.Kind
          ? 'Git paused again. Review the next step.'
          : 'Git operation complete.'
  } catch (e) {
    error.value = errorText(e)
    await conflicts.refresh()
  } finally {
    busy.value = false
  }
}
function confirm(action: 'abort' | 'skip') {
  operation.value = {
    title: `${action === 'abort' ? 'Abort' : 'Skip commit in'} ${operationName.value.toLowerCase()}?`,
    message:
      action === 'abort'
        ? 'Git will attempt to restore the pre-operation state. Resolutions made during this operation and unsaved drafts will be discarded.'
        : 'The current commit and its conflict resolutions will be omitted from this operation. Unsaved drafts will be discarded.',
    confirmLabel: action === 'abort' ? 'Abort operation' : 'Skip commit',
    tone: 'warning',
    target: workspace.value?.Subject || workspace.value?.Branch,
    onConfirm: async () => {
      await control(action)
      if (error.value) throw new Error(error.value)
    },
  }
}
async function moveFile(delta: number) {
  if (busy.value) return
  const index = visible.value.findIndex((f) => f.Path === selected.value)
  const next = visible.value[Math.max(0, Math.min(visible.value.length - 1, index + delta))]
  if (!next) return
  selected.value = next.Path
  await nextTick()
  list.value?.querySelector<HTMLElement>('[aria-current="true"]')?.focus()
}
function source(side: 'current' | 'incoming') {
  return region.value
    ? region.value[side]
    : side === 'current'
      ? document.value?.Current.Content || ''
      : document.value?.Incoming.Content || ''
}
</script>

<template>
  <section class="conflicts-view native-conflict-content">
    <div v-if="demo" class="native-notice" role="status">
      <strong>Conflict demo</strong> · Resolve both files, stage them, then continue the rebase. Your repositories are untouched.
      <UiButton size="sm" :disabled="busy" @click="restartDemo">Restart demo</UiButton>
      <UiButton size="sm" :disabled="busy" @click="emit('navigate', 'graph')">Exit demo</UiButton>
    </div>
    <div v-if="demoSession && reviewing" class="demo-staged-review">
      <strong>Staged demo results</strong>
      <p v-if="!Object.keys(demoSession.staged).length">No staged files yet.</p>
      <details v-for="(content, path) in demoSession.staged" :key="path" open>
        <summary>{{ path }}</summary><pre>{{ content }}</pre>
      </details>
    </div>
    <header class="conflicts-toolbar">
      <div class="ui-control size-md">
        <PhMagnifyingGlass :size="14" /><UiInput
          v-model="filter"
          aria-label="Filter conflict files"
          placeholder="Filter conflict files…"
        />
      </div>
      <span class="native-spacer" /><UiButton size="sm" :disabled="busy" @click="refresh"
        ><PhArrowCounterClockwise :size="14" /> Refresh</UiButton
      ><UiIconButton
        label="Toggle operation details"
        size="sm"
        :aria-expanded="inspector"
        @click="inspector = !inspector"
        ><PhSidebarSimple :size="16"
      /></UiIconButton>
    </header>
    <p v-if="error || conflicts.state.error" class="conflicts-error" role="alert">
      {{ error || conflicts.state.error }}
    </p>
    <div v-if="notice" class="native-notice" role="status">{{ notice }}</div>
    <SurfaceState
      v-if="!demo && !repo.info"
      title="Open a repository"
      message="Open a repository to resolve conflicts."
    />
    <SurfaceState
      v-else-if="!workspace"
      :title="conflicts.state.loading ? 'Loading conflicts…' : 'Unable to read Git state'"
      :message="conflicts.state.error"
    />
    <template v-else>
      <div class="native-operation-strip">
        <PhWarningCircle :size="16" /><strong>{{
          workspace.Kind
            ? `${operationName} in progress`
            : workspace.Files.length
              ? 'Unmerged files'
              : 'No conflicts'
        }}</strong
        ><RefLabel v-if="workspace.Branch" :name="workspace.Branch" kind="branch" /><span
          class="native-spacer"
        /><span v-if="workspace.Total">Step {{ workspace.Step }} of {{ workspace.Total }} · </span
        ><span>{{ workspace.Files.length }} unresolved</span>
      </div>
      <div
        v-if="workspace.Files.length || workspace.Kind || dirty"
        class="native-workspace"
        :class="{ 'without-inspector': !inspector }"
      >
        <aside
          ref="list"
          class="native-files changes-left"
          tabindex="0"
          data-keyboard-pane
          aria-label="Conflict files"
          @keydown.down.prevent.stop="moveFile(1)"
          @keydown.up.prevent.stop="moveFile(-1)"
          @keydown.j.prevent.stop="moveFile(1)"
          @keydown.k.prevent.stop="moveFile(-1)"
        >
          <div class="changes-section">
            <span><PhCaretDown :size="12" /> Conflicts</span
            ><span>{{ workspace.Files.length }}</span>
          </div>
          <button
            v-for="f in visible"
            :key="f.Path"
            class="native-file-row"
            :class="{ selected: selected === f.Path }"
            :aria-current="selected === f.Path ? 'true' : undefined"
            :disabled="busy"
            :title="`${f.Path} · ${f.Kind}`"
            @click="selected = f.Path"
          >
            <PhFileCode :size="14" /><span>{{ f.Path }}</span
            ><small>{{ drafts[f.Path]?.dirty ? '●' : '!' }}</small>
          </button>
          <p v-if="!visible.length" class="native-empty">
            {{ workspace.Files.length ? 'No matching files.' : 'All conflicts staged.' }}
          </p>
          <div class="native-file-summary">
            <span>{{ workspace.Staged.length }} staged changes</span
            ><UiButton
              size="sm"
              variant="ghost"
              :disabled="busy"
              @click="review()"
              >Review</UiButton
            >
          </div>
          <div v-if="workspace.OriginalHead" class="native-left-foot">
            <span
              >Original HEAD
              <code :title="workspace.OriginalHead">{{
                workspace.OriginalHead.slice(0, 10)
              }}</code></span
            >
          </div>
        </aside>
        <section
          class="native-editor"
          tabindex="0"
          data-keyboard-pane
          aria-label="Conflict resolution"
        >
          <header class="diff-file-head">
            <PhFileCode :size="16" /><span class="diff-file-path">{{
              selected || 'Resolution complete'
            }}</span
            ><span class="native-spacer" /><UiButton
              v-if="selected"
              size="sm"
              variant="ghost"
              :disabled="busy"
              @click="reloadFile"
              >Reload file</UiButton
            ><UiButton
              v-if="document?.Base.Exists"
              size="sm"
              variant="ghost"
              :active="showBase"
              @click="showBase = !showBase"
              >Base</UiButton
            >
          </header>
          <SurfaceState v-if="loadingFile" title="Loading file…" />
          <SurfaceState
            v-else-if="fileError"
            tone="error"
            title="Cannot open this conflict"
            :message="`${fileError}. Resolve and stage it externally, then refresh.`"
          />
          <SurfaceState
            v-else-if="!draft || !document"
            title="Ready for the next step"
            message="Review staged changes, then continue the operation."
          />
          <template v-else>
            <div class="native-editor-scroll">
              <div v-if="showBase" class="native-base">
                <header>Common ancestor · whole file</header>
                <pre v-if="document.Base.Editable">{{ document.Base.Content }}</pre>
                <p v-else>Binary base version.</p>
              </div>
              <div class="native-hunk-bar">
                <span>{{
                  regions.length
                    ? `Conflict region ${regionIndex + 1} of ${regions.length}`
                    : document.Editable
                      ? 'Whole-file comparison'
                      : 'Binary conflict'
                }}</span>
                <div v-if="regions.length" class="conflict-region-controls">
                  <UiIconButton
                    size="sm"
                    label="Previous conflict region"
                    :disabled="regionIndex === 0 || busy"
                    @click="regionIndex--"
                    ><PhCaretLeft :size="12" /></UiIconButton
                  ><UiIconButton
                    size="sm"
                    label="Next conflict region"
                    :disabled="regionIndex >= regions.length - 1 || busy"
                    @click="regionIndex++"
                    ><PhCaretRight :size="12"
                  /></UiIconButton>
                </div>
              </div>
              <div class="native-comparison">
                <section
                  v-for="side in ['current', 'incoming'] as const"
                  :key="side"
                  class="native-version"
                  :class="side === 'current' ? 'main' : 'commit'"
                >
                  <header>
                    <div>
                      <RefLabel
                        :name="
                          side === 'current' ? 'HEAD' : workspace.Commit.slice(0, 10) || 'Incoming'
                        "
                        kind="branch"
                        :color-var="side === 'current' ? '--cyan' : '--green'"
                      /><small>{{
                        side === 'current' ? workspace.CurrentLabel : workspace.IncomingLabel
                      }}</small>
                    </div>
                    <UiButton
                      size="sm"
                      variant="ghost"
                      :disabled="busy"
                      @click="region ? chooseRegion(side) : chooseFile(side)"
                      >{{
                        region
                          ? 'Use this region'
                          : !(side === 'current'
                                ? document.Current.Exists
                                : document.Incoming.Exists)
                            ? 'Keep deletion'
                            : 'Use whole file'
                      }}</UiButton
                    >
                  </header>
                  <div
                    v-if="
                      !(side === 'current' ? document.Current.Exists : document.Incoming.Exists)
                    "
                    class="native-deletion"
                  >
                    File absent in this version.
                  </div>
                  <div v-else-if="!document.Editable" class="native-deletion">
                    {{ document.Reason }}
                  </div>
                  <div v-else class="native-code">
                    <div
                      v-for="(line, index) in source(side).split('\n')"
                      :key="index"
                      class="changed"
                    >
                      <span class="native-line-no">{{ index + 1 }}</span
                      ><code>{{ line }}</code>
                    </div>
                  </div>
                </section>
              </div>
              <section class="native-result">
                <header>
                  <strong>Result</strong
                  ><span class="native-result-state">{{
                    draft.dirty ? 'Unsaved resolution' : 'Working file'
                  }}</span
                  ><span class="native-spacer" /><UiButton
                    v-if="region"
                    size="sm"
                    :disabled="busy"
                    @click="chooseRegion('both')"
                    >Keep both in region</UiButton
                  >
                </header>
                <div v-if="deletion" class="native-deletion native-positive">
                  <PhCheck :size="20" /> This file will remain deleted.
                </div>
                <div v-else-if="!document.Editable" class="native-deletion">
                  <p>
                    {{
                      draft.choice
                        ? `Selected: ${draft.choice === 'current' ? workspace.CurrentLabel : draft.choice === 'incoming' ? workspace.IncomingLabel : 'working file'}`
                        : 'Choose a version to keep, or resolve with an external tool.'
                    }}
                  </p>
                  <UiButton :disabled="busy || !document.Exists" @click="chooseFile('working')"
                    >Use working file</UiButton
                  >
                </div>
                <div v-else class="native-result-body">
                  <textarea
                    :value="draft.content"
                    aria-label="Resolved file contents"
                    spellcheck="false"
                    wrap="off"
                    :disabled="busy"
                    @keydown.stop
                    @input="edit(($event.target as HTMLTextAreaElement).value)"
                  />
                </div>
              </section>
            </div>
            <footer class="native-editor-footer">
              <span>{{
                hasConflictMarkers(draft.content, document.MarkerSize || 7) &&
                draft.choice === 'edit'
                  ? 'Resolve all markers before staging.'
                  : 'Saving stages this file in Git.'
              }}</span
              ><UiButton variant="primary" :disabled="!canStage || !draft.choice" @click="save"
                ><PhCheck :size="14" /> {{ busy ? 'Working…' : 'Save and stage' }}
                <PhArrowRight :size="14"
              /></UiButton>
            </footer>
          </template>
        </section>
        <aside
          v-if="inspector"
          class="native-inspector"
          data-keyboard-pane
          tabindex="0"
          aria-label="Operation details"
        >
          <header>
            <PhGitBranch :size="15" /><strong>{{ operationName }}</strong
            ><span v-if="workspace.Total">{{ workspace.Step }} / {{ workspace.Total }}</span>
          </header>
          <section class="native-current-commit">
            <p class="native-label">
              {{
                workspace.Kind === 'revert'
                  ? 'Reverting commit'
                  : workspace.Kind === 'merge'
                    ? 'Merging commit'
                    : 'Current commit'
              }}
            </p>
            <code>{{ workspace.Commit.slice(0, 10) || 'Unmerged index' }}</code>
            <h3>{{ workspace.Subject || 'Resolve the remaining files' }}</h3>
            <p>{{ workspace.Author }}</p>
            <p v-if="workspace.Onto">
              Onto <code>{{ workspace.Onto.slice(0, 10) }}</code>
            </p>
          </section>
          <div v-if="workspace.Steps.length" class="native-steps">
            <p class="native-label">Replay progress</p>
            <div
              v-for="(step, index) in workspace.Steps"
              :key="`${index}-${step.Hash}`"
              class="native-step"
              :class="{ current: step.State === 'current', done: step.State === 'done' }"
            >
              <PhCheck v-if="step.State === 'done'" :size="13" /><PhWarningCircle
                v-else-if="step.State === 'current'"
                :size="13"
              /><PhGitCommit v-else :size="13" />
              <div>
                <span>{{ step.Subject }}</span
                ><code>{{ step.Hash.slice(0, 10) }} · {{ step.State }}</code>
              </div>
            </div>
          </div>
          <div class="native-inspector-note">
            <strong>{{ canContinue ? 'Ready to continue' : 'Resolve and stage' }}</strong>
            <p>
              {{
                workspace.Kind
                  ? 'Stage each resolved file, then continue. Git may pause again at another commit.'
                  : 'These conflicts are not part of a resumable operation. Stage the resolutions and review Changes.'
              }}
            </p>
          </div>
          <div class="native-inspector-actions">
            <UiButton
              v-if="workspace.Kind"
              block
              variant="primary"
              :disabled="!canContinue"
              @click="control('continue')"
              >Continue {{ operationName.toLowerCase() }} <PhArrowRight :size="14" /></UiButton
            ><UiButton v-else block @click="review()">Review changes</UiButton>
            <div v-if="workspace.Kind">
              <UiButton
                v-if="workspace.Kind !== 'merge'"
                size="sm"
                variant="ghost"
                :disabled="busy"
                @click="confirm('skip')"
                >Skip commit…</UiButton
              ><UiButton size="sm" variant="ghost" :disabled="busy" @click="confirm('abort')"
                >Abort…</UiButton
              >
            </div>
          </div>
        </aside>
      </div>
      <SurfaceState
        v-else
        title="No unresolved conflicts"
        :message="demo ? 'Demo finished. Review your results or restart to try another resolution.' : 'Your repository has no unmerged files.'"
        action-label="Review changes"
        @action="review()"
      />
      <div v-if="!inspector && workspace.Kind" class="native-collapsed-actions">
        <UiButton size="sm" variant="ghost" :disabled="busy" @click="confirm('abort')"
          >Abort…</UiButton
        ><UiButton
          v-if="workspace.Kind !== 'merge'"
          size="sm"
          variant="ghost"
          :disabled="busy"
          @click="confirm('skip')"
          >Skip commit…</UiButton
        ><span class="native-spacer" /><UiButton
          variant="primary"
          :disabled="!canContinue"
          @click="control('continue')"
          >Continue {{ operationName.toLowerCase() }}</UiButton
        >
      </div>
    </template>
    <OperationConfirmModal v-if="operation" :request="operation" @close="operation = null" />
  </section>
</template>
