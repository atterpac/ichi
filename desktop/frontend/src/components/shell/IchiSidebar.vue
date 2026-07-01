<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useShellSettings } from '../../composables/useShellSettings'
import {
  PhArrowsClockwise,
  PhCloud,
  PhFileMagnifyingGlass,
  PhFileText,
  PhGitBranch,
  PhGitCommit,
  PhGitDiff,
  PhGitFork,
  PhGitMerge,
  PhGitPullRequest,
  PhListChecks,
  PhMagnifyingGlass,
  PhStack,
  PhTag,
  PhWarningDiamond,
} from '@phosphor-icons/vue'

type NavItem = {
  id: string
  label: string
  icon: Component
  hint?: string
  count?: string
  tone?: 'warn' | 'sync'
}

type NavGroup = {
  label: string
  items: NavItem[]
}

const props = defineProps<{
  activeView: string
}>()

const emit = defineEmits<{
  select: [view: string]
}>()

const settings = useShellSettings()
const logoSrc = computed(() => (settings.theme === 'day' ? '/pigeon_dark.svg' : '/pigeon_light.svg'))

const navGroups: NavGroup[] = [
  {
    label: 'Worktree',
    items: [
      { id: 'graph', label: 'Graph', icon: PhGitFork, hint: 'g' },
      { id: 'status', label: 'Status', icon: PhListChecks, hint: 's', count: '3' },
      { id: 'staging', label: 'Staging', icon: PhGitCommit, hint: 'Enter' },
      { id: 'conflicts', label: 'Conflicts', icon: PhWarningDiamond, hint: ':conflicts', tone: 'warn' },
    ],
  },
  {
    label: 'Refs',
    items: [
      { id: 'branches', label: 'Branches', icon: PhGitBranch, hint: 'b' },
      { id: 'tags', label: 'Tags', icon: PhTag, hint: ':tag' },
      { id: 'stashes', label: 'Stash', icon: PhStack, hint: 'S', count: '1' },
    ],
  },
  {
    label: 'Remote',
    items: [
      { id: 'sync', label: 'Sync', icon: PhArrowsClockwise, hint: ':fetch', tone: 'sync' },
      { id: 'prs', label: 'Pull Requests', icon: PhGitPullRequest, hint: 'p', count: '2' },
      { id: 'remotes', label: 'Remotes', icon: PhCloud, hint: ':remote' },
    ],
  },
  {
    label: 'Inspect',
    items: [
      { id: 'diff', label: 'Diff', icon: PhGitDiff, hint: 'd' },
      { id: 'blame', label: 'Blame', icon: PhFileMagnifyingGlass, hint: ':blame' },
      { id: 'file-log', label: 'File Log', icon: PhFileText, hint: ':log' },
      { id: 'finder', label: 'Finder', icon: PhMagnifyingGlass, hint: 'Ctrl+P' },
    ],
  },
]

function select(id: string) {
  emit('select', id)
}
</script>

<template>
  <aside class="ichi-sidebar">
    <div class="sidebar-brand">
      <img class="sidebar-brand-logo" :src="logoSrc" alt="" aria-hidden="true" />
    </div>

    <button
      class="nav-edge-toggle"
      type="button"
      :title="settings.navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      :aria-label="settings.navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      :aria-expanded="!settings.navCollapsed"
      @click="settings.navCollapsed = !settings.navCollapsed"
    >
      <span aria-hidden="true">::</span>
    </button>

    <div class="sidebar-nav">
      <button class="composebtn" type="button" title="Commit" @click="select('commit')">
        <span class="navicon"><PhGitMerge :size="16" weight="bold" /></span>
        <span class="navlabel">Commit</span>
        <kbd>c</kbd>
      </button>

      <template v-for="group in navGroups" :key="group.label">
        <p class="grouphead">{{ group.label }}</p>
        <nav class="navgroup" :aria-label="group.label">
          <button
            v-for="item in group.items"
            :key="item.id"
            class="navitem"
            :class="{ active: props.activeView === item.id, warn: item.tone === 'warn', sync: item.tone === 'sync' }"
            type="button"
            :title="item.label"
            :aria-current="props.activeView === item.id ? 'page' : undefined"
            @click="select(item.id)"
          >
            <span class="navicon"><component :is="item.icon" :size="16" weight="bold" /></span>
            <span class="navlabel">{{ item.label }}</span>
            <span v-if="item.count" class="dot" :class="{ warn: item.tone === 'warn' }">{{ item.count }}</span>
            <kbd v-else-if="item.hint">{{ item.hint }}</kbd>
          </button>
        </nav>
      </template>
    </div>

    <div class="account-wrap sidebar-account-bottom">
      <button class="account account-command-trigger" type="button" title="Repository">
        <span class="account-initial">i</span>
        <span class="cmdpath">
          <b>~/ichi</b>
          <small>main +1 -0</small>
        </span>
      </button>
    </div>
  </aside>
</template>
