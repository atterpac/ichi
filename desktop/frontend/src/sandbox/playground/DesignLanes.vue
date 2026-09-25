<script setup lang="ts">
/** Lanes — staging reads as a pipeline: working → next commit. */
import { computed } from 'vue'
import { PhArrowRight, PhArrowLeft, PhCaretRight, PhWarning } from '@phosphor-icons/vue'
import DiffPane from './DiffPane.vue'
import { name, sections, shortDir, toggleSection, toggleStage, totals, visibleFiles, wt } from './worktree'

defineProps<{ screen: 'inspector' | 'changes' }>()

const working = computed(() => visibleFiles.value.filter((f) => f.section === 'unstaged' || f.section === 'untracked'))
const staged = computed(() => visibleFiles.value.filter((f) => f.section === 'staged'))
const conflicts = computed(() => visibleFiles.value.filter((f) => f.section === 'conflicts'))
const pipeline = computed(() => sections.value.filter((s) => s.id !== 'staged'))
</script>

<template>
  <!-- INSPECTOR -->
  <aside v-if="screen === 'inspector'" class="lanes insp">
    <div class="scroll">
      <div v-if="conflicts.length" class="alert">
        <PhWarning :size="14" weight="bold" /> {{ conflicts.length }} conflict blocks the commit
        <button type="button">Resolve</button>
      </div>

      <div class="track">
        <section v-for="sec in pipeline.filter((s) => s.id !== 'conflicts')" :key="sec.id" class="lane" :class="sec.id">
          <button type="button" class="lane-head" :aria-expanded="!wt.collapsed.has(sec.id)" @click="toggleSection(sec.id)">
            <PhCaretRight class="caret" :size="11" weight="bold" /><span>{{ sec.label }}</span><b>{{ sec.files.length }}</b>
          </button>
          <div v-show="!wt.collapsed.has(sec.id)" class="chips">
            <button v-for="f in sec.files" :key="f.path" type="button" class="chip" :title="f.path" @click="wt.selected = f.path">
              <i>{{ f.status }}</i>{{ name(f.path) }}
            </button>
          </div>
        </section>

        <div class="connector"><PhArrowRight :size="12" /> stage</div>

        <section class="lane next">
          <button type="button" class="lane-head" :aria-expanded="!wt.collapsed.has('staged')" @click="toggleSection('staged')">
            <PhCaretRight class="caret" :size="11" weight="bold" /><span>Next commit</span><b>{{ staged.length }}</b>
          </button>
          <div v-show="!wt.collapsed.has('staged')">
            <p class="draft">“{{ wt.message }}”</p>
            <div class="chips">
              <button v-for="f in staged" :key="f.path" type="button" class="chip" @click="wt.selected = f.path"><i>{{ f.status }}</i>{{ name(f.path) }}</button>
            </div>
            <div class="stat"><b class="add">+{{ totals.stagedAdd }}</b> <b class="del">−{{ totals.stagedDel }}</b></div>
          </div>
        </section>
      </div>
    </div>
    <footer class="foot">
      <button type="button" class="btn">Open changes</button>
      <button type="button" class="btn primary" :disabled="!!conflicts.length">Commit</button>
    </footer>
  </aside>

  <!-- CHANGES PAGE -->
  <div v-else class="lanes page">
    <div class="cols">
      <section class="col">
        <header class="col-head"><span>Working</span><b>{{ working.length + conflicts.length }}</b></header>
        <div class="col-list">
          <div v-for="f in [...conflicts, ...working]" :key="f.path" class="card" :class="[f.section, { sel: wt.selected === f.path }]" @click="wt.selected = f.path">
            <span class="card-st">{{ f.status }}</span>
            <span class="card-nm">{{ name(f.path) }}<small>{{ shortDir(f.path) }}</small></span>
            <button v-if="f.section !== 'conflicts'" type="button" class="move" title="Stage" @click.stop="toggleStage(f)"><PhArrowRight :size="12" /></button>
          </div>
        </div>
      </section>
      <section class="col next">
        <header class="col-head"><span>Next commit</span><b>{{ staged.length }}</b></header>
        <form class="composer" @submit.prevent>
          <input v-model="wt.message" placeholder="Subject" />
          <textarea v-model="wt.body" rows="2" placeholder="Why this change?" />
        </form>
        <div class="col-list">
          <div v-for="f in staged" :key="f.path" class="card staged" :class="{ sel: wt.selected === f.path }" @click="wt.selected = f.path">
            <button type="button" class="move" title="Unstage" @click.stop="toggleStage(f)"><PhArrowLeft :size="12" /></button>
            <span class="card-nm">{{ name(f.path) }}<small>{{ shortDir(f.path) }}</small></span>
            <span class="card-st">{{ f.status }}</span>
          </div>
        </div>
        <footer class="col-foot">
          <span><b class="add">+{{ totals.stagedAdd }}</b> <b class="del">−{{ totals.stagedDel }}</b></span>
          <button type="button" class="btn primary" :disabled="!!conflicts.length || !staged.length">Commit {{ staged.length }}</button>
        </footer>
      </section>
    </div>
    <DiffPane class="diffrow" />
  </div>
</template>

<style scoped>
.lanes {
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
.alert {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--conflict) 50%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--conflict) 10%, transparent);
  color: var(--conflict);
  font-size: 12px;
}
.alert button {
  margin-left: auto;
  border: 0;
  background: var(--conflict);
  color: var(--bg);
  border-radius: 5px;
  padding: 3px 8px;
  font-size: 11px;
  cursor: pointer;
}
.track {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lane {
  border: 1px solid var(--border);
  border-left: 3px solid var(--fg-muted);
  border-radius: 8px;
  background: var(--bg);
  padding: 4px 10px 10px;
}
.lane.unstaged {
  border-left-color: color-mix(in srgb, var(--accent-2) 50%, var(--fg-muted));
}
.lane.next {
  border-left-color: var(--add);
  background: color-mix(in srgb, var(--add) 6%, var(--bg));
}
.lane-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 0;
  border: 0;
  background: none;
  color: var(--fg);
  font: 500 12px inherit;
  cursor: pointer;
}
.lane-head b {
  margin-left: auto;
  color: var(--fg-muted);
  font: 11px var(--mono);
}
.caret {
  color: var(--fg-muted);
  transition: transform 120ms;
}
.lane-head[aria-expanded='true'] .caret {
  transform: rotate(90deg);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 3px 8px 3px 4px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-soft);
  color: var(--fg);
  font: 11px var(--mono);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip:hover {
  border-color: var(--accent);
}
.chip i {
  font-style: normal;
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--hover);
  color: var(--fg-muted);
  font-size: 10px;
}
.connector {
  align-self: center;
  color: var(--fg-muted);
  font: 11px var(--mono);
  display: flex;
  align-items: center;
  gap: 4px;
  transform: rotate(0);
}
.draft {
  margin: 0 0 8px;
  color: var(--fg-muted);
  font-style: italic;
  font-size: 12px;
}
.stat {
  margin-top: 8px;
  font: 11px var(--mono);
}
.add {
  color: var(--add);
}
.del {
  color: var(--del);
}
.foot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-soft);
}
.btn {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--fg);
  font: 12px inherit;
  cursor: pointer;
}
.btn.primary {
  border-color: transparent;
  background: var(--add);
  color: var(--bg);
}
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* page */
.page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  padding: 14px;
  height: 290px;
  flex: none;
}
.col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}
.col.next {
  border-color: color-mix(in srgb, var(--add) 40%, var(--border));
}
.col-head {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  font-weight: 500;
  font-size: 12px;
}
.col-head b {
  color: var(--fg-muted);
  font: 11px var(--mono);
}
.col-list {
  flex: 1;
  overflow: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.card {
  display: grid;
  grid-template-columns: 18px 1fr 22px;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
}
.col.next .card {
  grid-template-columns: 22px 1fr 18px;
}
.card:hover {
  background: var(--hover);
}
.card.sel {
  background: var(--sel);
}
.card.conflicts .card-st {
  color: var(--conflict);
}
.card-st {
  color: var(--fg-muted);
  font: 12px var(--mono);
}
.card-nm {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font: 12px var(--mono);
}
.card-nm small {
  margin-left: 8px;
  color: var(--fg-muted);
}
.move {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg);
  color: var(--fg-muted);
  cursor: pointer;
  opacity: 0;
}
.card:hover .move {
  opacity: 1;
}
.move:hover {
  color: var(--add);
  border-color: var(--add);
}
.composer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px dashed var(--border);
}
.composer input,
.composer textarea {
  border: 0;
  background: transparent;
  color: var(--fg);
  font: 13px inherit;
  resize: none;
  outline: none;
}
.composer input {
  font-weight: 500;
}
.composer textarea {
  color: var(--fg-muted);
  font-size: 12px;
}
.col-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-top: 1px solid var(--border);
  font: 11px var(--mono);
}
.diffrow {
  flex: 1;
  border-top: 1px solid var(--border);
}
</style>
