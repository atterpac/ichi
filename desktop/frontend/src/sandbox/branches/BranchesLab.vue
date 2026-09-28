<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import {
  commits,
  sampleBranches,
  comparison,
  fileChanges,
  history,
  type SampleBranch,
} from './sampleBranches'
const designs = [
  {
    id: 'desk',
    name: 'Branch desk',
    note: 'Browse quietly. Inspect deeply.',
    description:
      'A compact list with a generous branch preview. Move through branches without leaving your place.',
  },
  {
    id: 'compare',
    name: 'Compare bench',
    note: 'Two branches. One clear direction.',
    description:
      'Choose the branch you want to inspect and its baseline. Unique commits and file differences stay side by side.',
  },
  {
    id: 'map',
    name: 'Branch map',
    note: 'See where the work diverges.',
    description:
      'A branch list on the left, ancestry above, and the selected branch’s changes below. Select from either the list or map.',
  },
] as const
const design = ref<(typeof designs)[number]['id']>('map')
const branches = ref(sampleBranches())
const selectedName = ref('feature/cursor-review')
const targetName = ref('main')
const currentName = ref('main')
const filter = ref('Local')
const query = ref('')
const sort = ref('Pinned first')
const tab = ref('Files')
const file = ref('')
const line = ref(0)
const notice = ref('')
const operation = ref<'Checkout' | 'Merge' | 'Rebase' | null>(null)
const search = ref<HTMLInputElement>()
const list = ref<HTMLElement>()
const preview = ref<HTMLElement>()
const dialog = ref<HTMLElement>()
let previousFocus: HTMLElement | null = null
const selected = computed(() => branches.value.find((b) => b.name === selectedName.value)!)
const target = computed(() => branches.value.find((b) => b.name === targetName.value)!)
const pair = computed(() => comparison(selected.value, target.value))
const changes = computed(() => fileChanges(selected.value, target.value))
const totals = computed(() =>
  changes.value.reduce((a, f) => ({ added: a.added + f.added, removed: a.removed + f.removed }), {
    added: 0,
    removed: 0,
  }),
)
const visible = computed(() =>
  branches.value
    .filter(
      (b) =>
        (filter.value === 'All' || (filter.value === 'Remote' ? b.remote : !b.remote)) &&
        b.name.toLowerCase().includes(query.value.toLowerCase()),
    )
    .sort((a, b) =>
      sort.value === 'Name'
        ? a.name.localeCompare(b.name)
        : sort.value === 'Recent activity'
          ? age(a.activity) - age(b.activity)
          : Number(b.name === currentName.value) - Number(a.name === currentName.value) ||
            Number(b.pinned) - Number(a.pinned) ||
            age(a.activity) - age(b.activity),
    ),
)
const openedFile = computed(() => changes.value.find((f) => f.path === file.value))
const diffLines = computed(() => {
  const f = openedFile.value
  if (!f) return []
  let start = 0
  while (start < f.before.length && start < f.after.length && f.before[start] === f.after[start])
    start++
  let end = 0
  while (
    end < f.before.length - start &&
    end < f.after.length - start &&
    f.before[f.before.length - 1 - end] === f.after[f.after.length - 1 - end]
  )
    end++
  return [
    ...f.before
      .slice(0, start)
      .map((text, i) => ({ text, kind: 'context', old: i + 1, next: i + 1 })),
    ...f.before
      .slice(start, f.before.length - end)
      .map((text, i) => ({ text, kind: 'remove', old: start + i + 1, next: 0 })),
    ...f.after
      .slice(start, f.after.length - end)
      .map((text, i) => ({ text, kind: 'add', old: 0, next: start + i + 1 })),
    ...f.after.slice(f.after.length - end).map((text, i) => ({
      text,
      kind: 'context',
      old: f.before.length - end + i + 1,
      next: f.after.length - end + i + 1,
    })),
  ]
})
const actionText = computed(() =>
  operation.value === 'Checkout'
    ? `Switch from ${currentName.value} to ${selectedName.value}`
    : operation.value === 'Merge'
      ? `Merge ${selectedName.value} into ${currentName.value}`
      : `Rebase ${currentName.value} onto ${selectedName.value}`,
)
function age(value: string) {
  return Number.parseInt(value) * (value.endsWith('h') ? 60 : 1)
}
function choose(branch: SampleBranch) {
  selectedName.value = branch.name
  file.value = ''
  line.value = 0
}
function switchDesign(id: typeof design.value) {
  design.value = id
  file.value = ''
}
function changeSource() {
  file.value = ''
  line.value = 0
}
function swap() {
  const old = selectedName.value
  selectedName.value = targetName.value
  targetName.value = old
  changeSource()
}
function openFile(path: string) {
  file.value = path
  line.value = 0
  void nextTick(() => preview.value?.focus())
}
function selectTab(value: string) {
  tab.value = value
  file.value = ''
}
function selectFilter(value: string) {
  filter.value = value
}
function requestAction(value: typeof operation.value) {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  operation.value = value
  void nextTick(() => dialog.value?.querySelector('button')?.focus())
}
function closeAction() {
  operation.value = null
  previousFocus?.focus()
}
function confirmAction() {
  const message = actionText.value
  if (operation.value === 'Checkout') currentName.value = selectedName.value
  notice.value =
    operation.value === 'Checkout'
      ? `Demo checkout: ${selectedName.value} is now current.`
      : `Preview only: would ${message[0]!.toLowerCase()}${message.slice(1)}. Sample history is unchanged.`
  operation.value = null
  void nextTick(() => preview.value?.focus())
}
function reset() {
  branches.value = sampleBranches()
  selectedName.value = 'feature/cursor-review'
  targetName.value = 'main'
  currentName.value = 'main'
  filter.value = 'Local'
  query.value = ''
  file.value = ''
  notice.value = 'Sample session reset.'
}
function move(delta: number) {
  if (openedFile.value) {
    line.value = Math.max(0, Math.min(diffLines.value.length - 1, line.value + delta))
    return
  }
  const index = visible.value.findIndex((b) => b.name === selectedName.value)
  const branch = visible.value[Math.max(0, Math.min(visible.value.length - 1, index + delta))]
  if (branch) {
    choose(branch)
    void nextTick(() =>
      list.value?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' }),
    )
  }
}
function keys(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
  if (operation.value) {
    if (e.key === 'Tab') {
      const buttons = Array.from(dialog.value?.querySelectorAll('button') || [])
      const first = buttons[0],
        last = buttons[buttons.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    if (e.key === 'Escape') {
      closeAction()
      e.preventDefault()
    }
    return
  }
  if (e.target instanceof HTMLElement && e.target.closest('input,select,textarea')) return
  if (['j', 'k', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
    e.preventDefault()
    move(['j', 'ArrowDown'].includes(e.key) ? 1 : -1)
  }
  if (e.key === '/') {
    e.preventDefault()
    search.value?.focus()
  }
  if (e.key === 'l') {
    e.preventDefault()
    preview.value?.focus()
  }
  if (e.key === 'h' || e.key === 'Escape') {
    file.value = ''
    list.value?.focus()
  }
}
const paths = computed(() =>
  commits
    .filter((c) => c.parent)
    .map((c) => {
      const p = commits.find((n) => n.id === c.parent)!
      return {
        id: c.id,
        d: `M ${p.x} ${p.y} C ${p.x + 45} ${p.y}, ${c.x - 45} ${c.y}, ${c.x} ${c.y}`,
        active: history(selected.value.tip).some((n) => n.id === c.id),
      }
    }),
)
onMounted(() => window.addEventListener('keydown', keys))
onUnmounted(() => window.removeEventListener('keydown', keys))
</script>

<template>
  <div class="branch-lab">
    <header class="lab-intro">
      <div>
        <span class="eyebrow">ICHI / BRANCH STUDIES</span>
        <h1>Follow the work.</h1>
        <p>Three ways to explore, compare, and move between branches.</p>
      </div>
      <div class="lab-meta">
        <span class="sample-badge">Interactive · sample repository</span
        ><button @click="reset">Reset session ↺</button>
      </div>
    </header>
    <nav class="design-picker" aria-label="Branch designs">
      <button
        v-for="(d, i) in designs"
        :key="d.id"
        :aria-pressed="design === d.id"
        @click="switchDesign(d.id)"
      >
        <span class="design-number">0{{ i + 1 }}</span>
        <div>
          <strong>{{ d.name }}</strong
          ><small>{{ d.note }}</small>
        </div>
        <span class="design-indicator">↗</span>
      </button>
    </nav>
    <div class="study-caption">
      <p>{{ designs.find((d) => d.id === design)?.description }}</p>
      <span>Local simulation · no Git operations</span>
    </div>
    <section class="workstation" :class="design">
      <header class="app-header">
        <span class="wordmark">ichi<span>·</span></span
        ><span class="app-slash">/</span><strong>workbench</strong
        ><span class="current-context">⑂ {{ currentName }}</span
        ><span class="session-pill"><i></i> Local session</span>
      </header>
      <div class="view-header">
        <nav>
          <span>Graph</span
          ><strong
            >Branches <small>{{ branches.length }}</small></strong
          ><span>Changes</span>
        </nav>
        <button @click="notice = 'Demo fetch: sample remote branches are already up to date.'">
          ↻ Fetch
        </button>
      </div>
      <div v-if="design === 'compare'" class="compare-controls">
        <label
          ><span>Inspect branch</span
          ><select v-model="selectedName" aria-label="Inspect branch" @change="changeSource">
            <option v-for="b in branches" :key="b.name">{{ b.name }}</option>
          </select></label
        ><button class="swap" aria-label="Swap comparison" @click="swap">⇄</button
        ><label
          ><span>Compare against</span
          ><select v-model="targetName" aria-label="Compare against" @change="changeSource">
            <option v-for="b in branches" :key="b.name">{{ b.name }}</option>
          </select></label
        >
        <div class="compare-explainer">
          {{ pair.source.length }} unique commits <span>from {{ pair.common.id }}</span>
        </div>
      </div>
      <div class="main-content">
        <aside
          v-if="design !== 'compare'"
          ref="list"
          class="branch-browser"
          tabindex="0"
          aria-label="Branch list"
        >
          <div class="pane-heading">
            <span>YOUR BRANCHES</span><span>{{ visible.length }}</span>
          </div>
          <label class="branch-search"
            ><span>⌕</span
            ><input
              ref="search"
              v-model="query"
              aria-label="Filter branches"
              placeholder="Find a branch…"
            /><kbd>/</kbd></label
          >
          <div class="list-controls">
            <nav aria-label="Branch location">
              <button
                v-for="f in ['Local', 'Remote', 'All']"
                :key="f"
                :aria-pressed="filter === f"
                @click="selectFilter(f)"
              >
                {{ f }}
              </button>
            </nav>
            <select v-model="sort" aria-label="Sort branches">
              <option>Pinned first</option>
              <option>Recent activity</option>
              <option>Name</option>
            </select>
          </div>
          <div class="branch-rows">
            <div
              v-for="b in visible"
              :key="b.name"
              class="branch-item"
              :class="{ selected: selectedName === b.name }"
            >
              <button
                class="branch-pick"
                :aria-current="selectedName === b.name ? 'true' : undefined"
                @click="choose(b)"
              >
                <span class="row-marker" :style="{ color: b.color }">{{
                  b.name === currentName ? '●' : '⑂'
                }}</span
                ><span class="row-copy"
                  ><strong>{{ b.name }}</strong
                  ><small>{{ history(b.tip)[0]?.message }}</small></span
                ><span class="row-end"
                  ><span>{{ b.activity }}</span
                  ><small v-if="b.tip !== target.tip"
                    >+{{ comparison(b, target).source.length }} / −{{
                      comparison(b, target).target.length
                    }}</small
                  ><small v-else>baseline</small></span
                ></button
              ><button
                class="pin"
                :aria-label="`${b.pinned ? 'Unpin' : 'Pin'} ${b.name}`"
                :aria-pressed="b.pinned"
                @click="b.pinned = !b.pinned"
              >
                {{ b.pinned ? '★' : '☆' }}
              </button>
            </div>
            <p v-if="!visible.length" class="empty-list">No matching branches.</p>
          </div>
          <div class="browser-bottom"><i></i> Current: {{ currentName }}</div>
        </aside>
        <div class="branch-workspace">
          <div v-if="design === 'map'" class="map-surface">
            <div class="map-label">
              <span>ANCESTRY</span
              ><span>Filled tip = selected branch · click a label to inspect</span>
            </div>
            <div class="map-scroll">
              <svg viewBox="0 0 950 310" role="img" aria-label="Sample branch ancestry map">
                <path
                  v-for="edge in paths"
                  :key="edge.id"
                  :d="edge.d"
                  fill="none"
                  :stroke="edge.active ? selected.color : '#454a48'"
                  :stroke-width="edge.active ? 3 : 2"
                />
                <circle
                  v-for="c in commits"
                  :key="c.id"
                  :cx="c.x"
                  :cy="c.y"
                  r="5"
                  :fill="
                    history(selected.tip).some((n) => n.id === c.id) ? selected.color : '#242927'
                  "
                  :stroke="
                    history(selected.tip).some((n) => n.id === c.id) ? selected.color : '#747d77'
                  "
                  stroke-width="2"
                >
                  <title>{{ c.message }}</title>
                </circle>
                <g
                  v-for="b in branches.filter((b) => !b.remote)"
                  :key="b.name"
                  tabindex="0"
                  role="button"
                  :aria-label="`Inspect ${b.name}`"
                  :aria-pressed="selectedName === b.name"
                  class="map-tip"
                  @click="choose(b)"
                  @keydown.enter.prevent="choose(b)"
                  @keydown.space.prevent="choose(b)"
                >
                  <rect
                    :x="commits.find((c) => c.id === b.tip)!.x + 18"
                    :y="commits.find((c) => c.id === b.tip)!.y - 17"
                    :width="b.name.length * 7.6 + 32"
                    height="34"
                    rx="6"
                    :fill="selectedName === b.name ? '#303b2a' : '#222725'"
                  />
                  <text
                    :x="commits.find((c) => c.id === b.tip)!.x + 32"
                    :y="commits.find((c) => c.id === b.tip)!.y + 4"
                    :fill="selectedName === b.name ? '#d4e8b2' : b.color"
                  >
                    {{ b.name }}{{ b.name === currentName ? ' ●' : '' }}
                  </text>
                </g>
              </svg>
            </div>
          </div>
          <article ref="preview" class="branch-preview" tabindex="0" aria-label="Branch preview">
            <header class="preview-heading">
              <div>
                <span class="eyebrow">{{
                  design === 'compare' ? 'COMPARISON' : 'BRANCH PREVIEW'
                }}</span>
                <h2><i :style="{ background: selected.color }"></i>{{ selected.name }}</h2>
                <p>
                  {{
                    selected.name === currentName
                      ? 'Checked out in this session'
                      : selected.remote
                        ? 'Remote reference'
                        : 'Local branch'
                  }}<span>Updated {{ history(selected.tip)[0]?.when }}</span>
                </p>
              </div>
              <label v-if="design !== 'compare'" class="baseline-select"
                >Compare against<select
                  v-model="targetName"
                  aria-label="Compare against"
                  @change="changeSource"
                >
                  <option v-for="b in branches" :key="b.name">{{ b.name }}</option>
                </select></label
              >
            </header>
            <div class="relationship">
              <div class="relationship-text">
                <strong>{{ pair.source.length }} <span>only here</span></strong
                ><span class="common-base"
                  >shared base <code>{{ pair.common.id }}</code></span
                ><strong
                  >{{ pair.target.length }} <span>only on {{ target.name }}</span></strong
                >
              </div>
              <svg viewBox="0 0 650 58" preserveAspectRatio="none" aria-label="Branch divergence">
                <path
                  d="M 22 30 L 260 30 C 295 30 300 12 335 12 L 628 12"
                  fill="none"
                  :stroke="selected.color"
                  stroke-width="2"
                />
                <path
                  d="M 260 30 C 295 30 300 47 335 47 L 628 47"
                  fill="none"
                  stroke="#8298bb"
                  stroke-width="2"
                />
                <circle cx="260" cy="30" r="4" fill="#171c19" stroke="#879187" stroke-width="2" />
                <circle cx="628" cy="12" r="5" :fill="selected.color" />
                <circle cx="628" cy="47" r="5" fill="#8298bb" />
              </svg>
              <div class="relationship-foot">
                <span>{{ pair.common.message }}</span
                ><span>{{
                  pair.source.length || pair.target.length
                    ? 'Counts show unique commits, not conflicts'
                    : 'Both names point to the same commit'
                }}</span>
              </div>
            </div>
            <nav class="preview-tabs" aria-label="Preview content">
              <button
                v-for="t in ['Files', 'Commits']"
                :key="t"
                :aria-pressed="tab === t"
                @click="selectTab(t)"
              >
                {{ t
                }}<small>{{ t === 'Files' ? changes.length : pair.source.length }}</small></button
              ><span class="diff-summary" v-if="tab === 'Files'"
                ><b>+{{ totals.added }}</b
                ><em>−{{ totals.removed }}</em
                ><small>tip to tip</small></span
              ><button v-if="file" class="back-to-files" @click="file = ''">← All files</button>
            </nav>
            <div v-if="tab === 'Files' && !openedFile" class="file-list">
              <button
                v-for="f in changes"
                :key="f.path"
                class="changed-file"
                @click="openFile(f.path)"
              >
                <span class="file-symbol">{{
                  !f.before.length ? 'A' : !f.after.length ? 'D' : 'M'
                }}</span
                ><span>{{ f.path }}</span
                ><span class="file-delta"
                  ><b>+{{ f.added }}</b
                  ><em>−{{ f.removed }}</em></span
                ><span class="file-arrow">↗</span>
              </button>
              <div v-if="!changes.length" class="empty-state">
                <span>✓</span>
                <h3>Nothing between these tips.</h3>
                <p>The sample file snapshots are identical.</p>
              </div>
              <div v-else class="file-list-note">
                Select a file to review its changes in context.
              </div>
            </div>
            <div v-else-if="tab === 'Files' && openedFile" class="inline-diff">
              <header>
                {{ openedFile.path }}<span>{{ target.name }} → {{ selected.name }}</span>
              </header>
              <button
                v-for="(l, i) in diffLines"
                :key="i"
                class="diff-line"
                :class="[l.kind, { cursor: line === i }]"
                :aria-current="line === i ? 'true' : undefined"
                @click="line = i"
              >
                <span class="cursor-marker">{{ line === i ? '›' : '' }}</span
                ><span class="line-number">{{ l.old || '' }}</span
                ><span class="line-number">{{ l.next || '' }}</span
                ><span class="diff-sign">{{
                  l.kind === 'add' ? '+' : l.kind === 'remove' ? '−' : ' '
                }}</span
                ><code>{{ l.text }}</code>
              </button>
            </div>
            <div v-else class="commit-columns">
              <section>
                <h3>
                  Only on {{ selected.name }} <span>{{ pair.source.length }}</span>
                </h3>
                <div v-for="c in pair.source" :key="c.id" class="commit-row">
                  <i :style="{ background: selected.color }"></i>
                  <div>
                    <strong>{{ c.message }}</strong
                    ><small>{{ c.author }} · {{ c.when }}</small>
                  </div>
                  <code>{{ c.id }}</code>
                </div>
                <p v-if="!pair.source.length" class="empty-list">No unique commits.</p>
              </section>
              <section v-if="design === 'compare'">
                <h3>
                  Only on {{ target.name }} <span>{{ pair.target.length }}</span>
                </h3>
                <div v-for="c in pair.target" :key="c.id" class="commit-row">
                  <i></i>
                  <div>
                    <strong>{{ c.message }}</strong
                    ><small>{{ c.author }} · {{ c.when }}</small>
                  </div>
                  <code>{{ c.id }}</code>
                </div>
                <p v-if="!pair.target.length" class="empty-list">No unique commits.</p>
              </section>
            </div>
            <footer class="branch-actions">
              <button
                class="checkout"
                :disabled="selected.name === currentName || selected.remote"
                @click="requestAction('Checkout')"
              >
                {{ selected.name === currentName ? '✓ Current branch' : 'Checkout branch' }}
              </button>
              <div>
                <button :disabled="selected.name === currentName" @click="requestAction('Merge')">
                  Merge into {{ currentName }}</button
                ><button :disabled="selected.name === currentName" @click="requestAction('Rebase')">
                  Rebase {{ currentName }} onto this
                </button>
              </div>
            </footer>
          </article>
        </div>
      </div>
      <footer class="status-line">
        <span role="status">{{ notice || 'Sample repository ready.' }}</span
        ><span><kbd>j k</kbd> navigate <kbd>h l</kbd> panes <kbd>esc</kbd> back</span>
      </footer>
    </section>
    <footer class="study-footer">
      <p>
        <strong>{{ designs.find((d) => d.id === design)?.name }}</strong
        >{{
          design === 'desk'
            ? 'The everyday home for branch work.'
            : design === 'compare'
              ? 'A deliberate stop before integrating changes.'
              : 'The bigger picture, without the full history graph.'
        }}
      </p>
      <span>All designs share the same sample commits and file snapshots.</span>
    </footer>
    <div v-if="operation" class="action-backdrop" @click.self="closeAction">
      <section
        ref="dialog"
        class="action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-title"
      >
        <span class="eyebrow">SIMULATED GIT ACTION</span>
        <h2 id="action-title">{{ operation }} preview</h2>
        <p>{{ actionText }}</p>
        <div class="direction">
          <code>{{ operation !== 'Merge' ? currentName : selected.name }}</code
          ><span>→</span><code>{{ operation !== 'Merge' ? selected.name : currentName }}</code>
        </div>
        <small>{{
          operation === 'Checkout'
            ? 'This changes the current branch marker in this demo.'
            : 'This previews the action only. Conflict detection and history changes are not simulated.'
        }}</small>
        <footer>
          <button @click="closeAction">Cancel</button
          ><button class="checkout" @click="confirmAction">
            {{
              operation === 'Checkout' ? 'Switch in demo' : `Simulate ${operation.toLowerCase()}`
            }}
          </button>
        </footer>
      </section>
    </div>
  </div>
</template>

<style>
:root {
  font-family: 'Inter Variable', Inter, system-ui, sans-serif;
  color: #dfdfd4;
  background: #101310;
  color-scheme: dark;
  font-synthesis: none;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
}
button,
input,
select {
  font: inherit;
}
button {
  cursor: pointer;
}
button,
select {
  color: inherit;
}
button {
  background: none;
  border: 0;
}
button:disabled {
  cursor: default;
  opacity: 0.4;
}
button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid #cbdf98;
  outline-offset: 3px;
}
button,
select,
input {
  border-radius: 5px;
}
.branch-lab {
  max-width: 1560px;
  margin: auto;
  padding: 44px 46px 28px;
}
.lab-intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 30px;
}
.eyebrow {
  font-size: 10px;
  letter-spacing: 1.8px;
  font-weight: 550;
  color: #a2ab95;
}
h1 {
  font-size: 36px;
  letter-spacing: -1.4px;
  font-weight: 500;
  margin: 12px 0 9px;
}
.lab-intro p {
  font-size: 13px;
  color: #899389;
  margin: 0;
}
.lab-meta {
  display: grid;
  justify-items: end;
  gap: 15px;
}
.sample-badge {
  border: 1px solid #3c4436;
  border-radius: 30px;
  padding: 8px 12px;
  color: #aab29e;
  font-size: 10px;
}
.lab-meta button {
  font-size: 11px;
  color: #9ca88f;
}
.design-picker {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.design-picker button {
  display: flex;
  align-items: center;
  gap: 15px;
  text-align: left;
  padding: 19px 20px;
  border: 1px solid #343c31;
  background: #191e18;
  border-radius: 9px;
}
.design-picker button[aria-pressed='true'] {
  border-color: #91a373;
  background: #293021;
}
.design-number {
  font:
    11px 'JetBrains Mono',
    monospace;
  color: #7b8a6c;
}
.design-picker strong {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #d8e0c6;
}
.design-picker small {
  display: block;
  margin-top: 6px;
  color: #929e85;
  font-size: 11px;
}
.design-indicator {
  margin-left: auto;
  color: #8c9f76;
  font-size: 18px;
}
.study-caption {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 25px;
  font-size: 11px;
  line-height: 1.5;
  padding: 17px 0;
  color: #a0aa95;
}
.study-caption p {
  margin: 0;
}
.study-caption > span {
  white-space: nowrap;
  color: #6f7d68;
}
.workstation {
  border: 1px solid #3b4336;
  background: #191e19;
  border-radius: 11px;
  overflow: hidden;
  box-shadow: 0 25px 70px #0003;
}
.app-header {
  height: 48px;
  background: #20261e;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 20px;
  border-bottom: 1px solid #36402f;
  font-size: 12px;
}
.wordmark {
  font-size: 23px;
  font-weight: 650;
  letter-spacing: -1px;
}
.wordmark > span {
  color: #c8dc98;
}
.app-slash {
  color: #5e6b56;
}
.app-header > strong {
  font-weight: 500;
}
.current-context {
  color: #94a183;
  font:
    10px 'JetBrains Mono',
    monospace;
  border-left: 1px solid #49553c;
  padding-left: 14px;
}
.session-pill {
  margin-left: auto;
  color: #829371;
  font-size: 10px;
  display: flex;
  align-items: center;
  gap: 7px;
}
.session-pill i,
.browser-bottom i {
  display: inline-block;
  width: 5px;
  height: 5px;
  background: #bed78b;
  border-radius: 50%;
}
.view-header {
  height: 51px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid #333d2d;
}
.view-header nav {
  display: flex;
  gap: 24px;
  font-size: 12px;
  color: #78876b;
  height: 100%;
  align-items: center;
}
.view-header strong {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: #d5dfbd;
  border-bottom: 2px solid #c8dc98;
}
.view-header small {
  font-size: 10px;
  background: #333f2a;
  padding: 2px 5px;
  border-radius: 4px;
}
.view-header > button {
  font-size: 11px;
  border: 1px solid #3b4931;
  padding: 5px 9px;
  color: #a6b694;
}
.main-content {
  display: flex;
  min-height: 520px;
}
.branch-workspace {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.branch-browser {
  width: 365px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #36402f;
  background: #171d17;
  outline: none;
}
.pane-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22px 18px 16px;
  font-size: 9px;
  letter-spacing: 1.6px;
  color: #7e8e71;
}
.branch-browser:focus-within .pane-heading {
  color: #cee2ae;
  background: #202b1c;
}
.branch-search {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 14px 13px;
  padding: 9px 10px;
  border: 1px solid #3a4831;
  border-radius: 5px;
  color: #94a681;
  background: #1d261b;
}
.branch-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: none;
  outline: none;
  color: #d5e2c3;
  font-size: 11px;
}
.branch-search:focus-within {
  border-color: #81996a;
}
.branch-search input::placeholder {
  color: #819471;
}
kbd {
  font:
    9px 'JetBrains Mono',
    monospace;
  color: #91a67e;
}
.list-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 15px;
  border-bottom: 1px solid #2c3926;
  gap: 8px;
}
.list-controls nav {
  display: flex;
  gap: 3px;
}
.list-controls button {
  padding: 5px 7px;
  color: #8b9e7b;
  font-size: 10px;
}
.list-controls button[aria-pressed='true'] {
  color: #d1e3b5;
  background: #34442b;
}
.list-controls select {
  font-size: 9px;
  max-width: 105px;
  border: 0;
  background: #171d17;
  color: #829672;
}
.branch-rows {
  padding: 8px;
  flex: 1;
}
.branch-item {
  display: flex;
  align-items: center;
  border-radius: 5px;
  margin-bottom: 3px;
}
.branch-item.selected {
  background: #303d26;
}
.branch-pick {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px 7px;
  flex: 1;
  min-width: 0;
  text-align: left;
}
.row-marker {
  font-size: 12px;
  width: 12px;
  flex-shrink: 0;
}
.row-copy {
  flex: 1;
  min-width: 0;
}
.row-copy strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 500;
  color: #d4dfc6;
}
.row-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 9px;
  color: #8e9d80;
  margin-top: 6px;
}
.row-end {
  font:
    9px 'JetBrains Mono',
    monospace;
  text-align: right;
  flex-shrink: 0;
  color: #8e9e7b;
}
.row-end small {
  display: block;
  font-size: 8px;
  color: #a9bb90;
  margin-top: 7px;
}
.pin {
  font-size: 13px;
  color: #697d5b;
  padding: 8px 5px;
}
.pin[aria-pressed='true'] {
  color: #c5cf98;
}
.browser-bottom {
  padding: 17px 15px;
  border-top: 1px solid #303d28;
  font-size: 9px;
  color: #8a9d77;
  display: flex;
  align-items: center;
  gap: 8px;
}
.branch-preview {
  flex: 1;
  min-width: 0;
  outline: none;
  display: flex;
  flex-direction: column;
}
.preview-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 25px 28px 23px;
}
.branch-preview:focus-within .preview-heading {
  background: #20271c;
}
.preview-heading h2 {
  font-size: 21px;
  font-weight: 500;
  letter-spacing: -0.5px;
  margin: 10px 0;
  display: flex;
  align-items: center;
  gap: 9px;
  overflow-wrap: anywhere;
}
.preview-heading h2 i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.preview-heading p {
  font-size: 10px;
  color: #8c9a80;
  margin: 0;
}
.preview-heading p span {
  margin-left: 14px;
  color: #6d7e62;
}
.baseline-select {
  display: grid;
  gap: 6px;
  font-size: 9px;
  color: #7d926d;
  flex-shrink: 0;
}
.baseline-select select {
  max-width: 185px;
  background: #202b1b;
  border: 1px solid #3b4b30;
  font-size: 10px;
  padding: 7px;
  color: #c1d0ac;
}
.relationship {
  margin: 0 28px 22px;
  padding: 15px 17px 11px;
  background: #131b13;
  border: 1px solid #2c3b25;
  border-radius: 7px;
}
.relationship-text {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.relationship-text > strong {
  font:
    16px 'JetBrains Mono',
    monospace;
  color: #c6d9a5;
  white-space: nowrap;
}
.relationship-text > strong:last-child {
  color: #a5b8e0;
}
.relationship-text strong span {
  font:
    10px 'Inter Variable',
    sans-serif;
  color: #8e9d7d;
}
.common-base {
  font-size: 9px;
  color: #758b65;
}
.common-base code {
  font-size: 9px;
  color: #a0b58c;
  margin-left: 6px;
}
.relationship svg {
  display: block;
  height: 50px;
  width: 100%;
  margin-top: 4px;
}
.relationship-foot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 9px;
  color: #708764;
  line-height: 1.5;
}
.relationship-foot > span:last-child {
  text-align: right;
  color: #627857;
}
.preview-tabs {
  display: flex;
  align-items: center;
  border-bottom: 1px solid #35432d;
  padding: 0 28px;
  gap: 22px;
  min-height: 44px;
}
.preview-tabs > button {
  font-size: 11px;
  color: #8d9f7b;
  display: flex;
  gap: 8px;
  align-items: center;
  height: 44px;
  border-radius: 0;
}
.preview-tabs > button[aria-pressed='true'] {
  border-bottom: 2px solid #c8dc98;
  color: #d6e2c3;
}
.preview-tabs small {
  font-size: 9px;
  color: #93a57f;
}
.diff-summary {
  margin-left: auto;
  display: flex;
  gap: 10px;
  font:
    10px 'JetBrains Mono',
    monospace;
}
.diff-summary b,
.file-delta b {
  color: #b2cc8d;
  font-weight: 400;
}
.diff-summary em,
.file-delta em {
  color: #c29280;
  font-style: normal;
}
.preview-tabs .back-to-files {
  font-size: 10px;
  margin-left: auto;
}
.file-list {
  padding: 8px 20px 25px;
  flex: 1;
}
.changed-file {
  width: 100%;
  display: flex;
  align-items: center;
  text-align: left;
  padding: 15px 8px;
  border-bottom: 1px solid #2b3925;
  gap: 12px;
  font:
    11px 'JetBrains Mono',
    monospace;
  color: #b9c9a6;
  border-radius: 0;
}
.changed-file:hover {
  background: #273621;
}
.changed-file > span:nth-child(2) {
  min-width: 0;
  overflow-wrap: anywhere;
}
.file-symbol {
  font-size: 9px;
  color: #98b776;
}
.file-delta {
  display: flex;
  gap: 10px;
  margin-left: auto;
  font-size: 10px;
  white-space: nowrap;
}
.file-arrow {
  color: #728c61;
  font-size: 14px;
}
.file-list-note {
  font-size: 10px;
  color: #637b54;
  padding: 20px 8px;
}
.branch-actions {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 17px 24px;
  border-top: 1px solid #33432a;
  gap: 10px;
  background: #1c2518;
}
.branch-actions > div {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.branch-actions button {
  font-size: 10px;
  padding: 8px 10px;
  color: #a8bf91;
  border: 1px solid #3b4e30;
}
.checkout {
  background: #c8dc98 !important;
  color: #27341c !important;
  border: 0 !important;
  border-radius: 5px;
  font-size: 11px;
  padding: 10px 14px;
}
.status-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 10px 16px;
  min-height: 34px;
  background: #20291b;
  border-top: 1px solid #3b4a31;
  font-size: 9px;
  color: #96ab81;
  line-height: 1.5;
}
.status-line > span:last-child {
  flex-shrink: 0;
  color: #70875d;
}
.status-line kbd {
  margin-left: 10px;
}
.study-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 22px;
  color: #80916f;
  font-size: 11px;
  line-height: 1.5;
}
.study-footer p {
  margin: 0;
}
.study-footer strong {
  font-weight: 500;
  color: #b7c6a2;
  margin-right: 12px;
}
.study-footer > span {
  font-size: 10px;
  color: #687e58;
}
.compare-controls {
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 23px 28px;
  border-bottom: 1px solid #3a4930;
  background: #202b1b;
}
.compare-controls label {
  display: grid;
  gap: 9px;
  flex: 1;
}
.compare-controls label > span {
  font-size: 10px;
  color: #8ea477;
}
.compare-controls select {
  width: 100%;
  padding: 11px 12px;
  font:
    12px 'JetBrains Mono',
    monospace;
  background: #192415;
  border: 1px solid #566b43;
  color: #d8e6c4;
}
.swap {
  font-size: 24px;
  color: #aec28f;
  padding: 8px;
  align-self: end;
}
.compare-explainer {
  font:
    12px 'JetBrains Mono',
    monospace;
  color: #c3d5a3;
  padding-left: 12px;
}
.compare-explainer span {
  display: block;
  font-size: 10px;
  color: #859f6c;
  margin-top: 10px;
}
.compare .main-content {
  min-height: 445px;
}
.compare .preview-heading {
  padding-bottom: 17px;
}
.compare .relationship {
  max-width: none;
}
.compare .file-list {
  min-height: 160px;
}
.commit-columns {
  display: flex;
  flex: 1;
  padding: 18px 28px 30px;
  gap: 26px;
}
.commit-columns section {
  flex: 1;
  min-width: 0;
}
.commit-columns h3 {
  font-size: 10px;
  font-weight: 400;
  color: #8da777;
  margin: 0 0 15px;
  overflow-wrap: anywhere;
}
.commit-columns h3 span {
  float: right;
  color: #c0d99e;
}
.commit-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #2d3d25;
}
.commit-row i {
  width: 5px;
  height: 5px;
  background: #a5b8e0;
  border-radius: 50%;
  flex-shrink: 0;
}
.commit-row > div {
  flex: 1;
  min-width: 0;
}
.commit-row strong {
  font-size: 11px;
  font-weight: 400;
  color: #c4d6b0;
  display: block;
}
.commit-row small {
  display: block;
  font-size: 9px;
  color: #758e61;
  margin-top: 7px;
}
.commit-row code {
  font-size: 9px;
  color: #718d5b;
}
.inline-diff {
  flex: 1;
  padding-bottom: 25px;
  background: #151e13;
  overflow: auto;
}
.inline-diff > header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  font:
    10px 'JetBrains Mono',
    monospace;
  color: #8aa271;
  border-bottom: 1px solid #2c3d22;
  margin-bottom: 12px;
}
.inline-diff > header span {
  font-size: 9px;
  color: #637f4c;
}
.diff-line {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 530px;
  text-align: left;
  border-radius: 0;
  padding: 3px 12px 3px 0;
  line-height: 23px;
  color: #b2c29f;
  font:
    11px/23px 'JetBrains Mono',
    monospace;
}
.diff-line.add {
  background: #273a1e;
  color: #c1dba6;
}
.diff-line.remove {
  background: #362a24;
  color: #ccaa98;
}
.diff-line.cursor {
  box-shadow: inset 0 0 0 1px #a8be7330;
  background-image: linear-gradient(#c8dc9810, #c8dc9810);
}
.cursor-marker {
  width: 24px;
  flex-shrink: 0;
  color: #d4e8ab;
  font-size: 19px;
  text-align: center;
}
.line-number {
  width: 32px;
  text-align: right;
  flex-shrink: 0;
  color: #718564;
  font-size: 9px;
  margin-right: 12px;
}
.diff-sign {
  width: 18px;
  flex-shrink: 0;
}
.diff-line code {
  white-space: pre;
  font: inherit;
}
.empty-list {
  padding: 15px;
  color: #7e986b;
  font-size: 11px;
}
.empty-state {
  padding: 30px;
  text-align: center;
}
.empty-state > span {
  color: #bedc97;
  font-size: 25px;
}
.empty-state h3 {
  font-size: 15px;
  font-weight: 500;
  color: #b9cfa1;
}
.empty-state p {
  font-size: 11px;
  color: #7d9669;
}
.map-surface {
  padding: 14px 26px 0;
  background: #131c13;
  border-bottom: 1px solid #37492b;
}
.map-label {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  letter-spacing: 1.4px;
  color: #738e5f;
}
.map-label > span:last-child {
  letter-spacing: 0;
  color: #637d50;
}
.map-scroll {
  overflow: auto;
}
.map-scroll svg {
  width: 100%;
  height: 260px;
  min-width: 760px;
  display: block;
}
.map-tip {
  cursor: pointer;
  outline: none;
}
.map-tip:focus-visible rect {
  stroke: #d6e9b3;
  stroke-width: 2;
}
.map-tip text {
  font:
    11px 'JetBrains Mono',
    monospace;
}
.map .main-content {
  min-height: 430px;
}
.map .relationship {
  display: none;
}
.action-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: #090f0ad9;
  backdrop-filter: blur(5px);
  z-index: 20;
}
.action-dialog {
  width: 520px;
  max-width: 100%;
  border: 1px solid #526443;
  border-radius: 12px;
  padding: 28px;
  background: #202b1c;
  box-shadow: 0 30px 80px #0006;
}
.action-dialog h2 {
  font-size: 23px;
  font-weight: 500;
  letter-spacing: -0.4px;
}
.action-dialog p {
  font-size: 13px;
  line-height: 1.7;
  color: #bccfaa;
  overflow-wrap: anywhere;
}
.direction {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 17px 0;
  margin-bottom: 10px;
  border-block: 1px solid #3d5030;
  color: #c6dfa8;
}
.direction code {
  font-size: 11px;
  overflow-wrap: anywhere;
}
.action-dialog small {
  font-size: 11px;
  line-height: 1.7;
  color: #8fa879;
  display: block;
}
.action-dialog footer {
  display: flex;
  gap: 16px;
  justify-content: flex-end;
  margin-top: 25px;
  font-size: 12px;
}
@media (min-width: 1450px) {
  .main-content {
    min-height: 560px;
  }
  .branch-browser {
    width: 400px;
  }
}
@media (max-width: 1100px) {
  .branch-lab {
    padding: 28px 22px;
  }
  .branch-browser {
    width: 305px;
  }
  .preview-heading {
    padding: 22px 20px;
    align-items: flex-start;
    flex-direction: column;
    gap: 14px;
  }
  .preview-heading h2 {
    font-size: 19px;
  }
  .baseline-select {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .relationship {
    margin: 0 20px 18px;
    padding: 12px;
  }
  .common-base {
    display: none;
  }
  .relationship-text strong span {
    font-size: 9px;
  }
  .relationship-foot {
    flex-direction: column;
    gap: 3px;
  }
  .relationship-foot > span:last-child {
    text-align: left;
  }
  .branch-actions {
    align-items: flex-start;
    flex-direction: column;
  }
  .branch-actions > div {
    justify-content: flex-start;
  }
  .study-caption > span {
    display: none;
  }
  .compare-explainer {
    display: none;
  }
  .design-picker button {
    padding: 15px 12px;
    gap: 10px;
  }
  .design-picker small {
    font-size: 10px;
  }
  .design-indicator {
    display: none;
  }
  .row-end small {
    display: none;
  }
  .status-line > span:last-child {
    display: none;
  }
}
@media (max-width: 720px) {
  .branch-lab {
    padding: 24px 12px;
  }
  .lab-intro {
    align-items: flex-start;
    gap: 15px;
  }
  .lab-meta .sample-badge {
    display: none;
  }
  .lab-meta {
    padding-top: 6px;
  }
  h1 {
    font-size: 29px;
  }
  .lab-intro p {
    font-size: 11px;
    max-width: 245px;
    line-height: 1.6;
  }
  .design-picker {
    gap: 6px;
  }
  .design-picker button {
    padding: 12px 8px;
    gap: 6px;
  }
  .design-picker strong {
    font-size: 11px;
  }
  .design-picker small,
  .design-number {
    display: none;
  }
  .study-caption {
    font-size: 10px;
  }
  .main-content {
    flex-direction: column;
  }
  .branch-browser {
    width: 100%;
    max-height: 250px;
    border-right: 0;
    border-bottom: 1px solid #445934;
  }
  .branch-rows {
    overflow: auto;
  }
  .pane-heading {
    padding: 12px 16px 9px;
  }
  .branch-search {
    margin-bottom: 9px;
  }
  .list-controls {
    padding-bottom: 8px;
  }
  .browser-bottom {
    display: none;
  }
  .branch-pick {
    padding: 9px;
  }
  .row-end small {
    display: block;
  }
  .app-header {
    padding: 0 12px;
    gap: 9px;
  }
  .current-context {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .session-pill {
    display: none;
  }
  .view-header {
    padding: 0 12px;
  }
  .preview-heading {
    padding: 20px 16px;
  }
  .preview-heading p span {
    display: block;
    margin: 7px 0 0;
  }
  .preview-heading h2 {
    font-size: 18px;
  }
  .relationship {
    margin: 0 12px 15px;
  }
  .relationship-text strong {
    font-size: 13px;
  }
  .relationship-text strong span {
    font-size: 8px;
  }
  .preview-tabs {
    padding: 0 16px;
    gap: 16px;
  }
  .changed-file {
    font-size: 10px;
    padding: 13px 2px;
    gap: 7px;
  }
  .file-list {
    padding: 6px 12px 20px;
  }
  .file-delta {
    gap: 6px;
    font-size: 9px;
  }
  .branch-actions {
    padding: 15px;
  }
  .branch-actions button {
    font-size: 9px;
  }
  .study-footer {
    display: block;
  }
  .study-footer > span {
    display: block;
    margin-top: 10px;
  }
  .compare-controls {
    padding: 16px 12px;
    gap: 10px;
  }
  .compare-controls select {
    font-size: 10px;
    padding: 9px 5px;
    min-width: 0;
  }
  .compare-controls label {
    min-width: 0;
  }
  .swap {
    font-size: 20px;
    padding: 4px;
  }
  .commit-columns {
    padding: 18px 16px;
    flex-direction: column;
  }
  .map-surface {
    padding: 14px 12px 0;
  }
  .map-label > span:last-child {
    display: none;
  }
  .map-scroll svg {
    height: 240px;
  }
  .inline-diff > header {
    flex-direction: column;
  }
  .diff-summary small {
    display: none;
  }
}
</style>
