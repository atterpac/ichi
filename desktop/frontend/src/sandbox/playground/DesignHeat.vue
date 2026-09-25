<script setup lang="ts">
/** Heat — directory tree weighted by churn; where the change actually lives. */
import { computed } from 'vue'
import { PhCaretRight, PhFolder } from '@phosphor-icons/vue'
import DiffPane from './DiffPane.vue'
import { groupByDir, maxChurn, name, toggleDir, toggleStage, totals, visibleFiles, wt, type Section } from './worktree'

defineProps<{ screen: 'inspector' | 'changes' }>()

const tree = computed(() =>
  groupByDir(visibleFiles.value)
    .map((g) => ({ ...g, churn: g.files.reduce((n, f) => n + f.add + f.del, 0) }))
    .sort((a, b) => b.churn - a.churn),
)
const byChurn = computed(() => [...visibleFiles.value].sort((a, b) => b.add + b.del - (a.add + a.del)))
const dot: Record<Section, string> = { conflicts: '!', staged: '●', unstaged: '○', untracked: '+' }
</script>

<template>
  <!-- INSPECTOR -->
  <aside v-if="screen === 'inspector'" class="heat insp">
    <div class="scroll">
      <header class="hero">
        <div class="big"><b class="add">+{{ totals.add }}</b><b class="del">−{{ totals.del }}</b></div>
        <div class="sub">{{ totals.files }} files · {{ totals.staged }} staged · {{ totals.unstaged + totals.untracked }} pending<span v-if="totals.conflicts"> · <em>{{ totals.conflicts }} conflict</em></span></div>
        <!-- churn strip: one segment per file, width ∝ lines touched -->
        <div class="strip" aria-hidden="true">
          <span
            v-for="f in byChurn"
            :key="f.path"
            :class="[f.section, { sel: wt.selected === f.path }]"
            :style="{ flexGrow: Math.max(f.add + f.del, 8) }"
            :title="f.path"
            @click="wt.selected = f.path"
          />
        </div>
      </header>

      <div class="tree">
        <section v-for="g in tree" :key="g.dir" class="dir">
          <button type="button" class="dir-head" :aria-expanded="!wt.collapsedDirs.has(g.dir)" @click="toggleDir(g.dir)">
            <PhCaretRight class="caret" :size="10" weight="bold" /><PhFolder :size="13" />
            <span class="dir-nm">{{ g.dir }}</span>
            <span class="heatbar"><i :style="{ width: `${Math.min(100, (g.churn / maxChurn) * 60)}%` }" /></span>
          </button>
          <div v-show="!wt.collapsedDirs.has(g.dir)" class="files">
            <button v-for="f in g.files" :key="f.path" type="button" class="file" :class="{ sel: wt.selected === f.path }" @click="wt.selected = f.path">
              <span class="mark" :class="f.section" :title="f.section">{{ dot[f.section] }}</span>
              <span class="fn">{{ name(f.path) }}</span>
              <span class="n"><span class="add">{{ f.add || '' }}</span> <span class="del">{{ f.del || '' }}</span></span>
            </button>
          </div>
        </section>
      </div>
      <p class="key"><span class="mark staged">●</span> staged <span class="mark unstaged">○</span> unstaged <span class="mark untracked">+</span> new <span class="mark conflicts">!</span> conflict</p>
    </div>
  </aside>

  <!-- CHANGES PAGE -->
  <div v-else class="heat page">
    <nav class="side">
      <div class="side-head">
        <span>{{ totals.files }} files</span>
        <span class="add">+{{ totals.add }}</span><span class="del">−{{ totals.del }}</span>
      </div>
      <div class="tree side-tree">
        <section v-for="g in tree" :key="g.dir" class="dir">
          <button type="button" class="dir-head" :aria-expanded="!wt.collapsedDirs.has(g.dir)" @click="toggleDir(g.dir)">
            <PhCaretRight class="caret" :size="10" weight="bold" /><span class="dir-nm">{{ g.dir }}</span>
            <span class="heatbar"><i :style="{ width: `${Math.min(100, (g.churn / maxChurn) * 60)}%` }" /></span>
          </button>
          <div v-show="!wt.collapsedDirs.has(g.dir)" class="files">
            <div v-for="f in g.files" :key="f.path" class="file" :class="{ sel: wt.selected === f.path }" @click="wt.selected = f.path">
              <button type="button" class="mark btnmark" :class="f.section" :title="f.section === 'staged' ? 'Unstage' : 'Stage'" @click.stop="toggleStage(f)">{{ dot[f.section] }}</button>
              <span class="fn">{{ name(f.path) }}</span>
              <span class="filebar"><i class="a" :style="{ width: `${(f.add / maxChurn) * 100}%` }" /><i class="d" :style="{ width: `${(f.del / maxChurn) * 100}%` }" /></span>
            </div>
          </div>
        </section>
      </div>
    </nav>
    <div class="main">
      <DiffPane minimap class="d" />
      <form class="dock" @submit.prevent>
        <span class="dock-count">{{ totals.staged }} staged</span>
        <input v-model="wt.message" placeholder="Commit subject…" />
        <button type="submit" class="btn">Commit <kbd>⌃⏎</kbd></button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.heat {
  font-size: 13px;
  color: var(--fg);
}
.insp {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--surface);
}
.scroll {
  flex: 1;
  overflow: auto;
  padding: 18px 16px;
}
.big {
  display: flex;
  gap: 12px;
  font: 500 26px var(--mono);
  letter-spacing: -0.5px;
}
.sub {
  margin-top: 2px;
  color: var(--fg-muted);
  font-size: 12px;
}
.sub em {
  color: var(--conflict);
  font-style: normal;
}
.add {
  color: var(--add);
}
.del {
  color: var(--del);
}
.strip {
  display: flex;
  gap: 2px;
  height: 22px;
  margin: 14px 0 18px;
}
.strip span {
  min-width: 3px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--fg-muted) 50%, transparent);
  cursor: pointer;
  transition: transform 100ms;
}
.strip span:hover {
  transform: scaleY(1.2);
}
.strip .staged {
  background: var(--add);
}
.strip .unstaged {
  background: color-mix(in srgb, var(--accent-2) 45%, var(--fg-muted));
}
.strip .conflicts {
  background: var(--conflict);
}
.strip .sel {
  outline: 2px solid var(--fg);
  outline-offset: 1px;
}
.dir + .dir {
  margin-top: 4px;
}
.dir-head {
  display: grid;
  grid-template-columns: 12px auto minmax(0, 1fr) 60px;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 4px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--fg-muted);
  font: 11px var(--mono);
  cursor: pointer;
  text-align: left;
}
.side-tree .dir-head {
  grid-template-columns: 12px minmax(0, 1fr) 48px;
}
.dir-head:hover {
  background: var(--hover);
  color: var(--fg);
}
.caret {
  transition: transform 120ms;
}
.dir-head[aria-expanded='true'] .caret {
  transform: rotate(90deg);
}
.dir-nm {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  direction: rtl;
  text-align: left;
}
.heatbar {
  height: 4px;
  border-radius: 2px;
  background: var(--hover);
  overflow: hidden;
}
.heatbar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--accent-2), var(--accent));
}
.files {
  margin-left: 18px;
  padding-left: 8px;
  border-left: 1px solid var(--border);
}
.file {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 3px 6px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: inherit;
  font: 12px var(--mono);
  cursor: pointer;
  text-align: left;
}
.file:hover {
  background: var(--hover);
}
.file.sel {
  background: var(--sel);
}
.fn {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.n {
  font-size: 11px;
}
.mark {
  font: 12px var(--mono);
  color: var(--fg-muted);
}
.mark.staged {
  color: var(--add);
}
.mark.conflicts {
  color: var(--conflict);
}
.mark.untracked {
  color: var(--accent-2);
}
.btnmark {
  border: 0;
  background: none;
  padding: 0;
  cursor: pointer;
}
.btnmark:hover {
  transform: scale(1.3);
}
.key {
  margin: 18px 0 0;
  color: var(--fg-muted);
  font-size: 11px;
}
.key .mark {
  margin-left: 8px;
}

/* page */
.page {
  display: flex;
  height: 100%;
  min-height: 0;
}
.side {
  width: 300px;
  flex: none;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background: var(--surface);
}
.side-head {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  font: 12px var(--mono);
}
.side-head span:first-child {
  flex: 1;
}
.side-tree {
  flex: 1;
  overflow: auto;
  padding: 8px;
}
.filebar {
  display: flex;
  width: 44px;
  height: 4px;
  gap: 1px;
}
.filebar i {
  border-radius: 1px;
}
.filebar .a {
  background: var(--add);
}
.filebar .d {
  background: var(--del);
}
.main {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.d {
  flex: 1;
  padding-bottom: 64px;
}
.dock {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(560px, 90%);
  padding: 6px 6px 6px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-soft) 85%, transparent);
  backdrop-filter: blur(10px);
  box-shadow: 0 10px 30px color-mix(in srgb, var(--bg) 70%, transparent);
}
.dock-count {
  color: var(--add);
  font: 11px var(--mono);
  white-space: nowrap;
}
.dock input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: none;
  color: var(--fg);
  font: 13px inherit;
  outline: none;
}
.btn {
  padding: 6px 12px;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: var(--bg);
  font: 12px inherit;
  cursor: pointer;
}
kbd {
  font: 10px var(--mono);
  opacity: 0.7;
}
</style>
