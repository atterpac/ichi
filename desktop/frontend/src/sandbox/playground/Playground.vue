<script setup lang="ts">
defineOptions({ name: 'WorkingTreePlayground' })
/**
 * PLAYGROUND - working-tree flow: graph inspector (working node selected) and
 * the Changes page, in four design directions sharing one sample store.
 */
import { computed, onMounted, onUnmounted, watchEffect } from 'vue'
import { clearControls, controlValue, registerControl } from '../store'
import { GRAPH_ROWS, totals, wt } from './worktree'
import DesignLedger from './DesignLedger.vue'
import DesignLanes from './DesignLanes.vue'
import DesignHeat from './DesignHeat.vue'
import DesignComposer from './DesignComposer.vue'

const designs = [
  {
    id: 'Ledger',
    blurb: 'dense sections, 3-pane changes page — closest to today, tightened',
    comp: DesignLedger,
  },
  { id: 'Lanes', blurb: 'staging as a pipeline: working → next commit', comp: DesignLanes },
  { id: 'Heat', blurb: 'directory tree weighted by churn, diff minimap', comp: DesignHeat },
  {
    id: 'Composer',
    blurb: 'the next commit is the hero; files are a checklist',
    comp: DesignComposer,
  },
]

onMounted(() => {
  registerControl({
    id: 'design',
    kind: 'select',
    label: 'Design',
    options: designs.map((d) => d.id),
    value: 'Ledger',
  })
  registerControl({
    id: 'screen',
    kind: 'select',
    label: 'Screen',
    options: ['flow', 'inspector', 'changes'],
    value: 'flow',
  })
  registerControl({ id: 'conflicts', kind: 'toggle', label: 'Conflicts', value: true })
})
onUnmounted(clearControls)

const design = computed(
  () => designs.find((d) => d.id === (controlValue<string>('design') ?? 'Ledger')) ?? designs[0]!,
)
const screen = computed(() => controlValue<string>('screen') ?? 'flow')
watchEffect(() => {
  wt.showConflicts = controlValue<boolean>('conflicts') ?? true
})
</script>

<template>
  <div class="pg">
    <header class="pg-head">
      <h1>
        Working tree · <span>{{ design.id }}</span>
      </h1>
      <p>{{ design.blurb }}</p>
      <a class="refined-link" href="/working-tree-heatmap.html" target="_blank" rel="noopener"
        >Refined heatmap preview ↗</a
      >
    </header>

    <section v-if="screen !== 'changes'" class="frame">
      <div class="frame-label">Graph — working tree selected</div>
      <div class="frame-body graph-frame">
        <div class="faux-graph" aria-hidden="true">
          <div v-for="(row, i) in GRAPH_ROWS" :key="i" class="g-row" :class="{ sel: row.working }">
            <span class="g-rail">
              <span
                class="g-dot"
                :class="{ hollow: row.working }"
                :style="{ marginLeft: `${row.lane * 14}px` }"
              />
            </span>
            <span class="g-subject">{{ row.subject }}</span>
            <span class="g-meta">{{ row.working ? `${totals.files} files` : row.hash }}</span>
          </div>
        </div>
        <component :is="design.comp" screen="inspector" class="inspector-slot" />
      </div>
    </section>

    <div v-if="screen === 'flow'" class="flow-arrow">↓ Review changes</div>

    <section v-if="screen !== 'inspector'" class="frame">
      <div class="frame-label">Changes page</div>
      <div class="frame-body changes-frame">
        <component :is="design.comp" screen="changes" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.pg {
  /* Semantic tokens derived from the theme so every theme stays coherent. */
  --add: var(--accent-2);
  --del: color-mix(in srgb, var(--fg) 55%, var(--bg));
  --conflict: var(--accent);
  --surface: color-mix(in srgb, var(--bg-soft) 70%, var(--bg));
  --hover: color-mix(in srgb, var(--fg) 6%, transparent);
  --sel: color-mix(in srgb, var(--accent) 16%, transparent);
  --mono: ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, monospace;
  position: absolute;
  inset: 0;
  overflow: auto;
  padding: 32px 40px 120px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.refined-link {
  display: inline-block;
  margin-top: 8px;
  color: var(--accent);
  font-size: 12px;
}
.pg-head h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
}
.pg-head h1 span {
  color: var(--accent);
}
.pg-head p {
  margin: 4px 0 0;
  color: var(--fg-muted);
  font-size: 13px;
}
.frame {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  overflow: hidden;
  box-shadow: 0 20px 60px color-mix(in srgb, var(--bg) 60%, transparent);
}
.frame-label {
  padding: 7px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-soft);
  color: var(--fg-muted);
  font: 11px var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}
.frame-body {
  height: 560px;
  display: flex;
  min-height: 0;
}
.graph-frame .faux-graph {
  flex: 1;
  min-width: 0;
  padding: 8px 0;
  opacity: 0.75;
}
.inspector-slot {
  width: 380px;
  flex: none;
  border-left: 1px solid var(--border);
}
.g-row {
  display: grid;
  grid-template-columns: 56px 1fr auto;
  align-items: center;
  height: 32px;
  padding: 0 16px;
  font-size: 13px;
}
.g-row.sel {
  background: var(--sel);
  box-shadow: inset 2px 0 var(--accent);
}
.g-dot {
  display: block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
}
.g-dot.hollow {
  background: transparent;
  border: 2px dashed var(--accent);
  width: 11px;
  height: 11px;
}
.g-subject {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.g-row.sel .g-subject {
  font-style: italic;
}
.g-meta {
  color: var(--fg-muted);
  font: 11px var(--mono);
}
.flow-arrow {
  align-self: flex-end;
  margin-right: 160px;
  color: var(--fg-muted);
  font: 12px var(--mono);
}
.changes-frame > * {
  flex: 1;
  min-width: 0;
}
</style>
