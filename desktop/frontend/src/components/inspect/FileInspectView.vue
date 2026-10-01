<script setup lang="ts">
import AuthorAvatar from '../common/AuthorAvatar.vue'
import { computed, nextTick, ref, shallowRef, markRaw, watch } from 'vue'
import { DiffService, InspectService } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import type { BlameLine, FileDiff, FileLogEntry } from '../../bindings/github.com/atterpac/ichi/internal/git'
import { usePreferenceBindings } from '../../customization/usePreferences'
import { useFileInspect } from '../../composables/useFileInspect'
import { useVimList } from '../../composables/useVimList'
import { laneColorVar } from '../graph/laneColors'
import { setModeline } from '../../composables/useModeline'
import { isModified } from '../../composables/keyboard'
import { createBoundedLru } from '../../composables/boundedLru'
import { useVirtualWindow } from '../../composables/useVirtualWindow'
import { estimateDiffBytes } from '../status/fileDiffCache'
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

const settings = usePreferenceBindings()
const inspect = useFileInspect()

const entries = ref<FileLogEntry[]>([])
const logLoading = ref(false)
const logError = ref('')
const selectedHash = ref('')

const diffCache = createBoundedLru<string, FileDiff | null>({ maxEntries: 24, maxBytes: 8 * 1024 * 1024, sizeOf: estimateDiffBytes })
const diff = shallowRef<FileDiff | null>(null)
const diffLoading = ref(false)
const diffError = ref('')

/** '' = blame the working tree, otherwise a commit hash */
const blameRef = ref('')
const blameCache = createBoundedLru<string, BlameLine[]>({ maxEntries: 8, maxBytes: 8 * 1024 * 1024,
  sizeOf: lines => lines.reduce((bytes, line) => bytes + 192 + 2 * (line.Content.length + line.Author.length + line.AuthorMail.length + line.Hash.length), 0),
})
const blameLines = shallowRef<BlameLine[]>([])
const blameLoading = ref(false)
const blameError = ref('')

const mode = computed(() => settings['inspect.mode'])
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
    if (hint === 'blame') settings['inspect.mode'] = 'blame'
    else if (hint === 'file-log' && settings['inspect.mode'] === 'blame') settings['inspect.mode'] = 'log'
  },
  { immediate: true },
)

watch(
  file,
  async (path, _, onCleanup) => {
    let cancelled = false
    let request: { cancel?: () => void } | undefined
    onCleanup(() => { cancelled = true; request?.cancel?.() })
    logLoading.value = false
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
      const pending = InspectService.FileLog(path, 300)
      request = pending
      const log = ((await pending) ?? []).filter(Boolean)
      if (cancelled || inspect.file !== path) return
      entries.value = log
      selectedHash.value = log[0]?.Hash ?? ''
    } catch (error) {
      if (!cancelled) logError.value = error instanceof Error ? error.message : String(error)
    } finally {
      if (!cancelled) logLoading.value = false
    }
  },
  { immediate: true },
)

watch([selectedHash, mode, file], async ([hash, activeMode, path], _, onCleanup) => {
  let cancelled = false
  let request: { cancel?: () => void } | undefined
  onCleanup(() => { cancelled = true; request?.cancel?.() })
  diffLoading.value = false
  diff.value = null
  diffError.value = ''
  if (!hash || !path || activeMode !== 'log') return
  const key = JSON.stringify([path, hash])
  const cached = diffCache.get(key)
  if (cached !== undefined) {
    diff.value = cached
    if (!cached) diffError.value = 'File not present in this commit under its current path.'
    return
  }
  diffLoading.value = true
  try {
    const pending = DiffService.FileDiff(hash, path)
    request = pending
    const parsed = (await pending).filter(Boolean)
    if (cancelled) return
    const first = parsed[0] ? markRaw(parsed[0]) : null
    diffCache.set(key, first)
    diff.value = first
    if (!first) diffError.value = 'File not present in this commit under its current path.'
  } catch (error) {
    if (!cancelled) diffError.value = error instanceof Error ? error.message : String(error)
  } finally { if (!cancelled) diffLoading.value = false }
}, { immediate: true })

watch([mode, blameRef, file], async ([activeMode, at, path], _, onCleanup) => {
  let cancelled = false
  let request: { cancel?: () => void } | undefined
  onCleanup(() => { cancelled = true; request?.cancel?.() })
  blameLoading.value = false
  blameError.value = ''
  blameLines.value = []
  if (!path || activeMode === 'log') return
  const key = JSON.stringify([at, path])
  const cached = blameCache.get(key)
  if (cached) { blameLines.value = cached; return }
  blameLoading.value = true
  try {
    const pending = at ? InspectService.BlameAtCommit(path, at) : InspectService.Blame(path)
    request = pending
    const lines = ((await pending) ?? []).filter(Boolean)
    if (cancelled) return
    blameCache.set(key, lines)
    blameLines.value = lines
  } catch (error) {
    if (!cancelled) blameError.value = error instanceof Error ? error.message : String(error)
  } finally { if (!cancelled) blameLoading.value = false }
}, { immediate: true })

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

function selectRun(hash: string) {
  if (hashColor.value.has(hash)) selectedHash.value = hash
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
  if (settings['inspect.mode'] === 'log') settings['inspect.mode'] = 'blame'
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
const { window: blameWindow, scrollToRow: scrollToBlame } = useVirtualWindow({
  count: () => blameLines.value.length, rowHeight: 19, container: blameEl,
})
const visibleBlame = computed(() => blameLines.value.slice(blameWindow.value.start, blameWindow.value.end).map((line, index) => ({
  line, color: colorFor(line.Hash), ago: formatAgo(line.Date),
  first: index === 0 || blameLines.value[blameWindow.value.start + index - 1]?.Hash !== line.Hash,
})))
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
    scrollToBlame(cursor)
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
          :active="settings['inspect.scrubber']"
          title="Timeline scrubber"
          :aria-pressed="settings['inspect.scrubber']"
          @click="settings['inspect.scrubber'] = !settings['inspect.scrubber']"
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
            @click="settings['inspect.mode'] = option.id"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div
        v-if="settings['inspect.scrubber'] && entries.length"
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
          <div v-if="blameLoading" class="fi-state">Loading blame…</div>
          <div v-else-if="blameError" class="fi-state error">{{ blameError }}</div>
          <div v-else class="fi-ledger" :style="{ height: `${blameWindow.totalHeight}px`, padding: '0', position: 'relative' }">
            <div :style="{ transform: `translateY(${blameWindow.offsetY}px)` }">
            <template v-for="({ line, color, ago, first }, index) in visibleBlame" :key="line.LineNumber">
              <div
                class="fi-bl"
                :class="{ hot: line.Hash === selectedHash, cur: blameVim.isSelected(blameWindow.start + index) }"
              >
                <button
                  type="button"
                  class="fi-bl-gutter"
                  :style="{ borderLeftColor: `var(${color})` }"
                  :title="`${line.ShortHash} · ${line.Author}`"
                  @click="selectRun(line.Hash)"
                >
                  <template v-if="first">
                    <span class="fi-bl-hash">{{ line.ShortHash }}</span>
                    <span class="fi-bl-author author-identity"><AuthorAvatar :name="line.Author" :commit="line.Hash" :size="16" /><span class="author-name">{{ line.Author }}</span></span>
                    <span class="fi-bl-ago">{{ ago }}</span>
                  </template>
                </button>
                <span class="fi-bl-no">{{ line.LineNumber }}</span>
                <span class="fi-bl-tx">{{ line.Content }}</span>
              </div>
            </template>
            </div>
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
