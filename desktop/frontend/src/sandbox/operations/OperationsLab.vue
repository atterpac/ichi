<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  PhGitBranch,
  PhGitCommit,
  PhArrowRight,
  PhArrowCounterClockwise,
  PhCheck,
  PhWarningCircle,
  PhFileCode,
  PhClockCounterClockwise,
  PhCaretUp,
  PhCaretDown,
  PhSun,
  PhMoon,
} from '@phosphor-icons/vue'
import ConflictAlternatives from './ConflictAlternatives.vue'
import OperationLabConfirm from './OperationLabConfirm.vue'
import { conflictFixtures, planFixtures, recoveryEvents } from './fixtures'
const flow = ref<'resolve' | 'plan' | 'recover'>('resolve')
const light = ref(false)
const designs = [
  {
    id: 'compare',
    title: 'Comparison desk',
    description: 'Both versions above, editable result below.',
  },
  {
    id: 'focus',
    title: 'Result first',
    description: 'A spacious editor with reference versions on the side.',
  },
  {
    id: 'inline',
    title: 'Inline decisions',
    description: 'Read the conflict vertically, then write the resolution.',
  },
  {
    id: 'board',
    title: 'Resolution board',
    description: 'See the whole queue and open a file to finish it.',
  },
] as const
const requestedDesign = new URLSearchParams(window.location.search).get('layout')
const design = ref<(typeof designs)[number]['id']>(
  designs.find((d) => d.id === requestedDesign)?.id || 'compare',
)
const designNote = computed(() => designs.find((d) => d.id === design.value)!.description)
function editResult(value: string) {
  file.value.result = value
  edited()
}

const files = ref(conflictFixtures())
const selected = ref(0)
const file = computed(() => files.value[selected.value]!)
const showBase = ref(false)
const staged = computed(() => files.value.filter((f) => f.staged).length)
const allStaged = computed(() => staged.value === files.value.length)
const phase = ref<'conflict' | 'complete' | 'aborted'>('conflict')
const notice = ref('')
const plan = ref(planFixtures())
const inspected = ref('c72f8a6')
const planCommit = computed(() => plan.value.find((c) => c.id === inspected.value)!)
const activeCommits = computed(() => plan.value.filter((c) => c.action !== 'drop'))
const outputCount = computed(() => activeCommits.value.filter((c) => c.action !== 'fixup').length)
const invalidPlan = computed(
  () =>
    !activeCommits.value.length ||
    activeCommits.value[0]?.action === 'fixup' ||
    activeCommits.value.some((c) => !c.title.trim()),
)
const runningPlan = ref(planFixtures())
const stoppedIndex = computed(() => runningPlan.value.findIndex((c) => c.id === 'c72f8a6'))
const runningCount = computed(() => runningPlan.value.length)
const recoveryId = ref('before')
const recovery = computed(() => recoveryEvents.find((e) => e.id === recoveryId.value)!)
const branchName = ref('recovery/session-before-rebase')
const recovered = ref('')
const branch = ref('feature/session')
const skipped = ref(false)
const confirmation = ref<'abort' | 'skip' | null>(null)

const canStage = computed(
  () =>
    !!file.value.choice &&
    !file.value.staged &&
    !/^(<<<<<<<|=======|>>>>>>>)/m.test(file.value.result),
)
function navigate(next: typeof flow.value) {
  flow.value = next
  notice.value = ''
}
function selectFile(index: number) {
  selected.value = index
  notice.value = ''
}
function choose(choice: string) {
  const f = file.value
  f.choice = choice
  f.staged = false
  f.result =
    choice === 'main' || choice === 'delete'
      ? f.target
      : choice === 'combined'
        ? f.combined
        : f.incoming
  notice.value = ''
}
function clearDecision() {
  file.value.result = ''
  file.value.choice = ''
  file.value.staged = false
}
function selectRecovery(id: string) {
  recoveryId.value = id
  recovered.value = ''
  notice.value = ''
}
function openRecovered() {
  branch.value = recovered.value
  notice.value = 'Switched to the recovery branch in the example.'
}
function edited() {
  file.value.choice = 'manual'
  file.value.staged = false
}
function stage() {
  if (!canStage.value) return
  file.value.staged = true
  notice.value = `${file.value.path} staged in the example.`
  const next = files.value.findIndex((f) => !f.staged)
  if (next >= 0) selected.value = next
}
function continueRebase() {
  if (!allStaged.value) return
  phase.value = 'complete'
  notice.value = 'Remaining commits replayed successfully.'
}
function startRebase() {
  runningPlan.value = structuredClone(
    activeCommits.value.map((c) => ({ ...c, files: [...c.files] })),
  )
  files.value = conflictFixtures()
  selected.value = 0
  skipped.value = false
  phase.value = runningPlan.value.some((c) => c.id === 'c72f8a6') ? 'conflict' : 'complete'
  navigate('resolve')
  if (phase.value === 'complete') notice.value = 'The selected commits replayed without conflicts.'
}
function move(index: number, direction: number) {
  const target = index + direction
  if (target < 0 || target >= plan.value.length) return
  const item = plan.value.splice(index, 1)[0]!
  plan.value.splice(target, 0, item)
}
function confirmOperation() {
  if (confirmation.value === 'abort') {
    phase.value = 'aborted'
    notice.value = 'Returned feature/session to its recovery point.'
  } else {
    phase.value = 'complete'
    skipped.value = true
    notice.value = 'Skipped “Persist sessions without secrets”; remaining commits replayed.'
  }
  confirmation.value = null
}
function recover() {
  const name = branchName.value.trim()
  if (
    !name ||
    /[\s~^:?*[\\]/.test(name) ||
    name.startsWith('-') ||
    name.includes('..') ||
    name.includes('//') ||
    name.includes('@{') ||
    name.split('/').some((p) => !p || p.startsWith('.') || p.endsWith('.') || p.endsWith('.lock'))
  ) {
    notice.value = 'Enter a branch name such as recovery/session.'
    return
  }
  if (name === branch.value) {
    notice.value = 'Choose a new branch name.'
    return
  }
  recovered.value = name
  notice.value = `Created ${name} at ${recovery.value.hash} in the example.`
}
function reset() {
  files.value = conflictFixtures()
  selected.value = 0
  phase.value = 'conflict'
  plan.value = planFixtures()
  runningPlan.value = planFixtures()
  inspected.value = 'c72f8a6'
  showBase.value = false
  confirmation.value = null
  recovered.value = ''
  branch.value = 'feature/session'
  recoveryId.value = 'before'
  branchName.value = 'recovery/session-before-rebase'
  skipped.value = false
  notice.value = ''
}
</script>

<template>
  <div class="operations-lab" :class="{ light }">
    <header class="lab-header">
      <a class="wordmark" href="/operations-lab.html">ichi<span> / operations lab</span></a>
      <div class="lab-tools">
        <span class="sample-label"><i /> Interactive sample</span
        ><button @click="reset"><PhArrowCounterClockwise :size="14" /> Reset</button
        ><button :aria-label="light ? 'Use dark theme' : 'Use light theme'" @click="light = !light">
          <component :is="light ? PhMoon : PhSun" :size="16" />
        </button>
      </div>
    </header>
    <div class="lab-intro">
      <div>
        <p class="eyebrow">A way through the difficult bits</p>
        <h1>Keep your place. Finish the operation.</h1>
        <p>
          Three connected examples for resolving conflicts, rewriting history, and finding your way
          back.
        </p>
      </div>
      <span class="local-note">Sample data only<br />Changes reset on reload</span>
    </div>
    <nav class="flow-nav" aria-label="Example flows">
      <button :aria-current="flow === 'resolve' ? 'page' : undefined" @click="navigate('resolve')">
        <span>01</span>
        <div><b>Resolve a conflict</b><small>Compare → edit → stage → continue</small></div>
      </button>
      <button :aria-current="flow === 'plan' ? 'page' : undefined" @click="navigate('plan')">
        <span>02</span>
        <div><b>Plan a rebase</b><small>Arrange → preview → replay</small></div>
      </button>
      <button :aria-current="flow === 'recover' ? 'page' : undefined" @click="navigate('recover')">
        <span>03</span>
        <div><b>Recover your work</b><small>Find → inspect → create a branch</small></div>
      </button>
    </nav>
    <div v-if="flow === 'resolve'" class="native-design-link"><a href="/conflicts-app-lab.html">Open the in-app design ↗</a><span>Actual Ichi shell, themes, and controls</span></div>
    <section v-if="flow === 'resolve'" class="resolve-designs" aria-label="Conflict layout designs">
      <div class="design-switch">
        <span>RESOLUTION LAYOUT</span>
        <nav aria-label="Resolution layout">
          <button
            v-for="(option, index) in designs"
            :key="option.id"
            :aria-pressed="design === option.id"
            @click="design = option.id"
          >
            <small>{{ String(index + 1).padStart(2, '0') }}</small
            >{{ option.title }}
          </button>
        </nav>
      </div>
      <p>{{ designNote }} <span>Your edits carry across layouts.</span></p>
    </section>
    <main class="app-window">
      <header class="repo-bar">
        <span class="repo-name">◈ &nbsp; atlas</span><span class="divider">/</span
        ><span><PhGitBranch :size="15" /> {{ branch }}</span
        ><span class="repo-spacer" /><span class="quiet">Work workspace</span
        ><span class="avatar">AL</span>
      </header>
      <div v-if="notice" class="notice" role="status">{{ notice }}</div>
      <template v-if="flow === 'resolve'">
        <section v-if="phase === 'conflict'" class="operation-banner">
          <div class="operation-icon"><PhWarningCircle :size="22" /></div>
          <div>
            <h2>Rebase paused. Three files need your attention.</h2>
            <p>
              Replaying <code>c72f8a6</code> onto <code>main</code> · Persist sessions without
              secrets
            </p>
          </div>
          <div class="operation-step">
            <span>COMMIT {{ stoppedIndex + 1 }} OF {{ runningCount }}</span>
            <div class="step-dots">
              <i
                v-for="n in runningCount"
                :key="n"
                :class="{ done: n <= stoppedIndex, current: n === stoppedIndex + 1 }"
              />
            </div>
          </div>
        </section>
        <div
          v-if="phase === 'conflict'"
          class="resolve-workspace"
          :class="{ 'board-workspace': design === 'board' }"
        >
          <aside v-if="design !== 'board'" class="file-list">
            <div class="panel-heading">
              <span>Conflict files</span><small>{{ staged }}/{{ files.length }} staged</small>
            </div>
            <button
              v-for="(f, index) in files"
              :key="f.path"
              class="file-item"
              :aria-current="selected === index ? 'true' : undefined"
              @click="selectFile(index)"
            >
              <PhCheck v-if="f.staged" :size="16" class="green" /><PhWarningCircle
                v-else
                :size="16"
                class="amber"
              />
              <div>
                <strong>{{ f.path.split('/').pop() }}</strong
                ><small>{{
                  f.staged
                    ? 'Resolved & staged'
                    : f.choice
                      ? 'Ready to stage'
                      : f.kind === 'deleted'
                        ? 'Deleted / modified'
                        : 'Both modified'
                }}</small>
              </div>
            </button>
            <div class="sidebar-note">
              <b>Your progress stays here.</b>
              <p>Move between files freely. Editing a staged result puts it back into review.</p>
            </div>
            <div class="recovery-anchor">
              <PhClockCounterClockwise :size="16" />
              <div>
                Recovery point saved<code>f52cd09 · before rebase</code
                ><button class="text-button" @click="navigate('recover')">
                  Inspect recovery point ↗
                </button>
              </div>
            </div>
          </aside>
          <section v-if="design === 'compare'" class="resolution">
            <header class="file-heading">
              <div>
                <h3><PhFileCode :size="17" /> {{ file.path }}</h3>
                <p>{{ file.note }}</p>
              </div>
              <button :aria-pressed="showBase" @click="showBase = !showBase">
                {{ showBase ? 'Hide base' : 'Show base' }}
              </button>
            </header>
            <div v-if="showBase" class="base-code">
              <span>Common ancestor</span>
              <pre>{{ file.base }}</pre>
            </div>
            <div class="comparison">
              <section class="source-pane">
                <header>
                  <div><i class="source-dot target" /><b>main</b><small>Target branch</small></div>
                  <button
                    :aria-pressed="file.choice === 'main' || file.choice === 'delete'"
                    @click="choose(file.kind === 'deleted' ? 'delete' : 'main')"
                  >
                    {{ file.kind === 'deleted' ? 'Keep deletion' : 'Use main' }}
                  </button>
                </header>
                <pre
                  v-if="file.kind === 'text'"
                ><code v-for="(line,i) in file.target.split('\n')" :key="i"><span>{{ i + 1 }}</span>{{ line }}
</code></pre>
                <div v-else class="deleted-file">
                  This file was removed on main.<small>The new storage adapter replaces it.</small>
                </div>
              </section>
              <section class="source-pane incoming">
                <header>
                  <div>
                    <i class="source-dot patch" /><b>c72f8a6</b><small>Commit being replayed</small>
                  </div>
                  <button :aria-pressed="file.choice === 'commit'" @click="choose('commit')">
                    {{ file.kind === 'deleted' ? 'Keep file' : 'Use commit' }}
                  </button>
                </header>
                <pre><code v-for="(line,i) in file.incoming.split('\n')" :key="i"><span>{{ i + 1 }}</span>{{ line }}
</code></pre>
              </section>
            </div>
            <section class="result-pane">
              <header>
                <div>
                  <b>Result</b
                  ><span class="result-badge" :class="{ green: file.staged }">{{
                    file.staged ? 'Staged' : file.choice ? 'Edited · unstaged' : 'Needs a decision'
                  }}</span>
                </div>
                <div>
                  <button v-if="file.kind === 'text'" @click="choose('combined')">
                    {{ selected === 0 ? 'Combine changes' : 'Keep both tests' }}</button
                  ><button v-if="file.choice" @click="clearDecision">Clear decision</button>
                </div>
              </header>
              <div
                v-if="file.kind === 'deleted' && file.choice === 'delete'"
                class="deletion-result"
              >
                <PhCheck :size="20" /> This file will remain deleted.
              </div>
              <textarea
                v-else
                v-model="file.result"
                aria-label="Resolved file contents"
                spellcheck="false"
                :placeholder="
                  file.kind === 'deleted'
                    ? 'Choose whether to keep or delete this file.'
                    : 'Choose a version above, combine the example changes, or write the result here.'
                "
                @input="edited"
              />
              <footer>
                <span>{{
                  file.choice
                    ? 'Review this result before staging.'
                    : 'Nothing is staged until you choose Save and stage.'
                }}</span
                ><button class="primary" :disabled="!canStage" @click="stage">
                  <PhCheck :size="14" /> Save and stage <PhArrowRight :size="14" />
                </button>
              </footer>
            </section>
          </section>
          <ConflictAlternatives
            v-else
            :design="design"
            :file="file"
            :files="files"
            :selected="selected"
            :can-stage="canStage"
            @choose="choose"
            @edit="editResult"
            @clear="clearDecision"
            @stage="stage"
            @select="selectFile"
          />
        </div>
        <section v-else class="completion">
          <div class="completion-icon">
            <component :is="phase === 'complete' ? PhCheck : PhArrowCounterClockwise" :size="30" />
          </div>
          <p class="eyebrow">
            {{ phase === 'complete' ? 'Back in flow' : 'Back where you started' }}
          </p>
          <h2>
            {{
              phase === 'complete' ? 'Your rebase is complete.' : 'Rebase aborted. Work restored.'
            }}
          </h2>
          <p>
            {{
              phase === 'aborted'
                ? 'feature/session points to f52cd09 again. The example conflict resolutions were discarded.'
                : skipped
                  ? 'The conflicted commit was skipped. Review the resulting history before pushing.'
                  : 'The remaining commits have been replayed onto main. Your working tree is clean.'
            }}
          </p>
          <div class="completion-details">
            <span><PhGitBranch :size="16" /> feature/session</span
            ><span>{{
              phase === 'complete'
                ? (skipped ? runningCount - 1 : runningCount) + ' commits processed'
                : 'Original history retained'
            }}</span>
          </div>
          <div class="completion-actions">
            <button @click="navigate('recover')">Inspect recovery point</button
            ><button class="primary" @click="navigate('plan')">
              Try a rebase plan <PhArrowRight :size="14" />
            </button>
          </div>
        </section>
        <footer v-if="phase === 'conflict'" class="operation-footer">
          <button class="danger-text" @click="confirmation = 'abort'">Abort rebase…</button
          ><button @click="confirmation = 'skip'">Skip this commit…</button
          ><span class="repo-spacer" /><span>{{
            allStaged
              ? 'All conflicts staged. Ready to continue.'
              : `${files.length - staged} files still need resolution`
          }}</span
          ><button class="primary" :disabled="!allStaged" @click="continueRebase">
            Continue rebase <PhArrowRight :size="15" />
          </button>
        </footer>
      </template>
      <template v-else-if="flow === 'plan'">
        <header class="page-heading">
          <div>
            <p class="eyebrow">Interactive rebase</p>
            <h2>Give this branch a clearer story.</h2>
            <p>
              Replay <code>feature/session</code> onto <code>main</code>. Arrange commits in the
              order they should apply.
            </p>
          </div>
          <span class="pill">5 original commits</span>
        </header>
        <div class="plan-layout">
          <section>
            <div class="panel-heading">
              <span>Replay order · oldest first</span><small>Use arrows to reorder</small>
            </div>
            <div
              v-for="(commit, index) in plan"
              :key="commit.id"
              class="plan-row"
              :class="{ inspected: inspected === commit.id, dropped: commit.action === 'drop' }"
            >
              <span class="sequence-number">{{ index + 1 }}</span>
              <div class="reorder">
                <button
                  :aria-label="`Move ${commit.id} earlier`"
                  :disabled="index === 0"
                  @click="move(index, -1)"
                >
                  <PhCaretUp :size="12" /></button
                ><button
                  :aria-label="`Move ${commit.id} later`"
                  :disabled="index === plan.length - 1"
                  @click="move(index, 1)"
                >
                  <PhCaretDown :size="12" />
                </button>
              </div>
              <select v-model="commit.action" :aria-label="`Action for ${commit.id}`">
                <option value="pick">Pick</option>
                <option value="reword">Reword</option>
                <option value="fixup">Fixup</option>
                <option value="drop">Drop</option></select
              ><button
                class="commit-select"
                :aria-pressed="inspected === commit.id"
                @click="inspected = commit.id"
              >
                <strong>{{ commit.title }}</strong
                ><code>{{ commit.id }} <span>· Alex Lee</span></code>
              </button>
            </div>
            <p class="plan-help">
              Fixup folds a commit into the previous retained commit and keeps that commit’s
              message. Drop leaves it out of the new history.
            </p>
            <p v-if="invalidPlan" role="alert" class="amber">
              Keep at least one commit with a message, and start with Pick or Reword.
            </p>
          </section>
          <aside class="plan-inspector">
            <p class="eyebrow">Selected commit</p>
            <h3>{{ planCommit.title }}</h3>
            <code>{{ planCommit.id }}</code
            ><label v-if="planCommit.action === 'reword'" class="reword-field"
              >New commit message<textarea
                v-model="planCommit.title"
                aria-label="New commit message"
              />
            </label>
            <p v-else>
              {{
                planCommit.action === 'drop'
                  ? 'This commit will be omitted.'
                  : planCommit.action === 'fixup'
                    ? 'These changes will be folded into the previous retained commit.'
                    : 'This commit will be replayed with its current message.'
              }}
            </p>
            <h4>Changed files</h4>
            <div v-for="path in planCommit.files" :key="path" class="changed-file">
              <PhFileCode :size="14" /> {{ path }}
            </div>
            <div class="history-preview">
              <h4>Proposed history · {{ outputCount }} commits</h4>
              <div class="history-node base-node">
                <i /><span>main <code>28d430a</code></span>
              </div>
              <div
                v-for="c in activeCommits"
                :key="c.id"
                class="history-node"
                :class="{ folded: c.action === 'fixup' }"
              >
                <i /><span>{{ c.action === 'fixup' ? '↳ ' : '' }}{{ c.title }}</span>
              </div>
            </div>
          </aside>
        </div>
        <footer class="operation-footer">
          <PhClockCounterClockwise :size="17" /><span
            >A recovery point will be saved before starting.</span
          ><span class="repo-spacer" /><small>{{ outputCount }} resulting commits</small
          ><button class="primary" :disabled="invalidPlan" @click="startRebase">
            Start example rebase <PhArrowRight :size="15" />
          </button>
        </footer>
      </template>
      <template v-else>
        <header class="page-heading">
          <div>
            <p class="eyebrow">Recovery history</p>
            <h2>Your work has a way back.</h2>
            <p>Inspect an earlier state and recover it into a new branch.</p>
          </div>
          <span class="pill"><PhClockCounterClockwise :size="14" /> Local history</span>
        </header>
        <div class="recovery-layout">
          <aside class="timeline">
            <p class="eyebrow">Today · feature/session</p>
            <button
              v-for="event in recoveryEvents"
              :key="event.id"
              :aria-current="recoveryId === event.id ? 'true' : undefined"
              @click="selectRecovery(event.id)"
            >
              <span class="timeline-time">{{ event.time }}</span
              ><i />
              <div>
                <strong>{{ event.label }}</strong>
                <p>{{ event.title }}</p>
                <code>{{ event.hash }}</code>
              </div>
            </button>
            <p class="timeline-note">
              Recovery points make history changes easier to revisit. This timeline is a sample of
              local Git activity.
            </p>
          </aside>
          <section class="recovery-detail">
            <div class="section-title">
              <span class="recovery-symbol"><PhGitCommit :size="24" /></span>
              <div>
                <p class="eyebrow">{{ recovery.label }}</p>
                <h3>{{ recovery.title }}</h3>
              </div>
              <code>{{ recovery.hash }}</code>
            </div>
            <p>{{ recovery.note }}</p>
            <div class="recovery-stats">
              <div>
                <strong>{{ recovery.count }}</strong
                ><span>commits ahead of main</span>
              </div>
              <div>
                <strong>{{ recovery.files.length }}</strong
                ><span>files in this preview</span>
              </div>
            </div>
            <h4>Files at this point</h4>
            <div v-for="path in recovery.files" :key="path" class="recovery-file">
              <PhFileCode :size="16" /><code>{{ path }}</code
              ><span>Available</span>
            </div>
            <form v-if="!recovered" class="recover-form" @submit.prevent="recover">
              <h3>Recover into a new branch</h3>
              <p>Your current branch and working files stay where they are.</p>
              <label
                >Branch name<input
                  v-model="branchName"
                  required
                  aria-label="Recovery branch name" /></label
              ><button class="primary" type="submit">
                Create recovery branch <PhArrowRight :size="15" />
              </button>
            </form>
            <div v-else class="recovered-card">
              <PhCheck :size="22" />
              <div>
                <h3>Recovered into {{ recovered }}</h3>
                <p>
                  Created at {{ recovery.hash }}.
                  {{
                    branch === recovered
                      ? 'You are now viewing this branch in the example.'
                      : 'Your current branch is unchanged.'
                  }}
                </p>
                <button
                  v-if="branch !== recovered"
                  :disabled="phase === 'conflict'"
                  @click="openRecovered"
                >
                  Open recovered branch
                </button>
                <p v-if="phase === 'conflict'">
                  Finish or abort the active rebase before switching branches.
                </p>
              </div>
            </div>
          </section>
        </div>
      </template>
      <footer class="app-status">
        <span><i /> Local example</span><span>No Git commands or filesystem changes</span>
      </footer>
    </main>
    <section class="flow-notes">
      <span>TRY THIS</span>
      <p v-if="flow === 'resolve'">
        Combine the session changes, keep both tests, and keep the legacy file deleted. Stage each
        result, then continue. Or explore the skip and abort paths.
      </p>
      <p v-else-if="flow === 'plan'">
        Change a commit to Reword, move it earlier, or drop it. Starting the plan connects to the
        conflict example when the persistence commit is included.
      </p>
      <p v-else>
        Pick an earlier point, name a recovery branch, and open it. The original branch stays
        available.
      </p>
    </section>
    <OperationLabConfirm
      v-if="confirmation"
      :kind="confirmation"
      @close="confirmation = null"
      @confirm="confirmOperation"
    />
  </div>
</template>
<style src="./operations.css"></style>
<style src="./conflict-alternatives.css"></style>
