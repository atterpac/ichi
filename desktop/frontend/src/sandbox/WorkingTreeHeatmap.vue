<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { PhCaretRight, PhCheck, PhFolder, PhGitBranch } from '@phosphor-icons/vue'
import { groupByDir, name, shortDir, STATUS_NAME, wt } from './playground/worktree'
import type { WorkFile } from './playground/worktree'
import { useShellSettings } from '../composables/useShellSettings'
import DiffBar from '../components/common/DiffBar.vue'

const settings = useShellSettings()
const collapsed = ref(new Set<string>())
const groups = computed(() => groupByDir(wt.files).sort((a, b) => a.dir.localeCompare(b.dir)))
const files = computed(() => groups.value.flatMap((group) => group.files))
const selected = computed(() => wt.files.find((file) => file.path === wt.selected) ?? wt.files[0]!)
const additions = computed(() => wt.files.reduce((sum, file) => sum + file.add, 0))
const deletions = computed(() => wt.files.reduce((sum, file) => sum + file.del, 0))
const total = computed(() => additions.value + deletions.value)
const staged = computed(() => wt.files.filter((file) => file.section === 'staged').length)
const conflicts = computed(() => wt.files.filter((file) => file.section === 'conflicts').length)
const statusName = (file: WorkFile) =>
  file.section === 'staged'
    ? 'Staged'
    : file.section === 'untracked'
      ? 'Untracked'
      : file.section === 'conflicts'
        ? 'Conflict'
        : 'Unstaged'
const indexOf = (file: WorkFile) => files.value.findIndex((entry) => entry.path === file.path)
function toggle(dir: string) {
  const next = new Set(collapsed.value)
  if (next.has(dir)) next.delete(dir)
  else next.add(dir)
  collapsed.value = next
}
async function select(file: WorkFile, reveal = false) {
  wt.selected = file.path
  if (reveal) {
    collapsed.value.delete(shortDir(file.path) || '.')
    await nextTick()
    document
      .getElementById(`heat-file-${indexOf(file)}`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  }
}
function mapKey(event: KeyboardEvent, index: number) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const target =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? files.value.length - 1
        : Math.max(
            0,
            Math.min(files.value.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)),
          )
  const file = files.value[target]
  if (file) {
    void select(file, true)
    document.getElementById(`heat-segment-${target}`)?.focus()
  }
}
</script>

<template>
  <main class="heat-study">
    <header class="study-head">
      <div>
        <p class="eyebrow">ICHI / WORKING TREE</p>
        <h1>A quieter change map</h1>
        <p>Select a file in the map or the list. Both stay in sync.</p>
      </div>
      <select v-model="settings.theme" class="ui-field" aria-label="Preview theme">
        <option value="atterpac">Atterpac</option>
        <option value="tokyonight-night">Tokyo Night</option>
        <option value="ayu-light">Light</option>
      </select>
    </header>
    <section class="study-window">
      <header class="study-chrome">
        <strong>ichi</strong><span>/</span><PhGitBranch :size="12" /><span>atterpac/gui</span
        ><span class="chrome-count">12 changed</span>
      </header>
      <div class="study-body">
        <section class="context-pane" aria-label="Selected file preview">
          <div class="context-nav"><span>Graph</span><strong>Working tree</strong></div>
          <div class="context-content">
            <p class="eyebrow">SELECTED FILE</p>
            <h2>{{ name(selected.path) }}</h2>
            <p class="context-path">{{ selected.path }}</p>
            <div class="context-stats">
              <span>{{ statusName(selected) }}</span
              ><span class="positive">+{{ selected.add }}</span
              ><span class="negative">−{{ selected.del }}</span
              ><DiffBar :additions="selected.add" :deletions="selected.del" />
            </div>
            <div class="context-note">
              <strong>The map is a navigator.</strong>
              <p>
                Segment width reflects lines changed. The accent marks your selected file. Directory
                order stays stable as you move through the list.
              </p>
              <p>
                Small and zero-line changes keep a minimum target width. Exact counts appear beside
                each file.
              </p>
            </div>
            <p class="preview-note">Design preview · sample files · no Git operations</p>
          </div>
        </section>
        <aside class="heat-pane" aria-label="Working tree heatmap inspector">
          <header class="pane-head">
            <div class="pane-title">
              <h2>Working tree</h2>
              <span>{{ files.length }} files</span>
            </div>
            <div class="summary">
              <span class="positive">+{{ additions }}</span
              ><span class="negative">−{{ deletions }}</span
              ><span class="summary-meta"
                >{{ staged }} staged<span v-if="conflicts"> · {{ conflicts }} conflict</span></span
              >
            </div>
          </header>
          <section class="map-section" aria-label="Changes by file">
            <div class="map-caption">
              <span>Changes by file</span
              ><span>{{ selected.add + selected.del }} / {{ total }} lines</span>
            </div>
            <div class="change-map" role="group" aria-label="Select a changed file">
              <button
                v-for="(file, index) in files"
                :id="`heat-segment-${index}`"
                :key="file.path"
                type="button"
                class="map-segment"
                :class="{ selected: wt.selected === file.path, empty: file.add + file.del === 0 }"
                :style="{ flexGrow: Math.max(file.add + file.del, 1) }"
                :aria-pressed="wt.selected === file.path"
                :aria-label="`${file.path}: ${statusName(file)}, ${file.add} additions, ${file.del} deletions`"
                :title="`${file.path}\n+${file.add} −${file.del} · ${statusName(file)}`"
                @click="select(file, true)"
                @keydown="mapKey($event, index)"
              >
                <span />
              </button>
            </div>
            <div class="map-selection">
              <span class="selection-dot" /><span>{{ name(selected.path) }}</span
              ><small>{{ statusName(selected) }}</small>
            </div>
          </section>
          <div class="heat-files">
            <section v-for="group in groups" :key="group.dir" class="directory">
              <button
                class="directory-toggle"
                type="button"
                :aria-expanded="!collapsed.has(group.dir)"
                :aria-controls="`heat-group-${groups.indexOf(group)}`"
                @click="toggle(group.dir)"
              >
                <PhCaretRight :size="10" class="caret" /><PhFolder :size="13" /><span
                  :title="group.dir"
                  >{{ group.dir }}</span
                ><small>{{ group.files.length }}</small>
              </button>
              <div :id="`heat-group-${groups.indexOf(group)}`" v-show="!collapsed.has(group.dir)">
                <button
                  v-for="file in group.files"
                  :id="`heat-file-${indexOf(file)}`"
                  :key="file.path"
                  class="heat-file"
                  :class="{ selected: wt.selected === file.path }"
                  :aria-pressed="wt.selected === file.path"
                  :title="`${file.path}\n${STATUS_NAME[file.status]} · ${statusName(file)}`"
                  @click="select(file)"
                >
                  <PhCheck
                    v-if="file.section === 'staged'"
                    class="file-mark staged"
                    :size="12"
                    aria-label="Staged"
                  /><span
                    v-else
                    class="file-mark"
                    :class="{ conflict: file.section === 'conflicts' }"
                    :aria-label="statusName(file)"
                    >{{ file.section === 'conflicts' ? '!' : file.status }}</span
                  >
                  <span class="heat-name"
                    >{{ name(file.path)
                    }}<small v-if="file.oldPath">from {{ name(file.oldPath) }}</small></span
                  ><span class="file-counts"
                    ><span class="positive">+{{ file.add }}</span
                    ><span class="negative">−{{ file.del }}</span></span
                  >
                </button>
              </div>
            </section>
          </div>
          <footer class="pane-footer">
            <span><PhCheck :size="12" /> staged</span><span>M modified</span><span>? untracked</span
            ><span v-if="conflicts" class="conflict">! conflict</span>
          </footer>
        </aside>
      </div>
    </section>
  </main>
</template>

<style scoped>
.heat-study {
  max-width: 1280px;
  margin: 0 auto;
  padding: 32px;
  color: var(--text);
  font: var(--fs-md)/1.5 var(--font-ui);
}
.study-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}
.eyebrow {
  margin: 0;
  color: var(--text-mut);
  font: 10px var(--font-mono);
  letter-spacing: 0.08em;
}
h1 {
  margin: 8px 0;
  font-size: 24px;
  font-weight: 500;
  letter-spacing: -0.5px;
}
.study-head p:last-child {
  margin: 0;
  color: var(--text-mut);
}
.study-window {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: var(--elev-3);
}
.study-chrome {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 16px;
  background: var(--surface-base);
  border-bottom: 1px solid var(--border);
  font: 11px var(--font-mono);
  color: var(--text-mut);
}
.study-chrome strong {
  color: var(--text);
  font-weight: 500;
}
.chrome-count {
  margin-left: auto;
}
.study-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 390px;
  height: 740px;
}
.context-pane {
  background: var(--surface-panel);
  min-width: 0;
}
.context-nav {
  display: flex;
  gap: 20px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--line-faint);
  font-size: 12px;
  color: var(--text-mut);
}
.context-nav strong {
  font-weight: 500;
  color: var(--text);
}
.context-content {
  padding: 32px;
}
.context-content h2 {
  margin: 12px 0 8px;
  font-weight: 500;
  font-size: 20px;
  overflow-wrap: anywhere;
}
.context-path {
  color: var(--text-mut);
  font: 11px/1.6 var(--font-mono);
  overflow-wrap: anywhere;
}
.context-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-top: 20px;
  font: 11px var(--font-mono);
}
.context-stats > span:first-child {
  color: var(--text-dim);
}
.context-note {
  max-width: 350px;
  margin-top: 72px;
  color: var(--text-mut);
  font-size: 12px;
  line-height: 1.7;
}
.context-note strong {
  font-weight: 500;
  color: var(--text-dim);
}
.preview-note {
  margin-top: 48px;
  color: var(--text-mut);
  font: 10px var(--font-mono);
}
.heat-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  background: var(--surface-raised);
  border-left: 1px solid var(--border);
  box-shadow: var(--elev-2);
}
.pane-head {
  padding: 20px 20px 0;
}
.pane-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.pane-title h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  letter-spacing: -0.3px;
}
.pane-title > span {
  color: var(--text-mut);
  font: 11px var(--font-mono);
}
.summary {
  display: flex;
  gap: 12px;
  align-items: baseline;
  margin-top: 12px;
  font: 13px var(--font-mono);
}
.summary-meta {
  margin-left: auto;
  color: var(--text-mut);
  font: 11px var(--font-ui);
}
.positive {
  color: var(--positive-text);
}
.negative {
  color: var(--negative-text);
}
.conflict {
  color: var(--negative-text);
}
.map-section {
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--line-faint);
}
.map-caption {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-mut);
  font: 10px var(--font-mono);
}
.change-map {
  display: flex;
  gap: 3px;
  height: 28px;
  margin-top: 6px;
  align-items: stretch;
}
.map-segment {
  position: relative;
  flex-basis: 0;
  min-width: 6px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  padding: 7px 0;
  cursor: pointer;
}
.map-segment > span {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: color-mix(in oklab, var(--accent) 28%, var(--surface-raised));
}
.map-segment.empty > span {
  background: var(--border);
}
.map-segment:hover > span {
  background: color-mix(in oklab, var(--accent) 55%, var(--surface-raised));
}
.map-segment.selected > span {
  background: var(--accent);
}
.map-segment.selected::after {
  content: '';
  position: absolute;
  bottom: 1px;
  left: calc(50% - 2px);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}
.map-segment:focus-visible {
  outline: 2px solid var(--accent-text);
  outline-offset: 1px;
}
.map-selection {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  min-width: 0;
  font: 11px var(--font-mono);
}
.map-selection > span:nth-child(2) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selection-dot {
  flex: none;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
}
.map-selection small {
  flex: none;
  margin-left: auto;
  font: 10px var(--font-ui);
  color: var(--text-mut);
}
.heat-files {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}
.directory + .directory {
  margin-top: 12px;
}
.directory-toggle {
  display: grid;
  grid-template-columns: 10px 13px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px;
  background: transparent;
  border: 0;
  color: var(--text-mut);
  font: 11px var(--font-mono);
  text-align: left;
}
.directory-toggle > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.directory-toggle small {
  font: 10px var(--font-mono);
}
.directory-toggle:hover {
  color: var(--text);
}
.directory-toggle[aria-expanded='true'] .caret {
  transform: rotate(90deg);
}
.heat-file {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  padding: 8px 8px 8px 27px;
  background: transparent;
  border: 0;
  border-radius: 5px;
  color: var(--text);
  text-align: left;
}
.heat-file:hover {
  background: var(--hover);
}
.heat-file.selected {
  background: var(--selected);
}
.heat-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 11px var(--font-mono);
}
.heat-name small {
  display: block;
  font: 10px/1.6 var(--font-mono);
  color: var(--text-mut);
}
.file-mark {
  color: var(--text-mut);
  font: 10px var(--font-mono);
}
.file-mark.staged {
  color: var(--positive-text);
}
.file-mark.conflict {
  color: var(--negative-text);
}
.file-counts {
  display: flex;
  gap: 6px;
  font: 10px var(--font-mono);
}
.pane-footer {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 20px;
  border-top: 1px solid var(--line-faint);
  color: var(--text-mut);
  font: 10px var(--font-mono);
}
.pane-footer span {
  display: flex;
  align-items: center;
  gap: 4px;
}
@media (max-width: 850px) {
  .study-body {
    grid-template-columns: minmax(0, 1fr) 360px;
  }
  .context-content {
    padding: 20px;
  }
  .context-note {
    margin-top: 32px;
  }
}
@media (max-width: 650px) {
  .heat-study {
    padding: 16px;
  }
  .study-head {
    align-items: start;
    flex-direction: column;
  }
  .study-body {
    display: block;
    height: auto;
  }
  .context-pane {
    display: none;
  }
  .heat-pane {
    height: 760px;
    border-left: 0;
  }
  .study-chrome {
    font-size: 10px;
  }
}
</style>
