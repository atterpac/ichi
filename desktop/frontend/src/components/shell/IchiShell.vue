<script setup lang="ts">
import { useWindowChrome } from '../../composables/useWindowChrome'
import ConflictsView from '../conflicts/ConflictsView.vue'
import { useConflictWorkspace } from '../../composables/useConflictWorkspace'
import GitProfilesPage from '../overlays/GitProfilesPage.vue'
import AppearanceLab from '../overlays/AppearanceLab.vue'
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
import RepoSwitcher from './RepoSwitcher.vue'
import IchiMenu from './IchiMenu.vue'
import { useGitProfiles } from '../../composables/useGitProfiles'
import { NAV_GROUPS, NAV_KEY_MAP } from './nav'
import { useModeline } from '../../composables/useModeline'
import { useRepoStatus } from '../../composables/useRepoStatus'
import { useShellSettings } from '../../composables/useShellSettings'
import { PhGitBranch, PhGearSix, PhMagnifyingGlass, PhSidebarSimple, PhCaretUp, PhGitDiff, PhCheckCircle, PhArrowsDownUp, PhArchive, PhKeyboard } from '@phosphor-icons/vue'

const { reserveTrafficLights } = useWindowChrome()
const profiles = useGitProfiles()
const settingsProfile = ref('')
const profilePage = ref<InstanceType<typeof GitProfilesPage>>()
function openProfileSettings(id = '') { settingsProfile.value = id; settingsOpen.value = false; finderOpen.value = false; setView('profiles') }
const settings = useShellSettings()
const primaryViews = computed(() => NAV_GROUPS.flatMap(group => group.items).filter(item =>
  ['graph', 'status', 'branches', 'stashes'].includes(item.id) ||
  (item.id === 'conflicts' && (activeView.value === 'conflicts' || conflictWorkspace.active.value)),
))
const previousDetailPosition = ref<'right' | 'bottom'>(settings.graphDetailPosition === 'bottom' ? 'bottom' : 'right')
function toggleInspector() {
  if (settings.graphDetailPosition === 'hidden') settings.graphDetailPosition = previousDetailPosition.value
  else {
    previousDetailPosition.value = settings.graphDetailPosition
    settings.graphDetailPosition = 'hidden'
  }
}
const modeline = useModeline()
const helpHeld = ref(false)
const helpPinned = ref(false)
const shortcutsVisible = computed(() => helpHeld.value || helpPinned.value)
const interactionMode = computed(() => {
  const mode = modeline.mode.toUpperCase()
  if (mode === 'VISUAL') return 'Select'
  if (mode === 'EDIT' || mode === 'INSERT') return 'Edit'
  if (mode === 'COMMIT') return 'Commit'
  if (mode === 'NORMAL' && ['status', 'staging'].includes(activeView.value)) return 'Review'
  return ''
})
const shortcutHints = computed(() => [...new Set([
  ...modeline.hints.split(' · ').filter(Boolean), 'Space · Go to view', 'F6 · Switch pane', 'Esc · Back',
])])
function releaseShortcutHelp(event: KeyboardEvent) {
  if (event.key === '?' || event.code === 'Slash' || event.key === 'Shift') helpHeld.value = false
}
function dismissShortcutHelp() { helpHeld.value = false; helpPinned.value = false }
onMounted(() => {
  window.addEventListener('keyup', releaseShortcutHelp)
  window.addEventListener('blur', dismissShortcutHelp)
})
onUnmounted(() => {
  window.removeEventListener('keyup', releaseShortcutHelp)
  window.removeEventListener('blur', dismissShortcutHelp)
})
const repo = useRepoStatus()
const conflictWorkspace = useConflictWorkspace()
const conflictsPage = ref<InstanceType<typeof ConflictsView>>()
const activeView = ref('graph')
const settingsOpen = ref(false)
const appearanceLabOpen = ref(false)
function openAppearanceLab() { settingsOpen.value = false; appearanceLabOpen.value = true }
const ichiMenuOpen = ref(false)
function openIchiMenu() {
  dismissShortcutHelp()
  finderOpen.value = false
  leaderOpen.value = false
  ichiMenuOpen.value = true
}
const settingsCategory = ref<'appearance' | 'workspaces'>('appearance')
function openWorkspaceSettings(profile = '') { settingsProfile.value = profile; settingsCategory.value = 'workspaces'; settingsOpen.value = true; finderOpen.value = false }
function openSettings() { settingsProfile.value = ''; settingsCategory.value = 'appearance'; settingsOpen.value = true; finderOpen.value = false }
function switcherOpened() { finderOpen.value = false; leaderOpen.value = false }
watch(() => repo.info?.Path, (path, previous) => {
  if (previous && path !== previous) { focusRef.value = ''; viewHistory.length = 0; finderOpen.value = false; leaderOpen.value = false }
})
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
  'conflict-demo': { title: 'Conflict demo', group: 'Practice', description: 'Practice resolving conflicts with sample files.' },
  profiles: { title: 'Git Profiles', group: 'Git settings', description: 'Manage identities, signing, and workspace assignments.' },
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

// File counts and line totals stay separate; untracked files have no diff totals yet.
const statusIcons = { status: PhGitDiff, commit: PhCheckCircle, sync: PhArrowsDownUp, stashes: PhArchive }
type StatusSegment = {
  id: keyof typeof statusIcons
  label: string
  count: string
  tone: string
  description: string
  additions?: number
  deletions?: number
}
const modelineCounts = computed<StatusSegment[]>(() => {
  const info = repo.info
  if (!info) return []
  const changes = info.Unstaged.Files + info.Unstaged.Untracked
  const staged = info.Staged.Files
  const segs: StatusSegment[] = []
  if (changes) segs.push({
    id: 'status', label: 'Changes', count: String(changes), tone: 'warn',
    additions: info.Unstaged.Insertions, deletions: info.Unstaged.Deletions,
    description: `Review ${changes} changed files: ${info.Unstaged.Insertions} added and ${info.Unstaged.Deletions} removed lines in tracked files${info.Unstaged.Untracked ? `; ${info.Unstaged.Untracked} untracked files` : ''}`,
  })
  if (staged) segs.push({
    id: 'commit', label: 'Staged', count: String(staged), tone: 'good',
    additions: info.Staged.Insertions, deletions: info.Staged.Deletions,
    description: `Review ${staged} staged files: ${info.Staged.Insertions} added and ${info.Staged.Deletions} removed lines`,
  })
  if (info.Ahead || info.Behind) segs.push({
    id: 'sync', label: 'Sync', count: [info.Ahead ? `↑${info.Ahead}` : '', info.Behind ? `↓${info.Behind}` : ''].filter(Boolean).join(' '), tone: 'sync',
    description: `Sync: ${info.Ahead} commits ahead, ${info.Behind} behind`,
  })
  if (info.StashCount) segs.push({ id: 'stashes', label: 'Stash', count: String(info.StashCount), tone: '', description: `Open ${info.StashCount} saved stashes` })
  return segs
})
const branchLabel = computed(() => repo.info?.Branch || 'detached')
const repoPath = computed(() => repo.info?.Path || 'Repository')
const worktreeCount = computed(() => {
  const info = repo.info
  if (!info) return 0
  return info.Staged.Files + info.Unstaged.Files + info.Unstaged.Untracked
})

const path = computed(() => `~/ichi/${activeView.value}`)
const leaderOpen = ref(false)
const leaderVisible = ref(false)
let leaderTimer: ReturnType<typeof setTimeout> | undefined
watch(leaderOpen, open => {
  clearTimeout(leaderTimer)
  leaderVisible.value = false
  if (open) {
    dismissShortcutHelp()
    leaderTimer = setTimeout(() => { leaderVisible.value = leaderOpen.value }, 220)
  }
}, { flush: 'sync' })
function cancelLeader() { leaderOpen.value = false }
function dismissLeaderOutside(event: PointerEvent) {
  if (!(event.target instanceof Element) || !event.target.closest('.whichkey')) cancelLeader()
}
onMounted(() => {
  window.addEventListener('pointerdown', dismissLeaderOutside)
  window.addEventListener('blur', cancelLeader)
})
onUnmounted(() => {
  clearTimeout(leaderTimer)
  window.removeEventListener('pointerdown', dismissLeaderOutside)
  window.removeEventListener('blur', cancelLeader)
})
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
  if (view !== activeView.value && view !== 'finder' && ['conflicts', 'conflict-demo'].includes(activeView.value) && conflictsPage.value && !conflictsPage.value.canLeave()) return
  if (view !== activeView.value && view !== 'finder' && activeView.value === 'profiles' && profilePage.value && !profilePage.value.canLeave()) return

  dismissShortcutHelp()
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
  if (event.target instanceof Element && event.target.closest('.appearance-lab')) return
  if (isEditableTarget(event.target)) return
  if (MODIFIER_KEYS.has(event.key)) return

  if (event.key === 'Escape') {
    if (['conflicts', 'conflict-demo'].includes(activeView.value) && conflictsPage.value && !conflictsPage.value.canLeave()) return
    if (activeView.value === 'profiles' && profilePage.value && !profilePage.value.canLeave()) return
    const previous = viewHistory.pop()
    if (previous) {
      event.preventDefault()
      focusRef.value = previous.focus
      activeView.value = previous.view
    }
    return
  }
  if (event.key === ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (event.repeat) return
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
  if (event.isComposing) return
  if ((event.ctrlKey || event.metaKey) && event.altKey && event.code === 'KeyD') {
    event.preventDefault(); event.stopPropagation(); appearanceLabOpen.value = !appearanceLabOpen.value; return
  }
  if (event.target instanceof Element && event.target.closest('.appearance-lab')) return
  if (leaderOpen.value) {
    if (MODIFIER_KEYS.has(event.key)) return
    if (event.repeat) { event.preventDefault(); event.stopPropagation(); return }
    leaderOpen.value = false
    // Cancel on Tab so focus can move normally; pointer activation also cancels.
    if (event.key === 'Tab') return
    event.preventDefault()
    event.stopPropagation()
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const view = NAV_KEY_MAP.get(event.key.toLowerCase())
    if (view) setView(view)
    return
  }
  if (settingsOpen.value || finderOpen.value || document.querySelector('[aria-modal="true"], .ctx-menu')) return
  if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey && !isEditableTarget(event.target)) {
    event.preventDefault()
    event.stopPropagation()
    helpHeld.value = true
    return
  }
  if (event.key === 'Escape' && shortcutsVisible.value) {
    event.preventDefault()
    event.stopPropagation()
    dismissShortcutHelp()
    return
  }
  if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') ||
      (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !isEditableTarget(event.target))) {
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
  <main class="ichi-shell" :class="{ 'has-traffic-lights': reserveTrafficLights }">
    <header class="topbar">
      <div class="repo-context" :title="repoPath">
        <RepoSwitcher :disabled="settingsOpen" @settings="openWorkspaceSettings" @opened="switcherOpened" />
        <span class="repo-divider" aria-hidden="true">/</span>
        <span class="repo-branch" :title="branchLabel"><PhGitBranch :size="16" weight="bold" /><span>{{ branchLabel }}</span></span>
        <span v-if="worktreeCount" class="repo-dirty" :title="`${worktreeCount} changed files`">
          <i aria-hidden="true" />{{ worktreeCount }} changed
        </span>
        <div id="view-header-context" class="header-context" aria-label="Repository actions" :inert="repo.switching || profiles.state.syncing || !!profiles.state.syncError || undefined" />
      </div>
      <nav class="primary-nav" aria-label="Repository views" :inert="repo.switching || profiles.state.syncing || undefined">
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
      <div class="header-tools">
        <form class="titlebar-search ui-control size-lg" role="search" @submit.prevent="searchFromHeader">
          <PhMagnifyingGlass weight="bold" :size="16" aria-hidden="true" />
          <UiInput
            size="lg"
            v-model="headerQuery"
            type="search"
            aria-label="Search commits, files, and refs"
            placeholder="Search commits, files, and refs…"
            autocomplete="off"
            spellcheck="false"
            @focus="finderOpen = false"
          />
          <button type="submit" aria-label="Search" title="Search (Enter)"><kbd>↵</kbd></button>
        </form>
        <div class="topbar-actions">
          <UiIconButton v-if="activeView === 'graph'" size="sm" label="Toggle inspector" :aria-expanded="settings.graphDetailPosition !== 'hidden'" aria-controls="commit-inspector" @click="toggleInspector">
            <PhSidebarSimple weight="bold" :size="16" />
          </UiIconButton>

          <UiIconButton class="titlebar-icon" size="sm" label="Settings" @click="openSettings">
            <PhGearSix :size="16" weight="bold" />
          </UiIconButton>
        </div>
      </div>
    </header>

    <div v-if="profiles.state.syncError" class="profile-sync-error" role="alert">Could not apply workspace identity: {{ profiles.state.syncError }} <button @click="openProfileSettings()">Manage profiles</button><button @click="profiles.sync().catch(() => {})">Retry</button></div>
    <div class="body-shell">

      <section class="main-island" aria-live="polite" :inert="repo.switching || profiles.state.syncing || (!!profiles.state.syncError && activeView !== 'profiles' && activeView !== 'conflict-demo') || undefined" :aria-busy="repo.switching">
        <h1 class="sr-only">{{ viewTitle }}</h1>

        <div v-if="conflictWorkspace.active.value && activeView !== 'conflicts'" class="shell-conflict-banner" role="status">
          <span>{{ conflictWorkspace.state.data?.Kind || 'Git' }} · {{ conflictWorkspace.state.data?.Files.length || 0 }} unresolved files</span>
          <button type="button" class="ui-button size-sm" @click="setView('conflicts')">{{ conflictWorkspace.state.data?.Files.length ? 'Resolve conflicts' : 'Continue operation' }}</button>
        </div>
        <ConflictsView ref="conflictsPage" :key="`${activeView}-${repo.revision}`" v-if="activeView === 'conflicts' || activeView === 'conflict-demo'" :demo="activeView === 'conflict-demo'" :focus-file="focusRef" @navigate="setView" />

        <GitProfilesPage ref="profilePage" v-else-if="activeView === 'profiles'" :initial-profile="settingsProfile" />

        <GraphView :key="repo.revision" v-else-if="activeView === 'graph'" :focus-hash="focusRef" @navigate="setView" />

        <ChangesView :key="repo.revision"
          v-else-if="activeView === 'status' || activeView === 'commit'"
          :focus-commit="activeView === 'commit'"
          :focus-key="focusRef"
          @navigate="setView"
        />

        <BranchesView :focus-branch="focusRef" :key="repo.revision" v-else-if="activeView === 'branches'" @navigate="setView" />

        <StashesView :key="repo.revision" v-else-if="activeView === 'stashes'" />

        <FileInspectView :key="repo.revision"
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

    <WhichKey v-if="leaderVisible" :active-view="activeView" :show-commit="activeView === 'status' || activeView === 'commit' || (repo.info?.Staged.Files ?? 0) > 0" @select="selectFromPanel" @close="leaderOpen = false" />
    <FinderBar v-if="finderOpen" :initial-query="finderInitialQuery" @close="finderOpen = false" @navigate="setView" @profile="openProfileSettings" />

    <aside v-if="shortcutsVisible" id="status-shortcuts" class="status-shortcuts" aria-label="Keyboard shortcuts">
      <div class="status-shortcuts-heading"><span>Keyboard shortcuts</span><span>{{ helpHeld ? 'Release ? to hide' : 'Esc to close' }}</span></div>
      <div class="status-shortcuts-list"><span v-for="hint in shortcutHints" :key="hint">{{ hint }}</span></div>
    </aside>
    <footer class="modeline">
      <span v-if="interactionMode" class="ml-mode" :class="{ 'is-editing': interactionMode === 'Edit' }">{{ interactionMode }}</span>
      <button class="ml-help" type="button" aria-label="Keyboard shortcuts (hold ?)" :aria-expanded="shortcutsVisible" aria-controls="status-shortcuts" title="Hold ? for shortcuts" @click="helpPinned = !helpPinned"><PhKeyboard :size="14" aria-hidden="true" /><span>Shortcuts</span><kbd aria-hidden="true">?</kbd></button>
      <span class="ml-space" />
      <span v-if="repo.switching" class="ml-operation" role="status">Switching repository…</span>
      <nav class="ml-status" aria-label="Repository summary">
        <button
          v-for="seg in modelineCounts"
          :key="seg.id"
          class="ml-count"
          :class="seg.tone"
          type="button"
          :title="seg.description"
          :aria-label="seg.description"
          @click="setView(seg.id)"
        >
          <component :is="statusIcons[seg.id]" class="ml-status-icon" :size="14" aria-hidden="true" />
          <span class="ml-status-label" aria-hidden="true">{{ seg.label }}</span>
          <span class="ml-status-total" aria-hidden="true">{{ seg.count }}</span>
          <span v-if="seg.additions || seg.deletions" class="ml-delta" aria-hidden="true">
            <span v-if="seg.additions" class="ml-added">+{{ seg.additions }}</span>
            <span v-if="seg.deletions" class="ml-removed">−{{ seg.deletions }}</span>
          </span>
        </button>
      </nav>
      <button class="ml-ichi" type="button" aria-label="About Ichi" aria-haspopup="dialog" :aria-expanded="ichiMenuOpen" aria-controls="ichi-menu" @click="openIchiMenu">
        <span aria-hidden="true">一</span> ichi <PhCaretUp :size="12" aria-hidden="true" />
      </button>
    </footer>

    <IchiMenu v-if="ichiMenuOpen" @close="ichiMenuOpen = false" />
    <AppearanceLab :open="appearanceLabOpen" @close="appearanceLabOpen = false" />
    <SettingsModal @conflict-demo="settingsOpen = false; setView('conflict-demo')" @profiles="openProfileSettings()" @appearance-lab="openAppearanceLab" v-if="settingsOpen" :initial-category="settingsCategory" :initial-profile="settingsProfile" @close="settingsOpen = false" />
    <ToastViewport />
  </main>
</template>

<style scoped>
.profile-sync-error { position:absolute; top:var(--topbar-height); left:0; right:0; z-index:12; padding:10px; background:var(--surface-overlay); color:var(--text); border-bottom:1px solid var(--border); font-size:12px; }
.profile-sync-error button { margin-left:10px; }
</style>
