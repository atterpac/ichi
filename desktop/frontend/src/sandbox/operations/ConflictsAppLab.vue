<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  PhGitBranch,
  PhGitCommit,
  PhCaretDown,
  PhCaretRight,
  PhCheck,
  PhWarningCircle,
  PhFileCode,
  PhMagnifyingGlass,
  PhArrowRight,
  PhArrowCounterClockwise,
  PhSidebarSimple,
  PhClockCounterClockwise,
} from '@phosphor-icons/vue'
import UiButton from '../../components/common/UiButton.vue'
import UiIconButton from '../../components/common/UiIconButton.vue'
import UiInput from '../../components/common/UiInput.vue'
import RefLabel from '../../components/common/RefLabel.vue'
import OperationConfirmModal, {
  type OperationConfirmRequest,
} from '../../components/overlays/OperationConfirmModal.vue'
import { DEFAULT_THEME, THEMES, isThemeId } from '../../theme/themes'
import { conflictFixtures, planFixtures } from './fixtures'
function initialTheme() {
  try {
    const stored = JSON.parse(localStorage.getItem('ichi.desktop.settings') || '{}')
    if (isThemeId(stored.theme)) return stored.theme
  } catch {
    /* Use the app default. */
  }
  return DEFAULT_THEME
}
const theme = ref(initialTheme())
const previousThemes = [...document.documentElement.classList].filter((c) => c.startsWith('theme-'))
watch(
  theme,
  (value) => {
    for (const cls of [...document.documentElement.classList])
      if (cls.startsWith('theme-')) document.documentElement.classList.remove(cls)
    document.documentElement.classList.add(`theme-${value}`)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  document.documentElement.classList.remove(`theme-${theme.value}`)
  document.documentElement.classList.add(...previousThemes)
})
const files = ref(conflictFixtures())
const selected = ref(0)
const file = computed(() => files.value[selected.value]!)
const filter = ref('')
const visible = computed(() =>
  files.value
    .map((file, index) => ({ file, index }))
    .filter(({ file }) => file.path.toLowerCase().includes(filter.value.toLowerCase())),
)
const staged = computed(() => files.value.filter((f) => f.staged).length)
const showBase = ref(false)
const inspector = ref(true)
const notice = ref('')
const phase = ref<'paused' | 'complete' | 'aborted'>('paused')
const operation = ref<OperationConfirmRequest | null>(null)
const list = ref<HTMLElement>()
const steps = planFixtures()
const canStage = computed(
  () =>
    !!file.value.choice &&
    !file.value.staged &&
    !/^(<<<<<<<|=======|>>>>>>>)/m.test(file.value.result),
)
function choose(choice: string) {
  const current = file.value
  current.choice = choice
  current.staged = false
  current.result =
    choice === 'main' || choice === 'delete'
      ? current.target
      : choice === 'combined'
        ? current.combined
        : current.incoming
  notice.value = ''
}
function edited() {
  file.value.choice = 'manual'
  file.value.staged = false
}
function stage() {
  if (!canStage.value) return
  file.value.staged = true
  notice.value = `${file.value.path.split('/').pop()} resolved and staged.`
  const next = files.value.findIndex((f) => !f.staged)
  if (next >= 0) selected.value = next
}
function reset() {
  files.value = conflictFixtures()
  selected.value = 0
  filter.value = ''
  notice.value = ''
  phase.value = 'paused'
  showBase.value = false
  operation.value = null
}
function continueRebase() {
  if (staged.value === files.value.length) {
    phase.value = 'complete'
    notice.value = 'Rebase completed in the example. No Git commands were run.'
  }
}
function confirm(kind: 'abort' | 'skip') {
  operation.value = {
    title: kind === 'abort' ? 'Abort rebase?' : 'Skip this commit?',
    message:
      kind === 'abort'
        ? 'Return feature/session to its state before the rebase. The current conflict resolutions will be discarded.'
        : 'Omit “Persist sessions without secrets” and its conflict resolutions from the rewritten history.',
    target: 'feature/session → main',
    details: [{ label: 'Recovery point', value: 'f52cd09 · before rebase' }],
    confirmLabel: kind === 'abort' ? 'Abort rebase' : 'Skip commit',
    tone: 'warning',
    onConfirm: () => {
      phase.value = kind === 'abort' ? 'aborted' : 'complete'
      notice.value =
        kind === 'abort'
          ? 'Original branch restored in the example.'
          : 'The persistence commit was skipped in the example.'
      operation.value = null
    },
  }
}
async function moveFile(delta: number) {
  const position = visible.value.findIndex((f) => f.index === selected.value)
  const next = visible.value[Math.max(0, Math.min(visible.value.length - 1, position + delta))]
  if (!next) return
  selected.value = next.index
  await nextTick()
  list.value?.querySelector<HTMLElement>(`[data-index="${next.index}"]`)?.focus()
}
</script>
<template>
  <main class="ichi-shell native-conflicts-lab">
    <header class="topbar">
      <div class="repo-context">
        <span class="repo-name">atlas</span><PhCaretDown :size="12" /><span class="repo-divider"
          >/</span
        ><span class="repo-branch"><PhGitBranch :size="16" />feature/session</span
        ><span class="repo-dirty"
          ><i />
          {{
            phase === 'paused' ? 'rebase paused' : phase === 'complete' ? 'clean' : 'rebase aborted'
          }}</span
        >
      </div>
      <div class="titlebar-search ui-control size-lg">
        <PhMagnifyingGlass :size="16" /><UiInput
          v-model="filter"
          size="lg"
          aria-label="Filter conflict files"
          placeholder="Filter conflict files…"
        />
      </div>
      <div class="topbar-actions">
        <select v-model="theme" class="ui-field size-sm native-theme" aria-label="Preview theme">
          <option v-for="t in THEMES" :key="t.id" :value="t.id">{{ t.label }}</option></select
        ><UiIconButton label="Reset example" size="sm" @click="reset"
          ><PhArrowCounterClockwise :size="16"
        /></UiIconButton>
      </div>
    </header>
    <div class="body-shell">
      <section class="main-island">
        <header class="island-header">
          <nav class="primary-nav" aria-label="Application preview">
            <button
              v-for="item in ['Graph', 'Changes', 'Branches', 'Stash', 'Profiles']"
              :key="item"
              disabled
              title="Conflicts-only sandbox preview"
            >
              {{ item }}</button
            ><button aria-current="page">Conflicts<span>x</span></button>
          </nav>
          <div class="native-header-tools">
            <span>Workspace preview</span
            ><UiIconButton
              label="Toggle operation details"
              size="sm"
              :aria-expanded="inspector"
              @click="inspector = !inspector"
              ><PhSidebarSimple :size="16"
            /></UiIconButton>
          </div>
        </header>
        <div v-if="notice" class="native-notice" role="status">
          <PhCheck :size="14" />{{ notice }}
        </div>
        <template v-if="phase === 'paused'">
          <div class="native-operation-strip">
            <PhWarningCircle :size="16" /><strong>Rebase paused</strong
            ><span class="native-divider">/</span
            ><RefLabel name="feature/session" kind="branch" /><PhArrowRight :size="12" /><RefLabel
              name="main"
              kind="branch"
            /><span class="native-spacer" /><span>Commit 3 of 5</span
            ><span class="native-divider">·</span
            ><span>{{ files.length - staged }} unresolved</span>
          </div>
          <div class="native-workspace" :class="{ 'without-inspector': !inspector }">
            <aside
              ref="list"
              class="native-files changes-left"
              aria-label="Conflict files"
              @keydown.down.prevent="moveFile(1)"
              @keydown.up.prevent="moveFile(-1)"
              @keydown.j.prevent="moveFile(1)"
              @keydown.k.prevent="moveFile(-1)"
            >
              <div class="changes-section">
                <span><PhCaretDown :size="12" /> Conflicts</span
                ><span>{{ files.length - staged }}</span>
              </div>
              <div class="native-folder"><PhCaretDown :size="11" /><span>src / auth</span></div>
              <button
                v-for="entry in visible"
                :key="entry.file.path"
                class="native-file-row"
                :class="{ selected: selected === entry.index }"
                :aria-current="selected === entry.index ? 'true' : undefined"
                :data-index="entry.index"
                @click="selected = entry.index"
              >
                <PhCheck v-if="entry.file.staged" :size="14" class="native-positive" /><PhFileCode
                  v-else
                  :size="14"
                /><span>{{ entry.file.path.split('/').pop() }}</span
                ><small :class="{ resolved: entry.file.staged }">{{
                  entry.file.staged ? '✓' : entry.file.kind === 'deleted' ? 'DU' : 'UU'
                }}</small>
              </button>
              <p v-if="!visible.length" class="native-empty">No files match “{{ filter }}”.</p>
              <div class="native-file-summary">
                <span>{{ staged }} staged</span><span>{{ files.length - staged }} remaining</span>
              </div>
              <div class="native-left-foot">
                <PhClockCounterClockwise :size="14" /><span
                  >Recovery point <code>f52cd09</code></span
                >
              </div>
            </aside>
            <section class="native-editor">
              <header class="diff-file-head">
                <PhFileCode :size="16" /><span class="diff-file-path">{{ file.path }}</span
                ><span class="native-spacer" /><span class="native-file-kind">{{
                  file.kind === 'deleted' ? 'Deleted / modified' : 'Both modified'
                }}</span
                ><UiButton
                  size="sm"
                  variant="ghost"
                  :active="showBase"
                  :aria-pressed="showBase"
                  @click="showBase = !showBase"
                  >Base</UiButton
                >
              </header>
              <div class="native-editor-scroll">
                <div v-if="showBase" class="native-base">
                  <header>Common ancestor</header>
                  <pre>{{ file.base }}</pre>
                </div>
                <div class="native-hunk-bar">
                  <code
                    >@@
                    {{
                      file.kind === 'deleted'
                        ? 'file deleted on main'
                        : `-1,${file.base.split('\n').length} +1,${file.incoming.split('\n').length}`
                    }}
                    @@</code
                  ><span>Conflict 1 of 1</span>
                </div>
                <div class="native-comparison">
                  <section
                    v-for="side in ['main', 'commit'] as const"
                    :key="side"
                    class="native-version"
                    :class="side"
                  >
                    <header>
                      <div>
                        <RefLabel
                          :name="side === 'main' ? 'main' : 'c72f8a6'"
                          :kind="side === 'main' ? 'branch' : 'head'"
                          :color-var="side === 'main' ? '--cyan' : '--green'"
                        /><small>{{ side === 'main' ? 'Target branch' : 'Replayed commit' }}</small>
                      </div>
                      <UiButton
                        size="sm"
                        variant="ghost"
                        :active="
                          file.choice === side || (side === 'main' && file.choice === 'delete')
                        "
                        @click="
                          choose(side === 'main' && file.kind === 'deleted' ? 'delete' : side)
                        "
                        >{{
                          side === 'main'
                            ? file.kind === 'deleted'
                              ? 'Keep deletion'
                              : 'Use main'
                            : file.kind === 'deleted'
                              ? 'Keep file'
                              : 'Use commit'
                        }}</UiButton
                      >
                    </header>
                    <div v-if="side === 'main' && file.kind === 'deleted'" class="native-deletion">
                      File deleted on main.<small>Replaced by the session storage adapter.</small>
                    </div>
                    <div v-else class="native-code">
                      <div
                        v-for="(line, index) in (side === 'main'
                          ? file.target
                          : file.incoming
                        ).split('\n')"
                        :key="index"
                        :class="{
                          changed:
                            file.kind === 'deleted' ||
                            (index > 0 &&
                              index <
                                (side === 'main' ? file.target : file.incoming).split('\n').length -
                                  1),
                        }"
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
                    ><span class="native-result-state" :class="{ staged: file.staged }">{{
                      file.staged
                        ? 'Resolved & staged'
                        : file.choice
                          ? 'Edited · unstaged'
                          : 'Unresolved'
                    }}</span
                    ><span class="native-spacer" /><UiButton
                      v-if="file.kind === 'text'"
                      size="sm"
                      @click="choose('combined')"
                      >{{ selected === 0 ? 'Combine changes' : 'Keep both tests' }}</UiButton
                    >
                  </header>
                  <div
                    v-if="file.kind === 'deleted' && file.choice === 'delete'"
                    class="native-deletion native-positive"
                  >
                    <PhCheck :size="20" /> Keep the file deleted.
                  </div>
                  <div v-else class="native-result-body">
                    <div class="native-line-gutter" aria-hidden="true">
                      <span v-for="n in Math.max(9, file.result.split('\n').length)" :key="n">{{
                        n
                      }}</span>
                    </div>
                    <textarea
                      v-model="file.result"
                      aria-label="Resolved file contents"
                      wrap="off"
                      spellcheck="false"
                      placeholder="Choose a version above, combine the example changes, or edit the result here."
                      @input="edited"
                    />
                  </div>
                </section>
              </div>
              <footer class="native-editor-footer">
                <span>{{
                  file.staged
                    ? 'Editing will unstage this file.'
                    : 'Review the result before staging.'
                }}</span
                ><UiButton variant="primary" :disabled="!canStage" @click="stage"
                  ><PhCheck :size="14" /> Save and stage <PhArrowRight :size="14"
                /></UiButton>
              </footer>
            </section>
            <aside v-if="inspector" class="native-inspector">
              <header><PhGitBranch :size="15" /><strong>Rebase</strong><span>3 / 5</span></header>
              <section class="native-current-commit">
                <p class="native-label">Applying commit</p>
                <code>c72f8a6</code>
                <h3>Persist sessions without secrets</h3>
                <p>Alex Lee <span>· 14 minutes ago</span></p>
              </section>
              <div class="native-steps">
                <p class="native-label">Replay progress</p>
                <div
                  v-for="(step, index) in steps"
                  :key="step.id"
                  class="native-step"
                  :class="{ current: index === 2, done: index < 2 }"
                >
                  <PhCheck v-if="index < 2" :size="13" /><PhWarningCircle
                    v-else-if="index === 2"
                    :size="13"
                  /><PhGitCommit v-else :size="13" />
                  <div>
                    <span>{{ step.title }}</span
                    ><code>{{ step.id }}{{ index === 2 ? ' · conflicts' : '' }}</code>
                  </div>
                </div>
              </div>
              <div class="native-inspector-note">
                <strong>{{
                  staged === files.length ? 'Ready to continue' : 'Resolve, stage, continue'
                }}</strong>
                <p>
                  {{
                    staged === files.length
                      ? 'All files are staged. Continue to replay the remaining commits.'
                      : 'Resolve each file and stage the result. The rebase will resume from this commit.'
                  }}
                </p>
              </div>
              <div class="native-inspector-actions">
                <UiButton
                  block
                  variant="primary"
                  :disabled="staged !== files.length"
                  @click="continueRebase"
                  >Continue rebase <PhArrowRight :size="14"
                /></UiButton>
                <div>
                  <UiButton size="sm" variant="ghost" @click="confirm('skip')"
                    >Skip commit…</UiButton
                  ><UiButton size="sm" variant="ghost" @click="confirm('abort')">Abort…</UiButton>
                </div>
              </div>
            </aside>
          </div>
          <div v-if="!inspector" class="native-collapsed-actions">
            <UiButton size="sm" variant="ghost" @click="confirm('abort')">Abort rebase…</UiButton
            ><UiButton size="sm" variant="ghost" @click="confirm('skip')">Skip commit…</UiButton
            ><span class="native-spacer" /><UiButton
              variant="primary"
              :disabled="staged !== files.length"
              @click="continueRebase"
              >Continue rebase <PhArrowRight :size="14"
            /></UiButton>
          </div>
        </template>
        <div v-else class="native-finished">
          <PhCheck v-if="phase === 'complete'" :size="30" /><PhArrowCounterClockwise
            v-else
            :size="30"
          />
          <h2>{{ phase === 'complete' ? 'Rebase complete' : 'Rebase aborted' }}</h2>
          <p>
            {{
              phase === 'complete'
                ? 'The sample branch is ready for review.'
                : 'The sample branch is back at its recovery point.'
            }}
          </p>
          <UiButton @click="reset">Restart example</UiButton>
        </div>
      </section>
    </div>
    <footer class="modeline">
      <span class="ml-mode">ichi</span><span class="native-divider">/</span
      ><span>{{ phase === 'paused' ? 'REBASE' : 'NORMAL' }}</span
      ><span class="ml-space" /><span class="native-modeline-hints"
        >j/k files · edit result · stage to continue</span
      ><span class="native-divider">/</span><a href="/operations-lab.html">Other designs</a
      ><span class="native-divider">/</span><span>Sandbox · sample data</span>
    </footer>
    <OperationConfirmModal v-if="operation" :request="operation" @close="operation = null" />
  </main>
</template>
<style src="./conflicts-app.css"></style>
