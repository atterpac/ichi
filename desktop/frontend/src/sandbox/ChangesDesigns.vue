<script setup lang="ts">
import { computed, ref } from 'vue'
import UiButton from '../components/common/UiButton.vue'
import UiInput from '../components/common/UiInput.vue'
import DiffBar from '../components/common/DiffBar.vue'
import { useShellSettings } from '../composables/useShellSettings'
const settings = useShellSettings()
const options = [
  {
    id: 'desk',
    name: 'A · Review desk',
    description:
      'Files on the left, diff in the center, commit form on the right. Best for reviewing and committing in one place.',
  },
  {
    id: 'focus',
    name: 'B · Diff first',
    description:
      'Give the diff most of the window. Keep a compact file rail and a commit strip below. Best for reading larger changes.',
  },
  {
    id: 'board',
    name: 'C · Staging board',
    description:
      'Compare unstaged and staged files side by side, with the selected diff below. Best for assembling a precise commit.',
  },
] as const
const active = ref<'desk' | 'focus' | 'board'>('desk')
const option = computed(() => options.find((option) => option.id === active.value)!)
const files = ref([
  {
    path: 'src/components/graph/CommitDetail.vue',
    status: 'M',
    added: 48,
    removed: 16,
    staged: false,
  },
  {
    path: 'src/components/graph/WorktreePreview.vue',
    status: 'A',
    added: 96,
    removed: 0,
    staged: false,
  },
  { path: 'src/theme/views/graph.css', status: 'M', added: 24, removed: 8, staged: false },
  { path: 'src/components/common/DiffBar.vue', status: 'A', added: 40, removed: 0, staged: true },
  { path: 'src/theme/legacy-chips.css', status: 'D', added: 0, removed: 38, staged: true },
])
const selected = ref(files.value[0]!.path)
const file = computed(() => files.value.find((file) => file.path === selected.value)!)
const staged = computed(() => files.value.filter((file) => file.staged))
const summary = ref('Refine working tree review')
const notice = ref('')
const expanded = ref(true)
const sections = computed(() => [
  { name: 'Unstaged', staged: false, files: files.value.filter((file) => !file.staged) },
  { name: 'Staged', staged: true, files: staged.value },
])
function reset() {
  files.value.forEach((file, index) => (file.staged = index > 2))
  notice.value = ''
}
const diff = computed(() =>
  file.value.status === 'D'
    ? [
        { kind: 'context', text: '/* Legacy status treatments */' },
        { kind: 'del', text: '.status-chip {' },
        { kind: 'del', text: '  background: var(--accent-soft);' },
        { kind: 'del', text: '  border: 1px solid var(--accent);' },
        { kind: 'del', text: '}' },
      ]
    : [
        { kind: 'context', text: '<section class="working-tree">' },
        { kind: 'del', text: '  <p>{{ changedFiles.length }} changed files</p>' },
        { kind: 'add', text: '  <details v-for="section in sections" open>' },
        { kind: 'add', text: '    <summary>{{ section.name }}</summary>' },
        { kind: 'add', text: '    <FileList :files="section.files" />' },
        { kind: 'add', text: '  </details>' },
        { kind: 'context', text: '</section>' },
      ],
)
</script>

<template>
  <main class="design-page">
    <header class="design-intro">
      <div>
        <p class="eyebrow">ICHI / CHANGES PAGE EXPLORATION</p>
        <h1>Three ways to review your work</h1>
        <p>
          Interactive sample data. Select files and stage or unstage them to explore each layout.
        </p>
      </div>
      <div class="design-tools">
        <select v-model="settings.theme" class="ui-field" aria-label="Preview theme">
          <option value="tokyonight-night">Tokyo Night</option>
          <option value="atterpac">Atterpac</option>
          <option value="ayu-light">Light</option></select
        ><UiButton @click="reset">Reset sample</UiButton>
      </div>
    </header>
    <nav class="design-options" aria-label="Design options">
      <button
        v-for="item in options"
        :key="item.id"
        :aria-pressed="active === item.id"
        @click="active = item.id"
      >
        {{ item.name }}<small v-if="item.id === 'desk'">Recommended</small>
      </button>
    </nav>
    <p class="design-description">{{ option.description }}</p>
    <section class="design-window" :class="`layout-${active}`" :aria-label="option.name">
      <header class="window-bar">
        <strong>ichi <span>/ feature/working-tree</span></strong
        ><span>5 changed files</span>
      </header>
      <div class="window-nav">
        <span>Graph</span><strong>Changes</strong><span>Branches</span><span>Stash</span
        ><span class="nav-trailing">{{ staged.length }} staged</span>
      </div>
      <div class="design-layout">
        <aside class="file-rail" aria-label="Changed files">
          <section v-for="section in sections" :key="section.name" class="file-section">
            <header>
              <h2>
                {{ section.name }} <small>{{ section.files.length }}</small>
              </h2>
              <UiButton
                size="sm"
                variant="ghost"
                :disabled="!section.files.length"
                @click="section.files.forEach((file) => (file.staged = !section.staged))"
                >{{ section.staged ? 'Unstage all' : 'Stage all' }}</UiButton
              >
            </header>
            <p v-if="!section.files.length" class="empty-group">
              {{ section.staged ? 'Stage files for your next commit.' : 'All changes are staged.' }}
            </p>
            <button
              v-for="entry in section.files"
              :key="entry.path"
              class="sample-file"
              :class="{ selected: selected === entry.path }"
              @click="selected = entry.path"
            >
              <span :class="`status-${entry.status}`">{{ entry.status }}</span
              ><span class="sample-file-name"
                >{{ entry.path.split('/').pop()
                }}<small>{{ entry.path.substring(0, entry.path.lastIndexOf('/')) }}</small></span
              ><DiffBar :additions="entry.added" :deletions="entry.removed" />
            </button>
          </section>
        </aside>
        <section class="diff-review" aria-label="Selected file diff">
          <header>
            <div>
              <h2>{{ file.path.split('/').pop() }}</h2>
              <p>{{ file.path }}</p>
            </div>
            <UiButton size="sm" @click="file.staged = !file.staged">{{
              file.staged ? 'Unstage file' : 'Stage file'
            }}</UiButton>
          </header>
          <div class="diff-meta">
            <span>{{ file.staged ? 'Staged changes' : 'Working tree changes' }}</span
            ><span class="status-A">+{{ file.added }}</span
            ><span class="status-D">−{{ file.removed }}</span
            ><DiffBar :additions="file.added" :deletions="file.removed" />
          </div>
          <button class="hunk-toggle" :aria-expanded="expanded" @click="expanded = !expanded">
            {{ expanded ? '▾' : '▸' }} @@ −18,7 +18,10 @@ <span>sample excerpt</span>
          </button>
          <div v-if="expanded" class="sample-code">
            <div v-for="(line, index) in diff" :key="index" :class="`line-${line.kind}`">
              <span>{{ 18 + index }}</span
              ><b>{{ line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' ' }}</b
              ><code>{{ line.text }}</code>
            </div>
          </div>
          <p class="diff-end">End of sample diff</p>
        </section>
        <form
          class="commit-composer"
          @submit.prevent="notice = `Preview only: ${staged.length} files would be committed.`"
        >
          <header>
            <h2>Next commit</h2>
            <span>{{ staged.length }} staged files</span>
          </header>
          <label
            >Summary<UiInput
              v-model="summary"
              size="lg"
              required
              placeholder="Describe your changes"
          /></label>
          <label class="body-field"
            >Description<textarea class="ui-field" placeholder="Why was this change needed?" />
          </label>
          <p class="composer-note">Only staged changes go into this commit.</p>
          <UiButton
            type="submit"
            variant="primary"
            size="lg"
            :disabled="!staged.length || !summary.trim()"
            >Commit {{ staged.length }} files</UiButton
          >
        </form>
      </div>
      <footer class="window-footer">
        <span>NORMAL</span><span>j/k move · Enter inspect · s stage</span
        ><span>{{
          active === 'desk'
            ? 'Review → stage → commit'
            : active === 'focus'
              ? 'More room for code'
              : 'See your commit take shape'
        }}</span>
      </footer>
    </section>
    <p class="design-notice" role="status">{{ notice }}</p>
  </main>
</template>

<style scoped>
.design-page {
  max-width: 1560px;
  margin: 0 auto;
  padding: 28px;
  color: var(--text);
  font: var(--fs-md)/1.5 var(--font-ui);
}
.design-intro {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
}
h1 {
  margin: 4px 0 8px;
  font-size: 26px;
  font-weight: 500;
  letter-spacing: -0.5px;
}
.design-intro p {
  margin: 0;
  color: var(--text-mut);
}
.eyebrow {
  font: 11px var(--font-mono);
  letter-spacing: 0.08em;
}
.design-tools {
  display: flex;
  gap: 8px;
  flex: none;
}
.design-options {
  display: flex;
  gap: 8px;
  margin-top: 24px;
}
.design-options button {
  display: flex;
  gap: 12px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-panel);
  color: var(--text);
  padding: 10px 16px;
}
.design-options button[aria-pressed='true'] {
  background: var(--accent-soft);
  border-color: var(--accent-line);
}
.design-options small {
  color: var(--accent-text);
  font-size: 10px;
}
.design-description {
  color: var(--text-dim);
  margin: 12px 0 20px;
}
.design-window {
  overflow: hidden;
  border: 1px solid var(--border-2);
  border-radius: 10px;
  background: var(--surface-panel);
  box-shadow: var(--elev-3);
}
.window-bar,
.window-nav,
.window-footer {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 16px;
  background: var(--surface-base);
}
.window-bar {
  height: 36px;
  font: 11px var(--font-mono);
  border-bottom: 1px solid var(--border);
}
.window-bar strong {
  font-weight: 500;
  flex: 1;
}
.window-bar span,
.window-footer {
  color: var(--text-mut);
}
.window-nav {
  height: 42px;
  border-bottom: 1px solid var(--border);
  color: var(--text-mut);
}
.window-nav strong {
  color: var(--text);
  font-weight: 500;
  padding: 4px 8px;
  background: var(--hover);
  border-radius: 5px;
}
.nav-trailing {
  margin-left: auto;
  font-size: 11px;
}
.design-layout {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr) 270px;
  grid-template-areas: 'files diff compose';
  min-height: 520px;
}
.file-rail {
  grid-area: files;
  min-width: 0;
  border-right: 1px solid var(--border);
}
.file-section > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 12px;
}
h2 {
  font-size: 12px;
  font-weight: 500;
  margin: 0;
}
h2 small {
  margin-left: 4px;
  color: var(--text-mut);
  font: 11px var(--font-mono);
}
.sample-file {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 0;
  text-align: left;
  background: transparent;
  color: var(--text);
}
.sample-file:hover {
  background: var(--hover);
}
.sample-file.selected {
  background: var(--selected);
}
.sample-file-name {
  flex: 1;
  min-width: 0;
  font: 11px/1.6 var(--font-mono);
  overflow-wrap: anywhere;
}
.sample-file-name small {
  display: block;
  font: 10px/1.6 var(--font-mono);
  color: var(--text-mut);
}
.status-A {
  color: var(--positive-text);
}
.status-D {
  color: var(--negative-text);
}
.status-M {
  color: var(--warning-text);
}
.empty-group {
  margin: 0;
  padding: 0 12px 12px;
  color: var(--text-mut);
  font-size: 11px;
}
.diff-review {
  grid-area: diff;
  min-width: 0;
  overflow: hidden;
}
.diff-review > header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 16px;
}
.diff-review header p {
  margin: 4px 0 0;
  color: var(--text-mut);
  font: 11px var(--font-mono);
  overflow-wrap: anywhere;
}
.diff-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px 16px;
  font: 11px var(--font-mono);
  color: var(--text-mut);
}
.hunk-toggle {
  width: 100%;
  border: 0;
  padding: 8px 16px;
  text-align: left;
  color: var(--text-mut);
  background: var(--hover);
  font: 11px var(--font-mono);
}
.hunk-toggle span {
  float: right;
}
.sample-code {
  overflow: auto;
}
.sample-code > div {
  display: flex;
  min-width: max-content;
  padding: 4px 12px;
  font: 12px/1.6 var(--font-mono);
}
.sample-code span {
  width: 28px;
  color: var(--text-mut);
  flex: none;
}
.sample-code b {
  width: 18px;
  font-weight: 400;
}
.sample-code code {
  font: inherit;
}
.line-add {
  background: color-mix(in oklab, var(--green) 10%, transparent);
}
.line-del {
  background: color-mix(in oklab, var(--red) 10%, transparent);
}
.line-add b {
  color: var(--positive-text);
}
.line-del b {
  color: var(--negative-text);
}
.diff-end {
  text-align: center;
  color: var(--text-mut);
  margin: 24px;
  font-size: 11px;
}
.commit-composer {
  grid-area: compose;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background: var(--surface-raised);
  border-left: 1px solid var(--border);
}
.commit-composer header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.commit-composer header span {
  color: var(--text-mut);
  font-size: 11px;
}
.commit-composer label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
}
.commit-composer textarea {
  min-height: 140px;
}
.composer-note {
  margin: 0;
  color: var(--text-mut);
  font-size: 11px;
}
.commit-composer > button {
  margin-top: auto;
}
.window-footer {
  height: 28px;
  gap: 16px;
  font: 10px var(--font-mono);
  border-top: 1px solid var(--border);
}
.window-footer span:last-child {
  margin-left: auto;
}
.design-notice {
  min-height: 24px;
  color: var(--accent-text);
}
.layout-focus .design-layout {
  grid-template-columns: 230px minmax(0, 1fr);
  grid-template-rows: minmax(420px, 1fr) auto;
  grid-template-areas: 'files diff' 'compose compose';
}
.layout-focus .commit-composer {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: end;
  gap: 16px;
  border-top: 1px solid var(--border);
  border-left: 0;
}
.layout-focus .commit-composer header {
  display: block;
  align-self: center;
}
.layout-focus .body-field,
.layout-focus .composer-note {
  display: none;
}
.layout-focus .commit-composer > button {
  margin: 0;
}
.layout-board .design-layout {
  grid-template-columns: minmax(0, 1fr) 300px;
  grid-template-areas: 'files files' 'diff compose';
}
.layout-board .file-rail {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-right: 0;
  border-bottom: 1px solid var(--border);
}
.layout-board .file-section:first-child {
  border-right: 1px solid var(--border);
}
.layout-board .file-section {
  padding-bottom: 12px;
}
.layout-board .commit-composer textarea {
  min-height: 70px;
}
@media (max-width: 1000px) {
  .design-page {
    padding: 16px;
  }
  .design-layout {
    grid-template-columns: 220px minmax(0, 1fr);
    grid-template-areas: 'files diff' 'compose compose';
  }
  .layout-desk .commit-composer {
    border-top: 1px solid var(--border);
    border-left: 0;
  }
  .layout-desk .body-field {
    display: none;
  }
  .layout-desk .commit-composer {
    gap: 8px;
  }
  .design-intro {
    align-items: start;
    flex-direction: column;
  }
}
@media (max-width: 650px) {
  .design-options {
    flex-wrap: wrap;
  }
  .design-options button {
    flex: 1;
  }
  .design-layout,
  .layout-focus .design-layout,
  .layout-board .design-layout {
    display: flex;
    flex-direction: column;
  }
  .layout-board .file-rail {
    display: block;
  }
  .file-rail {
    border-right: 0;
  }
  .layout-focus .commit-composer {
    display: flex;
  }
  .window-footer span:last-child {
    display: none;
  }
  .window-nav {
    gap: 12px;
  }
  .sample-code {
    max-width: 100%;
  }
}
</style>
