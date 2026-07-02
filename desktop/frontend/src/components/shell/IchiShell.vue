<script setup lang="ts">
import { computed, ref } from 'vue'
import IchiSidebar from './IchiSidebar.vue'
import GraphView from '../graph/GraphView.vue'
import ChangesView from '../status/ChangesView.vue'
import SettingsModal from '../overlays/SettingsModal.vue'
import ToastViewport from '../overlays/ToastViewport.vue'
import { useShellSettings } from '../../composables/useShellSettings'
import { useModeline } from '../../composables/useModeline'
import { THEMES } from '../../theme/themes'
import { notify } from '../../composables/useToasts'
import { PhBellRinging, PhGearSix } from '@phosphor-icons/vue'

const settings = useShellSettings()
const modeline = useModeline()
const activeView = ref('graph')
const settingsOpen = ref(false)

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

const path = computed(() => `~/ichi/${activeView.value}`)

function setView(view: string) {
  activeView.value = view
}

function previewToast() {
  notify({
    tone: 'success',
    title: 'Branch synced',
    message: 'origin/main is up to date with your local worktree.',
    actionLabel: 'Undo',
  })
}
</script>

<template>
  <main class="ichi-shell">
    <header class="topbar">
      <div class="titlebar-path">
        <span>{{ path }}</span>
      </div>
      <div class="topbar-actions">
        <select v-model="settings.theme" class="theme-select" aria-label="Theme">
          <option v-for="theme in THEMES" :key="theme.id" :value="theme.id">{{ theme.label }}</option>
        </select>
        <button class="titlebar-icon" type="button" title="Preview toast" aria-label="Preview toast" @click="previewToast">
          <PhBellRinging :size="15" weight="bold" />
        </button>
        <button class="titlebar-icon" type="button" title="Settings" aria-label="Settings" @click="settingsOpen = true">
          <PhGearSix :size="15" weight="bold" />
        </button>
      </div>
    </header>

    <div class="body-shell" :class="{ 'nav-collapsed': settings.navCollapsed }">
      <IchiSidebar :active-view="activeView" @select="setView" />

      <section class="main-island" aria-live="polite">
        <header class="island-header">
          <div class="header-crumb">
            <span class="eyebrow">{{ activeMeta.group }}</span>
            <span class="crumb-sep" aria-hidden="true">/</span>
            <h1>{{ viewTitle }}</h1>
          </div>
          <div id="view-header-context" class="header-context" aria-label="Repository status" />
        </header>

        <GraphView v-if="activeView === 'graph'" />

        <ChangesView
          v-else-if="activeView === 'status' || activeView === 'commit'"
          :focus-commit="activeView === 'commit'"
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

    <footer class="modeline">
      <span class="ml-mode">{{ modeline.mode }}</span>
      <span class="ml-focus">{{ activeView }}</span>
      <span class="ml-buffer">{{ path }}</span>
      <span class="ml-hints">{{ modeline.hints }}</span>
      <span class="ml-branch">main</span>
      <span class="ml-pct">0%</span>
    </footer>

    <SettingsModal v-if="settingsOpen" @close="settingsOpen = false" />
    <ToastViewport />
  </main>
</template>
