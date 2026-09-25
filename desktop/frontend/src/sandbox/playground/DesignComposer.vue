<script setup lang="ts">
/** Composer — the next commit is the hero; files are a checklist beneath it. */
import { PhCaretRight, PhCheck, PhMinus } from '@phosphor-icons/vue'
import DiffPane from './DiffPane.vue'
import { name, sections, shortDir, stageAll, toggleSection, toggleStage, totals, wt, type WorkFile } from './worktree'

defineProps<{ screen: 'inspector' | 'changes' }>()

function open(f: WorkFile) {
  wt.selected = wt.selected === f.path ? '' : f.path
}
</script>

<template>
  <!-- INSPECTOR -->
  <aside v-if="screen === 'inspector'" class="comp insp">
    <div class="scroll">
      <article class="draft">
        <div class="draft-eyebrow"><span class="pulse" />Next commit on atterpac/gui</div>
        <input v-model="wt.message" class="draft-subject" />
        <div class="draft-meta">
          <span>{{ totals.staged }} of {{ totals.files }} files</span>
          <span><b class="add">+{{ totals.stagedAdd }}</b> <b class="del">−{{ totals.stagedDel }}</b></span>
        </div>
        <div class="progress"><i :style="{ width: `${(totals.staged / Math.max(1, totals.files)) * 100}%` }" /></div>
        <button type="button" class="btn primary" :disabled="!totals.staged || !!totals.conflicts">Commit</button>
      </article>

      <section v-for="sec in sections" :key="sec.id" class="group" :class="sec.id">
        <button type="button" class="group-head" :aria-expanded="!wt.collapsed.has(sec.id)" @click="toggleSection(sec.id)">
          <PhCaretRight class="caret" :size="11" weight="bold" />{{ sec.label }}<span>{{ sec.files.length }}</span>
        </button>
        <ul v-show="!wt.collapsed.has(sec.id)">
          <li v-for="f in sec.files" :key="f.path">
            <button type="button" class="check" :class="{ on: sec.id === 'staged', locked: sec.id === 'conflicts' }" :aria-pressed="sec.id === 'staged'" @click="toggleStage(f)">
              <PhCheck v-if="sec.id === 'staged'" :size="10" weight="bold" />
            </button>
            <span class="fn">{{ name(f.path) }}</span>
            <span class="st">{{ f.status }}</span>
          </li>
        </ul>
      </section>
    </div>
  </aside>

  <!-- CHANGES PAGE -->
  <div v-else class="comp page">
    <div class="column">
      <article class="draft big">
        <div class="draft-eyebrow"><span class="pulse" />Next commit on atterpac/gui</div>
        <input v-model="wt.message" class="draft-subject" />
        <textarea v-model="wt.body" rows="2" class="draft-body" placeholder="Describe why — the diff already says what." />
        <div class="draft-foot">
          <label><input v-model="wt.amend" type="checkbox" /> amend 2a44073</label>
          <span class="draft-meta-inline">{{ totals.staged }} files · <b class="add">+{{ totals.stagedAdd }}</b> <b class="del">−{{ totals.stagedDel }}</b></span>
          <button type="button" class="btn primary" :disabled="!totals.staged || !!totals.conflicts">Commit <kbd>⌃⏎</kbd></button>
        </div>
      </article>

      <section v-for="sec in sections" :key="sec.id" class="group" :class="sec.id">
        <div class="group-row">
          <button type="button" class="group-head" :aria-expanded="!wt.collapsed.has(sec.id)" @click="toggleSection(sec.id)">
            <PhCaretRight class="caret" :size="11" weight="bold" />{{ sec.label }}<span>{{ sec.files.length }}</span>
          </button>
          <button v-if="sec.id !== 'conflicts'" type="button" class="link" @click="stageAll(sec.id)">
            <template v-if="sec.id === 'staged'"><PhMinus :size="10" /> unstage all</template><template v-else><PhCheck :size="10" /> stage all</template>
          </button>
        </div>
        <ul v-show="!wt.collapsed.has(sec.id)" class="acc">
          <li v-for="f in sec.files" :key="f.path" :class="{ open: wt.selected === f.path }">
            <div class="acc-row" @click="open(f)">
              <button type="button" class="check" :class="{ on: sec.id === 'staged', locked: sec.id === 'conflicts' }" @click.stop="toggleStage(f)">
                <PhCheck v-if="sec.id === 'staged'" :size="10" weight="bold" />
              </button>
              <span class="fn">{{ name(f.path) }}<small>{{ shortDir(f.path) }}</small></span>
              <span class="nums"><b class="add">+{{ f.add }}</b> <b class="del">−{{ f.del }}</b></span>
              <PhCaretRight class="caret" :size="11" />
            </div>
            <DiffPane v-if="wt.selected === f.path" bare class="inline-diff" />
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.comp {
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
  padding: 14px;
}
.draft {
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  border-radius: 10px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 10%, var(--bg-soft)), var(--bg-soft));
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.draft-eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fg-muted);
  font: 11px var(--mono);
}
.pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
}
.draft-subject {
  border: 0;
  border-bottom: 1px dashed var(--border);
  padding: 2px 0 6px;
  background: none;
  color: var(--fg);
  font: 500 14px inherit;
  outline: none;
}
.draft-subject:focus {
  border-bottom-color: var(--accent);
}
.draft-body {
  border: 0;
  background: none;
  color: var(--fg-muted);
  font: 13px inherit;
  resize: none;
  outline: none;
}
.draft-meta {
  display: flex;
  justify-content: space-between;
  color: var(--fg-muted);
  font: 11px var(--mono);
}
.add {
  color: var(--add);
  font-weight: 500;
}
.del {
  color: var(--del);
  font-weight: 500;
}
.progress {
  height: 3px;
  border-radius: 2px;
  background: var(--hover);
}
.progress i {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
  transition: width 200ms;
}
.btn {
  padding: 7px 12px;
  border: 0;
  border-radius: 6px;
  font: 500 12px inherit;
  cursor: pointer;
}
.btn.primary {
  background: var(--accent);
  color: var(--bg);
}
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.group {
  margin-top: 14px;
}
.group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 0;
  border: 0;
  background: none;
  color: var(--fg-muted);
  font: 500 12px inherit;
  cursor: pointer;
}
.group-head span {
  margin-left: 4px;
  font: 11px var(--mono);
  opacity: 0.8;
}
.group.conflicts .group-head {
  color: var(--conflict);
}
.caret {
  transition: transform 120ms;
}
.group-head[aria-expanded='true'] .caret,
li.open .acc-row .caret {
  transform: rotate(90deg);
}
ul {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}
.insp li {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 3px 4px;
  border-radius: 4px;
}
.insp li:hover {
  background: var(--hover);
}
.check {
  display: grid;
  place-items: center;
  width: 15px;
  height: 15px;
  padding: 0;
  border: 1.5px solid var(--fg-muted);
  border-radius: 4px;
  background: none;
  color: var(--bg);
  cursor: pointer;
}
.check.on {
  border-color: var(--accent);
  background: var(--accent);
}
.check.locked {
  border-style: dashed;
  border-color: var(--conflict);
  cursor: not-allowed;
}
.fn {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font: 12px var(--mono);
}
.fn small {
  margin-left: 8px;
  color: var(--fg-muted);
}
.st {
  color: var(--fg-muted);
  font: 11px var(--mono);
}

/* page */
.page {
  height: 100%;
  overflow: auto;
}
.column {
  max-width: 760px;
  margin: 0 auto;
  padding: 24px 20px 40px;
}
.draft.big .draft-subject {
  font-size: 18px;
}
.draft-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--fg-muted);
  font-size: 12px;
}
.draft-foot label {
  display: flex;
  align-items: center;
  gap: 5px;
  font: 11px var(--mono);
}
.draft-foot input {
  accent-color: var(--accent);
}
.draft-meta-inline {
  margin-left: auto;
  font: 11px var(--mono);
}
kbd {
  font: 10px var(--mono);
  opacity: 0.7;
}
.group-row {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border);
}
.link {
  display: flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: none;
  color: var(--fg-muted);
  font: 11px var(--mono);
  white-space: nowrap;
  cursor: pointer;
}
.link:hover {
  color: var(--accent);
}
.acc li {
  border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}
.acc-row {
  display: grid;
  grid-template-columns: 18px 1fr auto 14px;
  align-items: center;
  gap: 10px;
  padding: 7px 4px;
  cursor: pointer;
}
.acc-row:hover {
  background: var(--hover);
}
.nums {
  font: 11px var(--mono);
}
.inline-diff {
  height: auto;
  max-height: 260px;
  margin: 0 0 10px 28px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  overflow: hidden;
}
</style>
