<script setup lang="ts">
import UiInput from '../common/UiInput.vue'
import UiIconButton from '../common/UiIconButton.vue'
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import GraphView from '../graph/GraphView.vue'
import ChangesView from '../status/ChangesView.vue'
import BranchesView from '../refs/BranchesView.vue'
import StashesView from '../refs/StashesView.vue'
import FileInspectView from '../inspect/FileInspectView.vue'
import SettingsModal from '../overlays/SettingsModal.vue'
import ToastViewport from '../overlays/ToastViewport.vue'
import WhichKey from './WhichKey.vue'
import FinderBar from './FinderBar.vue'
import { NAV_GROUPS, NAV_KEY_MAP } from './nav'
import { useModeline } from '../../composables/useModeline'
import { useRepoStatus } from '../../composables/useRepoStatus'
import { useShellSettings } from '../../composables/useShellSettings'
import { PhGitBranch, PhGearSix, PhMagnifyingGlass, PhSidebarSimple } from '@phosphor-icons/vue'

const settings = useShellSettings()
const primaryViews = NAV_GROUPS.flatMap(group => group.items).filter(item => ['graph', 'status', 'branches', 'stashes'].includes(item.id))
const previousDetailPosition = ref<'right' | 'bottom'>(settings.graphDetailPosition === 'bottom' ? 'bottom' : 'right')
function toggleInspector() {
  if (settings.graphDetailPosition === 'hidden') settings.graphDetailPosition = previousDetailPosition.value
  else {
    previousDetailPosition.value = settings.graphDetailPosition
    settings.graphDetailPosition = 'hidden'
  }
}
const modeline = useModeline()
const repo = useRepoStatus()
const activeView = ref('graph')
const settingsOpen = ref(false)
// Commit/ref to land on when the next view mounts (finder commit-enter, branches
// `o`). Read once by the target view, then cleared so a plain re-nav doesn't jump.
const focusRef = ref('')
const viewHistory: { view: string; focus: string }[] = []


type ViewMeta = {
  title: string
  group: string
  description: string
}

const graphMeta: ViewMeta = {
  title: 'Commit Graph',
  group: 'Worktree',
  description: 'History, refs, stashes, and working changes converge here before drilling into details.',
}

const views: Record<string, ViewMeta> = {
  graph: {
    ...graphMeta,
  },
  status: {
    title: 'Changes',
    group: 'Worktree',
    description: 'Stage, unstage, discard, and jump into line-level staging from the current worktree.',
  },
  staging: {
    title: 'Staging',
    group: 'Worktree',
    description: 'Interactive hunk and line staging for the selected file.',
  },
  conflicts: {
    title: 'Conflicts',
    group: 'Worktree',
    description: 'Resolve merge, rebase, and cherry-pick conflicts with ours/base/theirs panes.',
  },
  branches: {
    title: 'Branches',
    group: 'Refs',
    description: 'Local and remote branch refs, checkout, rename, delete, merge, and rebase entry points.',
  },
  tags: {
    title: 'Tags',
    group: 'Refs',
    description: 'Release refs and tag operations live here, separate from branch navigation.',
  },
  stashes: {
    title: 'Stash',
    group: 'Refs',
    description: 'Saved worktree snapshots with apply, pop, branch, and diff actions.',
  },
  sync: {
    title: 'Sync',
    group: 'Remote',
    description: 'Fetch, pull, push, upstream setup, and ahead/behind state for the active branch.',
  },
  prs: {
    title: 'Pull Requests',
    group: 'Remote',
    description: 'Provider-backed pull requests, review state, checkout, files, checks, and merge actions.',
  },
  remotes: {
    title: 'Remotes',
    group: 'Remote',
    description: 'Remote names, URLs, default upstreams, prune/fetch settings, and add/remove flows.',
  },
  diff: {
    title: 'Diff',
    group: 'Inspect',
    description: 'Unified diffs for commits, files, staged work, unstaged work, and ref comparisons.',
  },
  blame: {
    title: 'Blame',
    group: 'Inspect',
    description: 'Line attribution for a selected file with commit drill-down.',
  },
  'file-log': {
    title: 'File Log',
    group: 'Inspect',
    description: 'Per-file history with blame and commit detail jumps.',
  },
  finder: {
    title: 'Finder',
    group: 'Inspect',
    description: 'Fuzzy navigation across commands, branches, files, commits, and saved destinations.',
  },
  commit: {
    title: 'Commit',
    group: 'Worktree',
    description: 'Compose and amend commits from staged changes.',
  }
}

const activeMeta = computed<ViewMeta>(() => views[activeView.value] ?? graphMeta)
const viewTitle = computed(() => activeMeta.value.title)

// Real counts from repo status; segments hide when zero so the modeline stays quiet.
const modelineCounts = computed(() => {
  const info = repo.info
  if (!info) return [] as { id: string; label: string; count: string; tone: string }[]
  const changes = info.Unstaged.Files + info.Unstaged.Untracked
  const staged = info.Staged.Files
  const sync = [info.Ahead ? `↑${info.Ahead}` : '', info.Behind ? `↓${info.Behind}` : ''].filter(Boolean).join(' ')
  const segs = [] as { id: string; label: string; count: string; tone: string }[]
  if (changes) segs.push({ id: 'status', label: 'changes', count: String(changes), tone: 'warn' })
  if (staged) segs.push({ id: 'commit', label: 'staged', count: String(staged), tone: 'good' })
  if (sync) segs.push({ id: 'sync', label: 'sync', count: sync, tone: 'sync' })
  if (info.StashCount) segs.push({ id: 'stashes', label: 'stash', count: String(info.StashCount), tone: '' })
  return segs
})
const branchLabel = computed(() => repo.info?.Branch || 'detached')
const repoName = computed(() => repo.info?.Name || 'ichi')
const repoPath = computed(() => repo.info?.Path || 'Repository')
const worktreeCount = computed(() => {
  const info = repo.info
  if (!info) return 0
  return info.Staged.Files + info.Unstaged.Files + info.Unstaged.Untracked
})

const path = computed(() => `~/ichi/${activeView.value}`)
const leaderOpen = ref(false)
const finderOpen = ref(false)
let finderReturn: HTMLElement | null = null
watch(finderOpen, (open) => {
  if (open) finderReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null
  else void nextTick(() => { if (finderReturn?.isConnected) finderReturn.focus() })
})

const headerQuery = ref('')
const finderInitialQuery = ref('')
function searchFromHeader() {
  finderInitialQuery.value = headerQuery.value.trim()
  leaderOpen.value = false
  finderOpen.value = true

}

function setView(view: string, focus = '') {
  // finder is an overlay, not a view surface
  if (view === 'finder') {
    leaderOpen.value = false
    finderInitialQuery.value = ''
    finderOpen.value = true
    return
  }
  if (view !== activeView.value) {
    const selected = document.querySelector<HTMLElement>('.commit-row.selected')
    viewHistory.push({ view: activeView.value, focus: activeView.value === 'graph' ? selected?.dataset.commitHash || focusRef.value : focusRef.value })
    if (viewHistory.length > 30) viewHistory.shift()
  }
  focusRef.value = focus
  activeView.value = view
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta'])

function handleShellKeydown(event: KeyboardEvent) {
  // Views consume their own keys (element handlers run before this window
  // listener in the bubble phase) — a handled key must not also navigate.
  if (event.defaultPrevented || settingsOpen.value || finderOpen.value || document.querySelector('[aria-modal="true"], .ctx-menu')) return
  if (isEditableTarget(event.target)) return
  if (MODIFIER_KEYS.has(event.key)) return

  if (leaderOpen.value) {
    // Any key resolves the chord: matching key jumps, everything else dismisses.
    event.preventDefault()
    leaderOpen.value = false
    if (event.key === 'Escape' || event.key === ' ') return
    const view = NAV_KEY_MAP.get(event.key.toLowerCase())
    if (view) setView(view)
    return
  }

  if (event.key === 'Escape') {
    const previous = viewHistory.pop()
    if (previous) {
      event.preventDefault()
      focusRef.value = previous.focus
      activeView.value = previous.view
    }
    return
  }
  if (event.key === ' ') {
    // Space must still activate focused buttons and select stash files.
    if (event.target instanceof HTMLElement && event.target.closest('button, [role="tab"]')) return
    event.preventDefault()
    leaderOpen.value = true
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
    event.preventDefault()
    setView('finder')
    return
  }

  // Direct single-key jumps mirror the leader chords for muscle memory.
  if (event.ctrlKey || event.metaKey || event.altKey) return
  const view = NAV_KEY_MAP.get(event.key.toLowerCase())
  if (!view) return
  event.preventDefault()
  setView(view)
}

function handleShellCapture(event: KeyboardEvent) {
  if (event.isComposing || leaderOpen.value) return
  if (settingsOpen.value || finderOpen.value || document.querySelector('[aria-modal="true"], .ctx-menu')) return
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
    event.preventDefault()
    event.stopPropagation()
    setView('finder')
    return
  }
  if (event.ctrlKey && event.key === ' ' && !isEditableTarget(event.target)) { event.preventDefault(); event.stopPropagation(); leaderOpen.value = true; return }
  if (event.key !== 'F6' || event.ctrlKey || event.metaKey || event.altKey) return
  const panes = Array.from(document.querySelectorAll<HTMLElement>('.main-island [data-keyboard-pane]')).filter(el => el.getClientRects().length && !el.closest('[inert]'))
  if (!panes.length) return
  const current = panes.findIndex(el => el.contains(document.activeElement))
  const next = (current + (event.shiftKey ? -1 : 1) + panes.length) % panes.length
  event.preventDefault()
  event.stopPropagation()
  panes[next]?.focus()
}
onMounted(() => window.addEventListener('keydown', handleShellCapture, true))
onUnmounted(() => window.removeEventListener('keydown', handleShellCapture, true))

function selectFromPanel(view: string) {
  leaderOpen.value = false
  setView(view)
}

onMounted(() => window.addEventListener('keydown', handleShellKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleShellKeydown))

</script>

<template>
  <main class="ichi-shell">
    <header class="topbar">
      <div class="repo-context" :title="repoPath">
        <span class="app-wordmark">ichi</span>
        <span class="repo-divider" aria-hidden="true">/</span>
        <span class="repo-name">{{ repoName }}</span>
        <span class="repo-divider" aria-hidden="true">/</span>
        <span class="repo-branch"><PhGitBranch :size="16" weight="bold" />{{ branchLabel }}</span>
        <span v-if="worktreeCount" class="repo-dirty" :title="`${worktreeCount} changed files`">
          <i aria-hidden="true" />{{ worktreeCount }} changed
        </span>
      </div>
      <div class="topbar-actions">
        <form class="titlebar-search ui-control size-sm" role="search" @submit.prevent="searchFromHeader">
          <PhMagnifyingGlass weight="bold" :size="16" aria-hidden="true" />
          <UiInput
            size="sm"
            v-model="headerQuery"
            type="search"
            aria-label="Search commits, files, and refs"
            placeholder="Find commits, files, refs"
            autocomplete="off"
            spellcheck="false"
            @focus="finderOpen = false"
          />
          <button type="submit" aria-label="Search" title="Search (Enter)"><kbd>↵</kbd></button>
        </form>
        <UiIconButton class="titlebar-icon" size="sm" label="Settings" @click="finderOpen = false; settingsOpen = true">
          <PhGearSix :size="16" weight="bold" />
        </UiIconButton>
      </div>
    </header>

    <div class="body-shell">

      <section class="main-island" aria-live="polite">
        <header class="island-header">
          <h1 class="sr-only">{{ viewTitle }}</h1>
          <nav class="primary-nav" aria-label="Repository views">
            <button
              v-for="item in primaryViews"
              :key="item.id"
              type="button"
              :aria-current="activeView === item.id || (item.id === 'status' && activeView === 'commit') ? 'page' : undefined"
              :title="`${item.label} (${item.key})`"
              @click="setView(item.id)"
            >{{ item.label }}<span aria-hidden="true">{{ item.key }}</span></button>
            <span v-if="!primaryViews.some(item => item.id === activeView) && activeView !== 'commit'" class="secondary-view-title">{{ viewTitle }}</span>
          </nav>
          <div id="view-header-context" class="header-context" aria-label="Repository status" />
        </header>

        <GraphView v-if="activeView === 'graph'" :focus-hash="focusRef" @navigate="setView" />

        <ChangesView
          v-else-if="activeView === 'status' || activeView === 'commit'"
          :focus-commit="activeView === 'commit'"
          :focus-key="focusRef"
          @navigate="setView"
        />

        <BranchesView v-else-if="activeView === 'branches'" @navigate="setView" />

        <StashesView v-else-if="activeView === 'stashes'" />

        <FileInspectView
          v-else-if="activeView === 'file-log' || activeView === 'blame'"
          :focus-file="focusRef"
          :mode-hint="activeView"
          @navigate="setView"
        />

        <div v-else class="view-placeholder">
          <div class="graph-lines" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div>
            <p class="placeholder-kicker">{{ path }}</p>
            <h2>{{ viewTitle }} surface</h2>
            <p>{{ activeMeta.description }}</p>
          </div>
        </div>
      </section>
    </div>

    <WhichKey v-if="leaderOpen" @select="selectFromPanel" @close="leaderOpen = false" />
    <FinderBar v-if="finderOpen" :initial-query="finderInitialQuery" @close="finderOpen = false" @navigate="setView" />

    <footer class="modeline">
      <span class="ml-mode">{{ modeline.mode }}</span>
      <button
        class="ml-go"
        type="button"
        :aria-expanded="leaderOpen"
        aria-label="Go to view"
        @click="leaderOpen = !leaderOpen"
      >
        <kbd>␣</kbd> go
      </button>
      <span class="ml-hints">{{ modeline.hints }} · F6 panes · Esc back</span>
      <button v-if="activeView === 'graph'" class="ml-go" type="button" :aria-expanded="settings.graphDetailPosition !== 'hidden'" aria-controls="commit-inspector" @click="toggleInspector">
        <PhSidebarSimple weight="bold" :size="16" /> Inspector
      </button>
      <button
        v-for="seg in modelineCounts"
        :key="seg.id"
        class="ml-count"
        :class="seg.tone"
        type="button"
        :title="`Go to ${seg.id}`"
        @click="setView(seg.id)"
      >
        {{ seg.label }} {{ seg.count }}
      </button>
    </footer>

    <SettingsModal v-if="settingsOpen" @close="settingsOpen = false" />
    <ToastViewport />
  </main>
</template>
