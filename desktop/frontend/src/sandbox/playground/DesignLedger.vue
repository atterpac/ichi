<script setup lang="ts">
import FileStatusIcon from '../../components/common/FileStatusIcon.vue'
/** Ledger — dense, keyboard-first. Tightened version of today's layout. */
import { PhCaretRight } from '@phosphor-icons/vue'
import DiffPane from './DiffPane.vue'
import { maxChurn, name, sections, shortDir, stageAll, toggleSection, toggleStage, totals, wt } from './worktree'

defineProps<{ screen: 'inspector' | 'changes' }>()

const segs = [
  { id: 'conflicts', key: 'conflicts' as const },
  { id: 'staged', key: 'staged' as const },
  { id: 'unstaged', key: 'unstaged' as const },
  { id: 'untracked', key: 'untracked' as const },
]
</script>

<template>
  <!-- INSPECTOR -->
  <aside v-if="screen === 'inspector'" class="ledger insp">
    <div class="scroll">
      <header class="head">
        <div class="eyebrow">Working tree · atterpac/gui</div>
        <h3>{{ totals.files }} changed files</h3>
        <div class="stat">
          <b class="add">+{{ totals.add }}</b><b class="del">−{{ totals.del }}</b>
          <span class="dim">vs 2a44073</span>
        </div>
        <div class="seg" aria-hidden="true">
          <span v-for="s in segs" :key="s.id" :class="s.id" :style="{ flexGrow: totals[s.key] }" />
        </div>
        <div class="legend">
          <span v-for="s in segs.filter((s) => totals[s.key])" :key="s.id" :class="s.id"><i />{{ totals[s.key] }} {{ s.id }}</span>
        </div>
      </header>

      <section v-for="sec in sections" :key="sec.id" class="sec" :class="sec.id">
        <h4>
          <button type="button" class="sec-toggle" :aria-expanded="!wt.collapsed.has(sec.id)" @click="toggleSection(sec.id)">
            <PhCaretRight class="caret" :size="11" weight="bold" />{{ sec.label }}<span class="count">{{ sec.files.length }}</span>
          </button>
          <button v-if="sec.id === 'unstaged' || sec.id === 'untracked'" type="button" class="sec-act" @click="stageAll(sec.id)">stage all</button>
          <button v-else-if="sec.id === 'staged'" type="button" class="sec-act" @click="stageAll('staged')">unstage all</button>
        </h4>
        <div v-show="!wt.collapsed.has(sec.id)">
          <button v-for="f in sec.files" :key="f.path" type="button" class="row" :class="{ sel: wt.selected === f.path }" @click="wt.selected = f.path">
            <FileStatusIcon class="st" :class="`st-${sec.id}`" :status="f.status" />
            <span class="nm">{{ name(f.path) }}<small>{{ shortDir(f.path) }}</small></span>
            <span class="churn">
              <i class="a" :style="{ width: `${(f.add / maxChurn) * 36}px` }" /><i class="d" :style="{ width: `${(f.del / maxChurn) * 36}px` }" />
            </span>
          </button>
        </div>
      </section>
    </div>
    <footer class="foot">
      <button type="button" class="btn primary">Review changes <kbd>⏎</kbd></button>
      <button type="button" class="btn">Commit {{ totals.staged }} staged <kbd>c</kbd></button>
    </footer>
  </aside>

  <!-- CHANGES PAGE -->
  <div v-else class="ledger page">
    <div class="list">
      <div class="list-scroll">
        <section v-for="sec in sections" :key="sec.id" class="sec" :class="sec.id">
          <h4>
            <button type="button" class="sec-toggle" :aria-expanded="!wt.collapsed.has(sec.id)" @click="toggleSection(sec.id)">
              <PhCaretRight class="caret" :size="11" weight="bold" />{{ sec.label }}<span class="count">{{ sec.files.length }}</span>
            </button>
          </h4>
          <div v-show="!wt.collapsed.has(sec.id)">
            <div v-for="f in sec.files" :key="f.path" class="row" :class="{ sel: wt.selected === f.path }" @click="wt.selected = f.path">
              <input type="checkbox" :checked="sec.id === 'staged'" :disabled="sec.id === 'conflicts'" @click.stop="toggleStage(f)" />
              <span class="nm">{{ name(f.path) }}<small>{{ shortDir(f.path) }}</small></span>
              <FileStatusIcon class="st" :class="`st-${sec.id}`" :status="f.status" />
            </div>
          </div>
        </section>
      </div>
      <form class="commit" @submit.prevent>
        <div class="subject">
          <input v-model="wt.message" placeholder="Commit subject" />
          <span class="ctr" :class="{ over: wt.message.length > 50 }">{{ 50 - wt.message.length }}</span>
        </div>
        <textarea v-model="wt.body" rows="3" placeholder="Body (optional)" />
        <div class="commit-row">
          <label><input v-model="wt.amend" type="checkbox" /> Amend</label>
          <button type="submit" class="btn primary" :disabled="!totals.staged">Commit {{ totals.staged }} <kbd>⌃⏎</kbd></button>
        </div>
      </form>
    </div>
    <DiffPane class="diffcol" />
  </div>
</template>

<style scoped>
.ledger {
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
  padding: 16px;
}
.eyebrow {
  color: var(--fg-muted);
  font: 11px var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
h3 {
  margin: 4px 0 6px;
  font-size: 17px;
  font-weight: 500;
}
.stat {
  display: flex;
  gap: 8px;
  font: 12px var(--mono);
}
.add {
  color: var(--add);
}
.del {
  color: var(--del);
}
.dim {
  color: var(--fg-muted);
  margin-left: auto;
}
.seg {
  display: flex;
  gap: 2px;
  height: 6px;
  margin: 12px 0 8px;
}
.seg span,
.legend i {
  border-radius: 2px;
  background: var(--fg-muted);
}
.conflicts > i,
.seg .conflicts {
  background: var(--conflict);
}
.staged > i,
.seg .staged {
  background: var(--add);
}
.unstaged > i,
.seg .unstaged {
  background: color-mix(in srgb, var(--accent-2) 45%, var(--fg-muted));
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  color: var(--fg-muted);
  font: 11px var(--mono);
}
.legend i {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 5px;
}
.sec {
  margin-top: 14px;
}
.sec h4 {
  display: flex;
  align-items: center;
  margin: 0 0 2px;
  border-bottom: 1px solid var(--border);
}
.sec-toggle {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 0;
  border: 0;
  background: none;
  color: var(--fg-muted);
  font: 500 11px var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  text-align: left;
}
.sec-toggle:hover {
  color: var(--fg);
}
.sec.conflicts .sec-toggle {
  color: var(--conflict);
}
.caret {
  transition: transform 120ms;
}
.sec-toggle[aria-expanded='true'] .caret {
  transform: rotate(90deg);
}
.count {
  font-weight: 400;
  opacity: 0.8;
}
.sec-act {
  border: 0;
  background: none;
  color: var(--fg-muted);
  font: 11px var(--mono);
  cursor: pointer;
  opacity: 0;
}
.sec h4:hover .sec-act {
  opacity: 1;
}
.sec-act:hover {
  color: var(--accent);
}
.row {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 6px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.row:hover {
  background: var(--hover);
}
.row.sel {
  background: var(--sel);
}
.st {
  font: 500 12px var(--mono);
  color: var(--fg-muted);
}
.st-staged {
  color: var(--add);
}
.st-conflicts {
  color: var(--conflict);
}
.nm {
  min-width: 0;
  font: 12px var(--mono);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.nm small {
  margin-left: 8px;
  color: var(--fg-muted);
  font-size: 11px;
}
.churn {
  display: flex;
  gap: 1px;
}
.churn i {
  height: 4px;
  border-radius: 1px;
}
.churn .a {
  background: var(--add);
}
.churn .d {
  background: var(--del);
}
.foot {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-soft);
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--fg);
  font: 12px inherit;
  cursor: pointer;
}
.btn.primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--bg);
}
.btn:disabled {
  opacity: 0.4;
}
kbd {
  font: 10px var(--mono);
  opacity: 0.7;
}

/* page */
.page {
  display: flex;
  min-height: 0;
  height: 100%;
}
.list {
  width: 320px;
  flex: none;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background: var(--surface);
}
.list-scroll {
  flex: 1;
  overflow: auto;
  padding: 0 12px 12px;
}
.page .row {
  grid-template-columns: 16px minmax(0, 1fr) 14px;
}
.page .row input {
  margin: 0;
  accent-color: var(--accent);
}
.commit {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-top: 1px solid var(--border);
  background: var(--bg-soft);
}
.subject {
  position: relative;
}
.commit input:not([type]),
.commit textarea {
  width: 100%;
  padding: 7px 34px 7px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--fg);
  font: 12px var(--mono);
  resize: none;
}
.commit input:focus,
.commit textarea:focus {
  outline: 1px solid var(--accent);
}
.ctr {
  position: absolute;
  right: 8px;
  top: 8px;
  color: var(--fg-muted);
  font: 10px var(--mono);
}
.ctr.over {
  color: var(--conflict);
}
.commit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--fg-muted);
  font-size: 12px;
}
.diffcol {
  flex: 1;
}
</style>
