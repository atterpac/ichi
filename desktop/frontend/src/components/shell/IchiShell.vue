<script setup lang="ts">
import { computed, ref } from 'vue'
import IchiSidebar from './IchiSidebar.vue'
import GraphView from '../graph/GraphView.vue'
import SettingsModal from '../overlays/SettingsModal.vue'
import ToastViewport from '../overlays/ToastViewport.vue'
import { useShellSettings } from '../../composables/useShellSettings'
import { notify } from '../../composables/useToasts'
import { PhBellRinging, PhGearSix } from '@phosphor-icons/vue'

const settings = useShellSettings()
const activeView = ref('graph')
const settingsOpen = ref(false)

type ViewMeta = {
  title: string
  group: string
  description: string
  pills: string[]
}

const graphMeta: ViewMeta = {
  title: 'Commit Graph',
  group: 'Worktree',
  description: 'History, refs, stashes, and working changes converge here before drilling into details.',
  pills: ['main', '+2 -1', 'ahead 1'],
}

const views: Record<string, ViewMeta> = {
  graph: {
    ...graphMeta,
  },
  status: {
    title: 'Status',
    group: 'Worktree',
    description: 'Stage, unstage, discard, and jump into line-level staging from the current worktree.',
    pills: ['3 changed', '1 staged', '2 unstaged'],
  },
  staging: {
    title: 'Staging',
    group: 'Worktree',
    description: 'Interactive hunk and line staging for the selected file.',
    pills: ['line mode', 'hunks 4'],
  },
  conflicts: {
    title: 'Conflicts',
    group: 'Worktree',
    description: 'Resolve merge, rebase, and cherry-pick conflicts with ours/base/theirs panes.',
    pills: ['clean', '0 files'],
  },
  branches: {
    title: 'Branches',
    group: 'Refs',
    description: 'Local and remote branch refs, checkout, rename, delete, merge, and rebase entry points.',
    pills: ['main', '12 local', '8 remote'],
  },
  tags: {
    title: 'Tags',
    group: 'Refs',
    description: 'Release refs and tag operations live here, separate from branch navigation.',
    pills: ['v0.2.7', '18 tags'],
  },
  stashes: {
    title: 'Stash',
    group: 'Refs',
    description: 'Saved worktree snapshots with apply, pop, branch, and diff actions.',
    pills: ['1 stash'],
  },
  sync: {
    title: 'Sync',
    group: 'Remote',
    description: 'Fetch, pull, push, upstream setup, and ahead/behind state for the active branch.',
    pills: ['origin/main', 'ahead 1', 'behind 0'],
  },
  prs: {
    title: 'Pull Requests',
    group: 'Remote',
    description: 'Provider-backed pull requests, review state, checkout, files, checks, and merge actions.',
    pills: ['origin', '2 open'],
  },
  remotes: {
    title: 'Remotes',
    group: 'Remote',
    description: 'Remote names, URLs, default upstreams, prune/fetch settings, and add/remove flows.',
    pills: ['origin', 'github'],
  },
  diff: {
    title: 'Diff',
    group: 'Inspect',
    description: 'Unified diffs for commits, files, staged work, unstaged work, and ref comparisons.',
    pills: ['unified', 'line nums'],
  },
  blame: {
    title: 'Blame',
    group: 'Inspect',
    description: 'Line attribution for a selected file with commit drill-down.',
    pills: ['file required'],
  },
  'file-log': {
    title: 'File Log',
    group: 'Inspect',
    description: 'Per-file history with blame and commit detail jumps.',
    pills: ['file required'],
  },
  finder: {
    title: 'Finder',
    group: 'Inspect',
    description: 'Fuzzy navigation across commands, branches, files, commits, and saved destinations.',
    pills: ['Ctrl+P'],
  },
  commit: {
    title: 'Commit',
    group: 'Worktree',
    description: 'Compose and amend commits from staged changes.',
    pills: ['1 staged'],
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
          <option value="night">night</option>
          <option value="storm">storm</option>
          <option value="moon">moon</option>
          <option value="day">day</option>
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
          <div>
            <p class="eyebrow">{{ activeMeta.group }}</p>
            <h1>{{ viewTitle }}</h1>
          </div>
          <div class="repo-pills" aria-label="Repository status">
            <span v-for="pill in activeMeta.pills" :key="pill">{{ pill }}</span>
          </div>
        </header>

        <GraphView v-if="activeView === 'graph'" />

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
      <span class="ml-mode">NORMAL</span>
      <span class="ml-focus">{{ activeView }}</span>
      <span class="ml-buffer">{{ path }}</span>
      <span class="ml-hints">: command · / search · ? help</span>
      <span class="ml-branch">main</span>
      <span class="ml-pct">0%</span>
    </footer>

    <SettingsModal v-if="settingsOpen" @close="settingsOpen = false" />
    <ToastViewport />
  </main>
</template>
