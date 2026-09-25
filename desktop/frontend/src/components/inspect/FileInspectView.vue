<script setup lang="ts">
import AuthorAvatar from '../common/AuthorAvatar.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { DiffService, InspectService } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import type { BlameLine, FileDiff, FileLogEntry } from '../../bindings/github.com/atterpac/ichi/internal/git'
import { useShellSettings } from '../../composables/useShellSettings'
import { useFileInspect } from '../../composables/useFileInspect'
import { useVimList } from '../../composables/useVimList'
import { laneColorVar } from '../graph/laneColors'
import { setModeline } from '../../composables/useModeline'
import { isModified } from '../../composables/keyboard'
import DiffView from '../diff/DiffView.vue'
import UiButton from '../common/UiButton.vue'
import { PhArrowCounterClockwise, PhClockCounterClockwise, PhCopy, PhGitFork } from '@phosphor-icons/vue'

const props = defineProps<{
  /** file path handed over by finder / other views; read on change */
  focusFile?: string
  /** the nav id that opened the view — 'blame' forces blame mode */
  modeHint?: string
}>()

const emit = defineEmits<{
  navigate: [view: string, focus?: string]
}>()

const settings = useShellSettings()
const inspect = useFileInspect()

const entries = ref<FileLogEntry[]>([])
const logLoading = ref(false)
const logError = ref('')
const selectedHash = ref('')

const diffCache = new Map<string, FileDiff | null>()
const diff = ref<FileDiff | null>(null)
const diffLoading = ref(false)
const diffError = ref('')

/** '' = blame the working tree, otherwise a commit hash */
const blameRef = ref('')
const blameCache = new Map<string, BlameLine[]>()
const blameLines = ref<BlameLine[]>([])
const blameLoading = ref(false)
const blameError = ref('')

const mode = computed(() => settings.inspectMode)
const file = computed(() => inspect.file)
const fileName = computed(() => file.value.split('/').pop() ?? file.value)
const fileDir = computed(() => file.value.slice(0, file.value.length - fileName.value.length))
const selected = computed(() => entries.value.find((entry) => entry.Hash === selectedHash.value) ?? null)

/** stable commit → lane colour, ranked by recency in the file log */
const hashColor = computed(() => {
  const map = new Map<string, string>()
  entries.value.forEach((entry, index) => map.set(entry.Hash, laneColorVar(index)))
  return map
})

function colorFor(hash: string): string {
  return hashColor.value.get(hash) ?? laneColorVar(hash.length ? hash.charCodeAt(0) : 0)
}

watch(
  () => props.focusFile,
  (value) => {
    if (value) inspect.file = value
  },
  { immediate: true },
)

watch(
  () => props.modeHint,
  (hint) => {
    if (hint === 'blame') settings.inspectMode = 'blame'
    else if (hint === 'file-log' && settings.inspectMode === 'blame') settings.inspectMode = 'log'
  },
  { immediate: true },
)

watch(
  file,
  async (path) => {
    entries.value = []
    selectedHash.value = ''
    logError.value = ''
    diffCache.clear()
    blameCache.clear()
    blameRef.value = ''
    diff.value = null
    blameLines.value = []
    if (!path) return
    logLoading.value = true
    try {
      const log = ((await InspectService.FileLog(path, 300)) ?? []).filter(Boolean)
      if (inspect.file !== path) return
      entries.value = log
      selectedHash.value = log[0]?.Hash ?? ''
    } catch (error) {
      logError.value = error instanceof Error ? error.message : String(error)
    } finally {
      logLoading.value = false
    }
  },
  { immediate: true },
)

watch(
  [selectedHash, mode, file],
  async ([hash, activeMode, path]) => {
    if (!hash || !path || activeMode === 'blame') return
    if (activeMode !== 'log') return
    await loadDiff(hash, path)
  },
  { immediate: true },
)

watch(
  [mode, blameRef, file],
  async ([activeMode, at, path]) => {
    if (!path || activeMode === 'log') return
    await loadBlame(path, at)
  },
  { immediate: true },
)

async function loadDiff(hash: string, path: string) {
  if (diffCache.has(hash)) {
    diff.value = diffCache.get(hash) ?? null
    diffError.value = diff.value ? '' : 'File not present in this commit under its current path.'
    return
  }
  diffLoading.value = true
  diffError.value = ''
  try {
    const raw = await DiffService.FileDiff(hash, path)
    const parsed = ((await DiffService.ParseDiff(raw)) ?? []).filter(Boolean)
    const first = parsed[0] ?? null
    diffCache.set(hash, first)
    if (selectedHash.value !== hash) return
    diff.value = first
    if (!first) diffError.value = 'File not present in this commit under its current path.'
  } catch (error) {
    if (selectedHash.value !== hash) return
    diff.value = null
    diffError.value = error instanceof Error ? error.message : String(error)
  } finally {
    diffLoading.value = false
  }
}

async function loadBlame(path: string, at: string) {
  const key = `${at}:${path}`
  const cached = blameCache.get(key)
  if (cached) {
    blameLines.value = cached
    blameError.value = ''
    return
  }
  blameLoading.value = true
  blameError.value = ''
  try {
    const lines = ((at ? await InspectService.BlameAtCommit(path, at) : await InspectService.Blame(path)) ?? []).filter(Boolean)
    blameCache.set(key, lines)
    if (inspect.file !== path || blameRef.value !== at) return
    blameLines.value = lines
  } catch (error) {
    if (inspect.file !== path || blameRef.value !== at) return
    blameLines.value = []
    blameError.value = error instanceof Error ? error.message : String(error)
  } finally {
    blameLoading.value = false
  }
}

type BlameRun = {
  hash: string
  shortHash: string
  author: string
  ago: string
  color: string
  lines: BlameLine[]
}

const blameRuns = computed<BlameRun[]>(() => {
  const runs: BlameRun[] = []
  for (const line of blameLines.value) {
    const last = runs[runs.length - 1]
    if (last && last.hash === line.Hash) {
      last.lines.push(line)
      continue
    }
    runs.push({
      hash: line.Hash,
      shortHash: line.ShortHash,
      author: line.Author,
      ago: formatAgo(line.Date),
      color: colorFor(line.Hash),
      lines: [line],
    })
  }
  return runs
})

function formatAgo(unixSeconds: string): string {
  const ts = Number(unixSeconds)
  if (!Number.isFinite(ts) || ts <= 0) return ''
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - ts)
  const steps: [number, string][] = [
    [60 * 60 * 24 * 365, 'y'],
    [60 * 60 * 24 * 30, 'mo'],
    [60 * 60 * 24 * 7, 'w'],
    [60 * 60 * 24, 'd'],
    [60 * 60, 'h'],
    [60, 'm'],
  ]
  for (const [size, label] of steps) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${label}`
  }
  return 'now'
}

function selectCommit(hash: string) {
  selectedHash.value = hash
}

function selectRun(run: BlameRun) {
  if (hashColor.value.has(run.hash)) selectedHash.value = run.hash
}

function reBlameAtSelected() {
  if (selected.value) blameRef.value = selected.value.Hash
}

function resetBlame() {
  blameRef.value = ''
}

function openInGraph() {
  if (selected.value) emit('navigate', 'graph', selected.value.Hash)
}

function copyHash() {
  if (selected.value) void navigator.clipboard?.writeText(selected.value.Hash)
}

function loadCommitFileContent(): Promise<string> {
  return InspectService.FileContent(selectedHash.value, file.value)
}

function stepSelection(offset: number) {
  if (!entries.value.length) return
  const index = entries.value.findIndex((entry) => entry.Hash === selectedHash.value)
  const next = entries.value[Math.min(entries.value.length - 1, Math.max(0, (index === -1 ? 0 : index) + offset))]
  if (next) selectedHash.value = next.Hash
}

function blameAt(hash: string) {
  blameRef.value = hash
  if (settings.inspectMode === 'log') settings.inspectMode = 'blame'
}

// vim navigation over the history rail — cursor is the selection, like the
// graph's commit list. Enter opens the commit in the graph, b blames at it.
const railEl = ref<HTMLElement | null>(null)
const railVim = useVimList(entries, {
  autoListen: false,
  text: (entry) => `${entry.Subject} ${entry.Author} ${entry.ShortHash}`,
  onAction(action, payload) {
    const entry = payload.items[0]
    if (action === 'open' && entry) emit('navigate', 'graph', entry.Hash)
  },
  bindings: {
    b: (api) => {
      const entry = entries.value[api.cursor.value]
      if (entry) blameAt(entry.Hash)
    },
  },
})

watch(
  () => railVim.cursor.value,
  (cursor) => {
    const entry = entries.value[cursor]
    if (entry) selectedHash.value = entry.Hash
    void nextTick(() => {
      railEl.value?.querySelectorAll<HTMLElement>('.fi-commit')[cursor]?.scrollIntoView?.({ block: 'nearest' })
    })
  },
)

// keep the vim cursor aligned when selection changes by click or scrubber
watch(selectedHash, (hash) => {
  const index = entries.value.findIndex((entry) => entry.Hash === hash)
  if (index >= 0 && railVim.cursor.value !== index) railVim.moveTo(index)
})

const inspectDiff = ref<InstanceType<typeof DiffView> | null>(null)
function onRailKey(event: KeyboardEvent) {
  if (!railVim.search.active.value && !isModified(event)) {
    if (event.key === 'g' || event.key === 'Escape') return
    if (['l', 'ArrowRight'].includes(event.key) && inspectDiff.value) {
      event.preventDefault(); inspectDiff.value.focus(); return
    }
  }
  if (railVim.handleKey(event)) event.preventDefault()
}

// vim over blame lines — Enter selects the line's commit, b re-blames at it,
// o jumps to it in the graph.
const blameEl = ref<HTMLElement | null>(null)
const blameVim = useVimList(blameLines, {
  autoListen: false,
  text: (line) => `${line.Content} ${line.Author} ${line.ShortHash}`,
  onAction(action, payload) {
    const line = payload.items[0]
    if (action === 'open' && line && hashColor.value.has(line.Hash)) selectedHash.value = line.Hash
  },
  bindings: {
    b: (api) => {
      const line = blameLines.value[api.cursor.value]
      if (line) blameAt(line.Hash)
    },
    o: (api) => {
      const line = blameLines.value[api.cursor.value]
      if (line) emit('navigate', 'graph', line.Hash)
    },
  },
})

watch(
  () => blameVim.cursor.value,
  (cursor) => {
    void nextTick(() => {
      blameEl.value?.querySelectorAll<HTMLElement>('.fi-bl')[cursor]?.scrollIntoView?.({ block: 'nearest' })
    })
  },
)

function onBlameKey(event: KeyboardEvent) {
  if (!blameVim.search.active.value && !isModified(event) && ['g', 'Escape'].includes(event.key)) return
  if (blameVim.handleKey(event)) event.preventDefault()
}

// keyboard-first: focus the active list when the mode changes or data lands
watch(
  [mode, () => entries.value.length],
  async ([activeMode, count]) => {
    if (!count) return
    await nextTick()
    if (activeMode === 'blame') blameEl.value?.focus()
    else railEl.value?.focus()
  },
  { immediate: true },
)

/* scrubber dots — oldest on the left, sized by change magnitude */
const scrubberDots = computed(() => {
  const list = [...entries.value].reverse()
  const count = list.length
  return list.map((entry, index) => {
    const churn = entry.Insertions + entry.Deletions
    const size = 7 + Math.min(9, Math.round(Math.log2(1 + churn) * 1.6))
    return {
      hash: entry.Hash,
      title: `${entry.ShortHash} · ${entry.Subject} · +${entry.Insertions} −${entry.Deletions}`,
      left: count > 1 ? (index / (count - 1)) * 100 : 50,
      size,
      color: colorFor(entry.Hash),
    }
  })
})

const modeOptions = [
  { id: 'log', label: 'Log' },
  { id: 'blame', label: 'Blame' },
  { id: 'inspector', label: 'Inspector' },
] as const

const shortRef = computed(() => blameRef.value.slice(0, 7))
</script>

<template>
  <div class="inspect-view">
    <div v-if="!file" class="inspect-empty">
      <p class="placeholder-kicker">inspect</p>
      <h2>Pick a file to inspect</h2>
      <p>
        Open the finder with <kbd>Ctrl+P</kbd> and choose a file, or use a file's
        history action in the graph commit detail.
      </p>
    </div>

    <template v-else>
      <div class="fi-toolbar">
        <span class="fi-file"><em v-if="fileDir">{{ fileDir }}</em>{{ fileName }}</span>
        <span v-if="entries.length" class="fi-pill">{{ entries.length }} commits</span>
        <span v-if="blameRef && mode !== 'log'" class="fi-pill fi-blame-at">
          blame @ {{ shortRef }}
          <button type="button" aria-label="Back to working tree blame" @click="resetBlame">
            <PhArrowCounterClockwise :size="16" weight="bold" />
          </button>
        </span>
        <span class="fi-spacer" />
        <UiButton
          size="sm"
          icon-only
          :active="settings.inspectScrubber"
          title="Timeline scrubber"
          :aria-pressed="settings.inspectScrubber"
          @click="settings.inspectScrubber = !settings.inspectScrubber"
        >
          <PhClockCounterClockwise :size="16" weight="bold" />
        </UiButton>
        <div class="fi-modes" role="radiogroup" aria-label="Inspect mode">
          <button
            v-for="option in modeOptions"
            :key="option.id"
            type="button"
            role="radio"
            :aria-checked="mode === option.id"
            :class="{ on: mode === option.id }"
            @click="settings.inspectMode = option.id"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div
        v-if="settings.inspectScrubber && entries.length"
        class="fi-scrubber"
        tabindex="0"
        role="group"
        aria-label="Commit timeline"
        @keydown.left.prevent="stepSelection(1)"
        @keydown.right.prevent="stepSelection(-1)"
      >
        <div class="fi-scrub-inner">
          <div class="fi-scrub-track" aria-hidden="true" />
          <button
            v-for="dot in scrubberDots"
            :key="dot.hash"
            type="button"
            class="fi-scrub-dot"
            :class="{ sel: dot.hash === selectedHash }"
            :style="{
              left: `${dot.left}%`,
              width: `${dot.size}px`,
              height: `${dot.size}px`,
              background: `var(${dot.color})`,
            }"
            :title="dot.title"
            @click="selectCommit(dot.hash)"
          />
        </div>
        <div class="fi-scrub-label">
          <span v-if="selected">
            <b>{{ selected.ShortHash }}</b> · {{ selected.Subject }} ·
            <i class="d-add">+{{ selected.Insertions }}</i> <i class="d-del">−{{ selected.Deletions }}</i>
          </span>
        </div>
      </div>

      <div v-if="logLoading" class="fi-state">Loading history…</div>
      <div v-else-if="logError" class="fi-state error">{{ logError }}</div>
      <div v-else-if="!entries.length" class="fi-state">No commits touch this file.</div>

      <div v-else class="fi-body" :class="`mode-${mode}`">
        <div
          v-if="mode !== 'blame'"
          ref="railEl"
          class="fi-rail"
          aria-label="File history"
          tabindex="0"
          @keydown="onRailKey" data-keyboard-pane @focusin="setModeline({ mode: 'HISTORY', hints: 'j/k commit · l diff · Enter graph · / search' })"
        >
          <div
            v-if="railVim.search.active.value || railVim.pending.value || railVim.count.value"
            class="vim-cmdline"
            aria-live="polite"
          >
            <template v-if="railVim.search.active.value">/{{ railVim.search.query.value }}<span class="vim-caret">▌</span></template>
            <template v-else>{{ railVim.count.value }}{{ railVim.pending.value }}</template>
          </div>
          <div class="fi-rail-track">
            <button
              v-for="entry in entries"
              :key="entry.Hash"
              type="button"
              class="fi-commit"
              :class="{ sel: entry.Hash === selectedHash }"
              :title="`${entry.ShortHash} · ${entry.Author} · ${entry.Date} · +${entry.Insertions} −${entry.Deletions}`"
              @click="selectCommit(entry.Hash)"
            >
              <AuthorAvatar :name="entry.Author" :commit="entry.Hash" :size="18" />
              <span class="fi-subj">{{ entry.Subject }}</span>
              <span class="fi-meta">{{ entry.ShortHash }}</span>
            </button>
          </div>
        </div>

        <div v-if="mode === 'log'" class="fi-pane">
          <div v-if="diffLoading" class="fi-state">Loading diff…</div>
          <div v-else-if="diffError" class="fi-state error">{{ diffError }}</div>
          <DiffView v-else read-only ref="inspectDiff" @exit="railEl?.focus()" @focusin="setModeline({ mode: 'READ', hints: 'j/k hunk · t layout · h history' })" :diff="diff" :file-level-only="true" :load-file-content="loadCommitFileContent" />
        </div>

        <div
          v-else
          ref="blameEl"
          class="fi-pane fi-blame"
          :class="{ 'has-detail': mode === 'inspector' }"
          tabindex="0"
          @keydown="onBlameKey" data-keyboard-pane @focusin="setModeline({ mode: 'BLAME', hints: 'j/k line · Enter select · b blame · o graph' })"
        >
          <div
            v-if="blameVim.search.active.value || blameVim.pending.value || blameVim.count.value"
            class="vim-cmdline"
            aria-live="polite"
          >
            <template v-if="blameVim.search.active.value">/{{ blameVim.search.query.value }}<span class="vim-caret">▌</span></template>
            <template v-else>{{ blameVim.count.value }}{{ blameVim.pending.value }}</template>
          </div>
          <div v-if="blameLoading" class="fi-state">Loading blame…</div>
          <div v-else-if="blameError" class="fi-state error">{{ blameError }}</div>
          <div v-else class="fi-ledger">
            <template v-for="run in blameRuns" :key="`${run.hash}:${run.lines[0]?.LineNumber}`">
              <div
                v-for="(line, lineIndex) in run.lines"
                :key="line.LineNumber"
                class="fi-bl"
                :class="{ hot: run.hash === selectedHash, cur: blameVim.isSelected((line.LineNumber ?? 1) - 1) }"
              >
                <button
                  type="button"
                  class="fi-bl-gutter"
                  :style="{ borderLeftColor: `var(${run.color})` }"
                  :title="`${run.shortHash} · ${run.author}`"
                  @click="selectRun(run)"
                >
                  <template v-if="lineIndex === 0">
                    <span class="fi-bl-hash">{{ run.shortHash }}</span>
                    <span class="fi-bl-author author-identity"><AuthorAvatar :name="run.author" :commit="run.hash" :size="16" /><span class="author-name">{{ run.author }}</span></span>
                    <span class="fi-bl-ago">{{ run.ago }}</span>
                  </template>
                </button>
                <span class="fi-bl-no">{{ line.LineNumber }}</span>
                <span class="fi-bl-tx">{{ line.Content }}</span>
              </div>
            </template>
          </div>
        </div>

        <aside v-if="mode === 'inspector' && selected" class="fi-detail">
          <h3>{{ selected.Subject }}</h3>
          <dl>
            <div>
              <dt>hash</dt>
              <dd>
                <button type="button" class="fi-hash" title="Copy full hash" @click="copyHash">
                  {{ selected.ShortHash }} <PhCopy weight="bold" :size="16" />
                </button>
              </dd>
            </div>
            <div>
              <dt>author</dt>
              <dd class="author-identity"><AuthorAvatar :name="selected.Author" :commit="selected.Hash" :size="20" />{{ selected.Author }}</dd>
            </div>
            <div>
              <dt>when</dt>
              <dd>{{ selected.Date }}</dd>
            </div>
            <div>
              <dt>this file</dt>
              <dd><i class="d-add">+{{ selected.Insertions }}</i> <i class="d-del">−{{ selected.Deletions }}</i></dd>
            </div>
          </dl>
          <div class="fi-actions">
            <UiButton size="sm" @click="openInGraph">
              <PhGitFork :size="16" weight="bold" /> Open in graph
            </UiButton>
            <UiButton size="sm" @click="reBlameAtSelected">
              <PhClockCounterClockwise :size="16" weight="bold" /> Blame at commit
            </UiButton>
          </div>
        </aside>
      </div>

      <div v-if="mode === 'blame' && selected" class="fi-blame-foot">
        <span class="fi-bl-hash">{{ selected.ShortHash }}</span>
        <AuthorAvatar :name="selected.Author" :commit="selected.Hash" :size="18" /><span class="fi-foot-subj">{{ selected.Subject }} · {{ selected.Author }} · {{ selected.Date }}</span>
        <span class="fi-spacer" />
        <UiButton size="sm" @click="reBlameAtSelected">re-blame here</UiButton>
        <UiButton size="sm" @click="openInGraph">graph</UiButton>
      </div>
    </template>
  </div>
</template>
