<script setup lang="ts">
/**
 * PLAYGROUND - bottom floating bar navigation variants.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { clearControls, controlValue, registerControl } from '../store'
import {
  PhArrowsClockwise,
  PhCaretDown,
  PhCloud,
  PhCommand,
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
  type Icon,
} from '@phosphor-icons/vue'

type Group = 'Worktree' | 'Refs' | 'Remote' | 'Inspect'

type Page = {
  id: string
  label: string
  group: Group
  key: string
  icon: Icon
  metric: string
  detail: string
  tone?: 'good' | 'warn' | 'sync'
}

type Design = {
  id: string
  label: string
  blurb: string
}

const pages: Page[] = [
  { id: 'commit', label: 'Commit', group: 'Worktree', key: 'c', icon: PhGitMerge, metric: '5 staged', detail: 'compose or amend commits', tone: 'good' },
  { id: 'graph', label: 'Graph', group: 'Worktree', key: 'g', icon: PhGitFork, metric: 'main', detail: 'history, refs, and branches' },
  { id: 'status', label: 'Changes', group: 'Worktree', key: 's', icon: PhListChecks, metric: '12 files', detail: 'stage, unstage, discard', tone: 'warn' },
  { id: 'staging', label: 'Staging', group: 'Worktree', key: 'Enter', icon: PhGitCommit, metric: 'hunks', detail: 'line and hunk staging' },
  { id: 'conflicts', label: 'Conflicts', group: 'Worktree', key: ':conflicts', icon: PhWarningDiamond, metric: '2', detail: 'resolve merge conflicts', tone: 'warn' },
  { id: 'branches', label: 'Branches', group: 'Refs', key: 'b', icon: PhGitBranch, metric: '18 refs', detail: 'checkout, merge, rebase' },
  { id: 'tags', label: 'Tags', group: 'Refs', key: ':tag', icon: PhTag, metric: '42', detail: 'release references' },
  { id: 'stashes', label: 'Stash', group: 'Refs', key: 'S', icon: PhStack, metric: '3', detail: 'saved snapshots' },
  { id: 'sync', label: 'Sync', group: 'Remote', key: ':fetch', icon: PhArrowsClockwise, metric: 'up 1', detail: 'fetch, pull, push', tone: 'sync' },
  { id: 'prs', label: 'Pull Requests', group: 'Remote', key: 'p', icon: PhGitPullRequest, metric: '4 open', detail: 'reviews and checks' },
  { id: 'remotes', label: 'Remotes', group: 'Remote', key: ':remote', icon: PhCloud, metric: 'origin', detail: 'URLs and upstreams' },
  { id: 'diff', label: 'Diff', group: 'Inspect', key: 'd', icon: PhGitDiff, metric: '+184 -37', detail: 'compare work and refs' },
  { id: 'blame', label: 'Blame', group: 'Inspect', key: ':blame', icon: PhFileMagnifyingGlass, metric: 'file', detail: 'line attribution' },
  { id: 'file-log', label: 'File Log', group: 'Inspect', key: ':log', icon: PhFileText, metric: 'history', detail: 'per-file commits' },
  { id: 'finder', label: 'Finder', group: 'Inspect', key: 'Ctrl+P', icon: PhMagnifyingGlass, metric: 'all', detail: 'commands, files, refs' },
]

const designs: Design[] = [
  { id: '1', label: 'Icon Dock', blurb: 'centered floating dock with compact icons and badges' },
  { id: '2', label: 'Segmented Bar', blurb: 'wide mode segments with current page detail' },
  { id: '3', label: 'Command Shelf', blurb: 'bottom command line plus quick destinations' },
  { id: '4', label: 'Grouped Tray', blurb: 'bottom bar opens an always-visible grouped tray' },
  { id: '5', label: 'Modeline Plus', blurb: 'terminal-style modeline that doubles as navigation' },
  { id: '6', label: 'Two Row Dock', blurb: 'primary pages above repository status and commands' },
]

const activeId = ref('graph')
const activeGroup = ref<Group>('Worktree')
const query = ref('')

onMounted(() => {
  registerControl({
    id: 'design',
    kind: 'select',
    label: 'Design',
    options: designs.map((design) => design.id),
    value: '1',
  })
})
onUnmounted(clearControls)

const designId = computed(() => controlValue<string>('design') ?? '1')
const currentDesign = computed(() => designs.find((design) => design.id === designId.value) ?? designs[0]!)
const activePage = computed(() => pages.find((page) => page.id === activeId.value) ?? pages[1]!)
const groupedPages = computed(() => groupPages(pages))
const quickPages = computed(() => [pages[0], pages[1], pages[2], pages[5], pages[8], pages[9], pages[11], pages[14]])
const statusPages = computed(() => [pages[2], pages[4], pages[8], pages[9]])
const groupSummaries = computed(() =>
  Object.entries(groupedPages.value).map(([group, items]) => ({
    group: group as Group,
    items,
    active: group === activeGroup.value,
  })),
)
const filteredPages = computed(() => {
  const normalized = query.value.trim().toLowerCase()
  if (!normalized) return quickPages.value
  return pages.filter((page) =>
    [page.label, page.group, page.key, page.metric, page.detail].some((value) => value.toLowerCase().includes(normalized)),
  )
})

function groupPages(items: Page[]) {
  return items.reduce<Record<Group, Page[]>>(
    (acc, page) => {
      acc[page.group].push(page)
      return acc
    },
    { Worktree: [], Refs: [], Remote: [], Inspect: [] },
  )
}

function selectPage(page: Page) {
  activeId.value = page.id
  activeGroup.value = page.group
}
</script>

<template>
  <div class="frame">
    <div class="caption">
      <span class="n">{{ currentDesign.id }}</span>
      <span class="t">{{ currentDesign.label }}</span>
      <span class="sep">/</span>
      <span class="o">{{ currentDesign.blurb }}</span>
    </div>

    <div class="shell">
      <header class="topbar">
        <div class="repo-mark">i</div>
        <div class="repo-copy">
          <strong>~/ichi</strong>
          <span>main +184 -37 · origin/main up 1</span>
        </div>
        <div class="top-spacer" />
        <button class="iconbtn" type="button" aria-label="Finder"><PhMagnifyingGlass :size="16" weight="bold" /></button>
        <button class="iconbtn" type="button" aria-label="Commands"><PhCommand :size="16" weight="bold" /></button>
      </header>

      <main class="surface" :class="`design-${designId}`">
        <aside class="mini-nav" aria-label="Existing left navigation">
          <button v-for="page in quickPages" :key="page?.id" type="button" :class="{ active: page?.id === activeId }" @click="page && selectPage(page)">
            <component v-if="page" :is="page.icon" :size="16" weight="bold" />
          </button>
        </aside>

        <section class="workspace">
          <header class="workspace-head">
            <span>{{ activePage.group }}</span>
            <h1>{{ activePage.label }}</h1>
            <p>{{ activePage.detail }} · {{ activePage.metric }} · {{ activePage.key }}</p>
          </header>

          <div class="commit-graph" aria-hidden="true">
            <div v-for="row in 10" :key="row" class="graph-row">
              <span class="node" :class="{ hot: row === 2 || row === 7 }" />
              <span class="line" :style="{ width: `${50 + row * 4}%` }" />
              <span class="meta" />
            </div>
          </div>

          <div class="state-stack">
            <button v-for="page in statusPages" :key="page?.id" class="state-tile" type="button" @click="page && selectPage(page)">
              <component v-if="page" :is="page.icon" :size="18" weight="bold" />
              <span>{{ page?.label }}</span>
              <b>{{ page?.metric }}</b>
            </button>
          </div>
        </section>

        <nav v-if="designId === '1'" class="bottom bottom-dock" aria-label="Bottom dock">
          <button v-for="page in quickPages" :key="page?.id" type="button" :class="[page?.tone, { active: page?.id === activeId }]" @click="page && selectPage(page)">
            <component v-if="page" :is="page.icon" :size="18" weight="bold" />
            <span>{{ page?.label }}</span>
            <small v-if="page?.tone || page?.id === 'prs'">{{ page?.metric }}</small>
          </button>
        </nav>

        <nav v-else-if="designId === '2'" class="bottom segmented-bar" aria-label="Mode bar">
          <button v-for="summary in groupSummaries" :key="summary.group" type="button" :class="{ active: summary.active }" @click="activeGroup = summary.group">
            <span>{{ summary.group }}</span>
            <b>{{ summary.items.length }}</b>
          </button>
          <div class="active-strip">
            <button v-for="page in groupedPages[activeGroup]" :key="page.id" type="button" :class="{ active: page.id === activeId }" @click="selectPage(page)">
              <component :is="page.icon" :size="15" weight="bold" />
              {{ page.label }}
            </button>
          </div>
        </nav>

        <section v-else-if="designId === '3'" class="bottom command-shelf">
          <div class="cmd-input">
            <PhCommand :size="17" weight="bold" />
            <input v-model="query" placeholder="jump to graph, diff, branch, PR..." />
          </div>
          <nav aria-label="Command results">
            <button v-for="page in filteredPages.slice(0, 6)" :key="page?.id" type="button" :class="{ active: page?.id === activeId }" @click="page && selectPage(page)">
              <component v-if="page" :is="page.icon" :size="15" weight="bold" />
              <span>{{ page?.label }}</span>
              <kbd>{{ page?.key }}</kbd>
            </button>
          </nav>
        </section>

        <section v-else-if="designId === '4'" class="bottom grouped-tray">
          <div v-for="summary in groupSummaries" :key="summary.group" class="tray-group">
            <strong>{{ summary.group }}</strong>
            <button v-for="page in summary.items" :key="page.id" type="button" :class="{ active: page.id === activeId }" @click="selectPage(page)">
              <component :is="page.icon" :size="15" weight="bold" />
              <span>{{ page.label }}</span>
            </button>
          </div>
        </section>

        <nav v-else-if="designId === '5'" class="bottom modeline-plus" aria-label="Modeline navigation">
          <button type="button" class="mode" @click="selectPage(activePage)">
            {{ activePage.group.toLowerCase() }}
          </button>
          <button v-for="page in quickPages" :key="page?.id" type="button" :class="{ active: page?.id === activeId }" @click="page && selectPage(page)">
            {{ page?.label }} <span>{{ page?.metric }}</span>
          </button>
          <span class="branch">main</span>
          <span class="pct">62%</span>
        </nav>

        <section v-else class="bottom two-row-dock">
          <nav aria-label="Primary destinations">
            <button v-for="page in quickPages" :key="page?.id" type="button" :class="{ active: page?.id === activeId }" @click="page && selectPage(page)">
              <component v-if="page" :is="page.icon" :size="16" weight="bold" />
              <span>{{ page?.label }}</span>
            </button>
          </nav>
          <div class="dock-status">
            <span>{{ activePage.group }} / {{ activePage.label }}</span>
            <span>main</span>
            <span>+184 -37</span>
            <span>origin up 1</span>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.frame { display: flex; flex-direction: column; gap: 10px; }
.caption { display: flex; align-items: center; gap: 10px; padding-left: 4px; }
.caption .n {
  width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center;
  justify-content: center; font-size: 0.78em; font-weight: 800; background: var(--accent); color: var(--bg);
}
.caption .t { color: var(--fg); font-size: 0.9em; font-weight: 700; }
.caption .sep, .caption .o { color: var(--fg-muted); font-size: 0.9em; }

.shell {
  width: min(1120px, 94vw);
  height: min(720px, 84vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg-soft);
  color: var(--fg);
  box-shadow: 0 18px 60px color-mix(in srgb, var(--accent) 8%, transparent);
}

button {
  border: 1px solid transparent;
  font: inherit;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.topbar {
  height: 48px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 14px;
  border-bottom: 1px solid var(--border);
}

.repo-mark {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: var(--accent);
  color: var(--bg);
  font-weight: 900;
}

.repo-copy { display: grid; gap: 1px; line-height: 1; }
.repo-copy strong { font-size: 0.86rem; }
.repo-copy span { color: var(--fg-muted); font-size: 0.74rem; }
.top-spacer { flex: 1; }

.iconbtn {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-color: var(--border);
  border-radius: 8px;
  color: var(--fg-muted);
}

.surface {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  overflow: hidden;
}

.mini-nav {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: center;
  padding: 12px 8px;
  border-right: 1px solid var(--border);
}

.mini-nav button {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--fg-muted);
}

.mini-nav button:hover,
.mini-nav button.active {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
}

.workspace {
  min-width: 0;
  padding: 30px 30px 112px;
  display: grid;
  grid-template-columns: 1fr 300px;
  grid-template-rows: auto 1fr;
  gap: 24px;
}

.design-4 .workspace,
.design-6 .workspace {
  padding-bottom: 150px;
}

.workspace-head { grid-column: 1 / -1; }
.workspace-head span { color: var(--accent); font-size: 0.76rem; font-weight: 700; text-transform: uppercase; }
.workspace-head h1 { margin: 4px 0 5px; font-size: 2.1rem; letter-spacing: 0; }
.workspace-head p { margin: 0; color: var(--fg-muted); }

.commit-graph {
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 14px;
  padding-top: 8px;
}

.graph-row {
  display: grid;
  grid-template-columns: 18px minmax(130px, 1fr) 80px;
  align-items: center;
  gap: 13px;
}

.node {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--accent);
}

.node.hot { background: var(--accent); }
.line, .meta { height: 10px; border-radius: 999px; background: color-mix(in srgb, var(--fg) 9%, transparent); }
.meta { width: 70px; background: color-mix(in srgb, var(--fg-muted) 18%, transparent); }

.state-stack {
  display: grid;
  gap: 10px;
  align-content: start;
}

.state-tile {
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 8px 10px;
  align-items: center;
  padding: 13px;
  border-color: var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg) 38%, transparent);
  text-align: left;
}

.state-tile b {
  grid-column: 2;
  color: var(--fg-muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.bottom {
  position: absolute;
  z-index: 5;
  left: 74px;
  right: 16px;
  bottom: 16px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-soft) 92%, transparent);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.36);
  backdrop-filter: blur(14px) saturate(1.15);
}

.bottom-dock {
  left: 50%;
  right: auto;
  display: flex;
  gap: 5px;
  padding: 7px;
  max-width: calc(100% - 120px);
  overflow-x: auto;
  border-radius: 16px;
  transform: translateX(-50%);
  scrollbar-width: none;
}

.bottom-dock::-webkit-scrollbar,
.shelf-scroll::-webkit-scrollbar {
  display: none;
}

.bottom-dock button {
  position: relative;
  width: 60px;
  height: 54px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 2px;
  border-radius: 11px;
  color: var(--fg-muted);
}

.bottom-dock button span {
  max-width: 54px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.65rem;
  font-weight: 800;
}

.bottom-dock button small {
  max-width: 54px;
  overflow: hidden;
  color: var(--fg-muted);
  font-size: 0.58rem;
  font-weight: 800;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bottom-dock button.warn small {
  color: #f59e0b;
}

.bottom-dock button.sync small,
.bottom-dock button.good small {
  color: #22c55e;
}

.bottom button:hover,
.bottom button.active {
  background: var(--accent);
  color: var(--bg);
}

.bottom-dock button:hover small,
.bottom-dock button.active small {
  color: var(--bg);
  opacity: 0.72;
}

.segmented-bar {
  display: grid;
  grid-template-columns: repeat(4, minmax(92px, 1fr));
  gap: 5px;
  padding: 7px;
  border-radius: 12px;
}

.segmented-bar > button {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--fg-muted);
  font-size: 0.78rem;
  font-weight: 800;
}

.segmented-bar > button b {
  color: inherit;
  opacity: 0.66;
}

.active-strip {
  grid-column: 1 / -1;
  display: flex;
  gap: 5px;
  overflow-x: auto;
}

.active-strip button {
  height: 30px;
  flex: 1 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 10px;
  border-radius: 7px;
  color: var(--fg-muted);
  font-size: 0.76rem;
  font-weight: 700;
}

.command-shelf {
  display: grid;
  grid-template-columns: minmax(220px, 340px) minmax(0, 1fr);
  gap: 7px;
  padding: 7px;
  border-radius: 13px;
}

.cmd-input {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--bg) 38%, transparent);
  color: var(--fg-muted);
}

.cmd-input input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--fg);
  font: inherit;
}

.command-shelf nav {
  display: flex;
  gap: 5px;
  overflow-x: auto;
}

.command-shelf nav button {
  height: 38px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border-radius: 9px;
  color: var(--fg-muted);
  font-size: 0.76rem;
  font-weight: 800;
}

kbd {
  color: inherit;
  opacity: 0.62;
  font: 700 0.68rem ui-monospace, SFMono-Regular, Menlo, monospace;
}

.grouped-tray {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
}

.tray-group strong {
  display: block;
  margin: 0 0 7px 3px;
  color: var(--fg-muted);
  font-size: 0.68rem;
  text-transform: uppercase;
}

.tray-group button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 6px;
  border-radius: 7px;
  color: var(--fg-muted);
  text-align: left;
  font-size: 0.76rem;
  font-weight: 700;
}

.tray-group span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modeline-plus {
  left: 58px;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 32px;
  padding: 0 6px;
  border-right: 0;
  border-bottom: 0;
  border-radius: 0;
  background: color-mix(in srgb, var(--bg) 84%, transparent);
  box-shadow: none;
  font: 700 0.72rem ui-monospace, SFMono-Regular, Menlo, monospace;
}

.modeline-plus button,
.modeline-plus span {
  height: 24px;
  display: inline-flex;
  align-items: center;
  padding: 0 9px;
  border-radius: 5px;
  color: var(--fg-muted);
  white-space: nowrap;
}

.modeline-plus .mode {
  background: var(--accent);
  color: var(--bg);
}

.modeline-plus button span {
  height: auto;
  padding: 0 0 0 5px;
  opacity: 0.62;
}

.modeline-plus .branch {
  margin-left: auto;
}

.two-row-dock {
  display: grid;
  gap: 6px;
  padding: 7px;
  border-radius: 13px;
}

.two-row-dock nav {
  display: flex;
  gap: 5px;
  overflow-x: auto;
}

.two-row-dock nav button {
  flex: 1 0 96px;
  height: 34px;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 9px;
  border-radius: 8px;
  color: var(--fg-muted);
  font-size: 0.76rem;
  font-weight: 800;
}

.two-row-dock nav span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dock-status {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 24px;
  padding: 0 8px;
  color: var(--fg-muted);
  font: 700 0.72rem ui-monospace, SFMono-Regular, Menlo, monospace;
}

.dock-status span:first-child {
  color: var(--fg);
  margin-right: auto;
}

@media (max-width: 760px) {
  .surface { grid-template-columns: 1fr; }
  .mini-nav { display: none; }
  .workspace {
    grid-template-columns: 1fr;
    padding: 22px 22px 132px;
  }
  .state-stack { display: none; }
  .bottom {
    left: 12px;
    right: 12px;
  }
  .bottom-dock {
    left: 50%;
    right: auto;
    max-width: calc(100% - 24px);
  }
  .command-shelf {
    grid-template-columns: 1fr;
  }
  .grouped-tray {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .modeline-plus {
    left: 0;
    overflow-x: auto;
  }
}
</style>
