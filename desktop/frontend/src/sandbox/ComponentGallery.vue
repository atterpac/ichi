<script setup lang="ts">
import { ref } from 'vue'
import { PhArrowLineUp, PhGearSix, PhMagnifyingGlass, PhPlus, PhCopy } from '@phosphor-icons/vue'
import DiffBar from '../components/common/DiffBar.vue'
import RefLabel from '../components/common/RefLabel.vue'
import RefCluster from '../components/graph/RefCluster.vue'
import UiButton from '../components/common/UiButton.vue'
import UiInput from '../components/common/UiInput.vue'
import UiIconButton from '../components/common/UiIconButton.vue'
import SurfaceState from '../components/common/SurfaceState.vue'
import SettingsModal from '../components/overlays/SettingsModal.vue'
import OperationConfirmModal, {
  type OperationConfirmRequest,
} from '../components/overlays/OperationConfirmModal.vue'
import GraphPreview from '../components/overlays/GraphPreview.vue'
import CommitDetailPanel from '../components/graph/CommitDetail.vue'
import {
  Commit,
  CommitDetail,
  ChangedFile,
  CommitStats,
} from '../bindings/github.com/atterpac/ichi/internal/git'
import { usePreferenceBindings } from '../customization/usePreferences'
import { THEMES } from '../theme/themes'

const settings = usePreferenceBindings()
const sizes = ['sm', 'md', 'lg'] as const
const query = ref('')
const sampleCommit = new Commit({
  Hash: 'abcdef1234567890abcdef1234567890abcdef1234',
  ShortHash: 'abcdef1',
  Message: 'Refine controls and spacing',
  Author: 'Alex Chen',
})
const sampleDetail = new CommitDetail({
  Subject: sampleCommit.Message,
  Author: 'Alex Chen',
  AuthorEmail: 'alex@example.com',
  AuthorDate: '2026-09-24T12:00:00Z',
  Body: 'Shared sizing makes controls align naturally. Long descriptions retain comfortable line spacing.',
  Parents: ['bcdef1234567890abcdef1234567890abcdef12345'],
  ParentSubjects: ['Add shared components'],
  Branches: ['main'],
  Stats: new CommitStats({ FilesChanged: 12, Insertions: 144, Deletions: 36 }),
  Files: Array.from(
    { length: 12 },
    (_, i) =>
      new ChangedFile({
        Path: `src/${i < 6 ? 'components' : 'theme'}/file-${i}.vue`,
        Status: i === 0 ? 2 : 1,
        Insertions: 12,
        Deletions: 3,
      }),
  ),
})
const settingsOpen = ref(false)
const operation = ref<OperationConfirmRequest | null>(null)
const notification = ref('')
function showDialog() {
  operation.value = {
    title: 'Create branch?',
    message: 'A component preview using sample data. No Git operations will run.',
    target: 'main · abcdef1',
    confirmLabel: 'Create branch',
    inputs: [{ id: 'branch', label: 'Branch name', value: 'feature/interface', required: true }],
    onConfirm: () => {
      notification.value = 'Sample branch created.'
    },
  }
}
</script>

<template>
  <main class="gallery">
    <header class="gallery-head">
      <div>
        <p class="gallery-kicker">ICHI / COMPONENT SYSTEM</p>
        <h1>Compact. Consistent. Familiar.</h1>
        <p>Production components, shared tokens, and representative Git content.</p>
      </div>
      <div class="gallery-tools">
        <label
          >Theme
          <select v-model="settings['appearance.theme']" class="ui-field" aria-label="Gallery theme">
            <option v-for="theme in THEMES" :key="theme.id" :value="theme.id">
              {{ theme.label }}
            </option>
          </select></label
        >
        <UiIconButton label="Open settings" @click="settingsOpen = true"
          ><PhGearSix
        /></UiIconButton>
      </div>
    </header>
    <section class="gallery-panel">
      <h2>One control family</h2>
      <p>24 / 28 / 32px · shared label, icon, and inset sizing.</p>
      <div v-for="size in sizes" :key="size" class="gallery-controls" :data-size="size">
        <span class="gallery-size">{{ size }}</span>
        <UiButton :size="size" variant="primary" @click="notification = 'Preview action completed.'"
          ><PhPlus />Create branch</UiButton
        >
        <UiButton :size="size"><PhArrowLineUp />Push</UiButton>
        <UiInput
          v-model="query"
          :size="size"
          :aria-label="`${size} search sample`"
          placeholder="Search commits…"
        />
        <select class="ui-field" :class="`size-${size}`" :aria-label="`${size} select sample`">
          <option>All branches</option>
          <option>Current branch</option>
        </select>
        <UiIconButton :size="size" :label="`${size} copy sample`"><PhCopy /></UiIconButton>
      </div>
      <div class="gallery-controls">
        <UiButton variant="ghost">Secondary action</UiButton
        ><UiButton variant="danger">Delete branch</UiButton><UiButton disabled>Disabled</UiButton
        ><UiButton loading>Working…</UiButton><UiButton active>Selected</UiButton
        ><UiInput invalid aria-label="Invalid branch example" model-value="invalid branch" />
      </div>
    </section>
    <section class="gallery-panel" id="diff-bars">
      <h2>Change proportions</h2>
      <p>Five cells show additions versus deletions. Exact counts remain alongside each bar.</p>
      <div class="gallery-controls">
        <span>+24 −8 <DiffBar :additions="24" :deletions="8" /></span>
        <span>+12 −0 <DiffBar :additions="12" :deletions="0" /></span>
        <span>+0 −18 <DiffBar :additions="0" :deletions="18" /></span>
        <span>+0 −0 <DiffBar :additions="0" :deletions="0" /></span>
      </div>
    </section>
    <section class="gallery-panel" id="ref-labels">
      <h2>Quiet ref labels</h2>
      <p>
        Lane color marks the ref; a check identifies the current branch. Shared commits keep their
        name visible.
      </p>
      <div class="gallery-controls">
        <RefLabel name="main" kind="branch" current color-var="--lane-0" />
        <RefLabel name="feature/search" kind="branch" color-var="--lane-1" />
        <RefLabel name="origin/main" kind="remote" color-var="--lane-0" />
        <RefLabel name="v1.2.0" kind="tag" />
        <RefCluster
          style="max-width: 160px; --row-lane: var(--lane-3)"
          :decorations="[
            { Name: 'main', Kind: 'branch', IsHead: true },
            { Name: 'origin/main', Kind: 'remote', IsHead: false },
            { Name: 'v1.2.0', Kind: 'tag', IsHead: false },
          ]"
          @click="notification = 'main · origin/main · v1.2.0'"
        />
        <RefLabel
          style="max-width: 160px"
          name="feature/a-long-descriptive-branch-name"
          kind="branch"
          color-var="--lane-2"
        />
      </div>
    </section>
    <section class="gallery-panel gallery-chrome">
      <h2>Header and navigation</h2>
      <div class="gallery-titlebar">
        <span class="app-wordmark">ichi</span><span class="repo-name">atterpac / ichi</span>
        <div class="topbar-actions">
          <form
            class="titlebar-search ui-control size-sm"
            @submit.prevent="notification = `Searching for ${query || 'all commits'}`"
          >
            <PhMagnifyingGlass /><UiInput
              v-model="query"
              size="sm"
              aria-label="Header search"
              placeholder="Find commits, files, refs"
            /><button aria-label="Submit search"><kbd>↵</kbd></button>
          </form>
          <UiIconButton size="sm" label="Settings" @click="settingsOpen = true"
            ><PhGearSix
          /></UiIconButton>
        </div>
      </div>
      <div class="island-header">
        <nav class="primary-nav" aria-label="Example navigation">
          <button aria-current="page">Graph<span>g</span></button
          ><button>Changes<span>s</span></button><button>Branches<span>b</span></button
          ><button>Stash<span>z</span></button>
        </nav>
        <UiButton size="sm" @click="showDialog"><PhArrowLineUp />Push 2</UiButton>
      </div>
    </section>
    <div class="gallery-columns">
      <section class="gallery-panel">
        <h2>Graph and inspector</h2>
        <GraphPreview />
        <CommitDetailPanel
          class="gallery-inspector"
          :commit="sampleCommit"
          :detail="sampleDetail"
          :loading="false"
          error=""
          :repo="null"
          :resizable="false"
          @copy="notification = 'Sample SHA selected.'"
          @parent="notification = 'Sample parent selected.'"
          @navigate="notification = 'Sample file selected.'"
          @action="showDialog"
          @menu="notification = 'Commit menu preview.'"
        />
      </section>
      <section class="gallery-panel">
        <h2>Forms, menus, and states</h2>
        <form class="gallery-form" @submit.prevent="showDialog">
          <label
            >Branch name<UiInput
              aria-label="Sample branch name"
              model-value="feature/interface" /></label
          ><label
            >Description<textarea class="ui-field" placeholder="Optional description" />
          </label>
          <div class="gallery-controls">
            <UiButton type="submit" variant="primary">Review action</UiButton
            ><UiButton @click="showDialog">Open dialog</UiButton>
          </div>
        </form>
        <div class="gallery-menu ctx-menu" role="menu" aria-label="Example menu">
          <button class="ctx-item active" role="menuitem">Checkout branch <kbd>⏎</kbd></button
          ><button class="ctx-item" role="menuitem">Copy SHA</button
          ><button class="ctx-item danger" role="menuitem">Delete branch…</button>
        </div>
        <SurfaceState
          compact
          tone="error"
          title="Unable to load history"
          message="Check the repository path and try again."
          action-label="Retry"
          @action="notification = 'Retry preview completed.'"
        />
        <SurfaceState
          compact
          tone="loading"
          title="Loading commits"
          message="Reading local history."
        />
        <SurfaceState compact title="No changes" message="Your working tree is clean." />
      </section>
    </div>
    <p class="gallery-notification" role="status">
      {{ notification || 'Use Tab to inspect focus states. All actions here use sample data.' }}
    </p>
    <SettingsModal v-if="settingsOpen" @close="settingsOpen = false" />
    <OperationConfirmModal v-if="operation" :request="operation" @close="operation = null" />
  </main>
</template>

<style scoped>
.gallery {
  max-width: 1240px;
  margin: auto;
  padding: var(--space-16);
  display: grid;
  gap: var(--space-12);
}
.gallery-head,
.gallery-tools,
.gallery-controls,
.gallery-titlebar {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
}
.gallery-head {
  justify-content: space-between;
  gap: var(--space-8);
}
.gallery-kicker {
  color: var(--accent);
  font: var(--fs-xs) var(--font-mono);
  letter-spacing: 0.08em;
}
.gallery h1 {
  font-size: 24px;
  font-weight: 500;
  margin: var(--space-4) 0;
}
.gallery h2 {
  font-size: var(--fs-lg);
  font-weight: 500;
  margin: 0 0 var(--space-6);
}
.gallery p {
  color: var(--text-dim);
  line-height: 1.5;
}
.gallery-panel {
  min-width: 0;
  padding: var(--panel-inset);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-panel);
}
.gallery-controls {
  margin-top: var(--space-6);
}
.gallery-controls .ui-field {
  width: 180px;
}
.gallery-size {
  width: 32px;
  color: var(--text-mut);
  font-family: var(--font-mono);
}
.gallery-titlebar {
  min-height: 36px;
  background: var(--surface-base);
  padding: var(--space-3) var(--space-4);
}
.gallery-titlebar .topbar-actions {
  margin-left: auto;
}
.gallery-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-12);
}
.gallery-inspector {
  height: 600px;
  margin-top: var(--space-8);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}
.gallery-form {
  display: grid;
  gap: var(--space-6);
}
.gallery-form label,
.gallery-tools label {
  display: grid;
  gap: var(--space-4);
  font-size: var(--fs-sm);
}
.gallery-menu {
  position: static;
  margin-top: var(--space-12);
  width: 100%;
}
.gallery-menu kbd {
  margin-left: auto;
}
.gallery-notification {
  margin: 0;
}
@media (max-width: 760px) {
  .gallery {
    padding: var(--space-8);
  }
  .gallery-columns {
    grid-template-columns: 1fr;
  }
}
</style>
