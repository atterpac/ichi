<script setup lang="ts">
/**
 * PLAYGROUND — branch page design exploration.
 * Six ways to display branches, switched via the floating bar's Design pill:
 *   1 Dumbbells   dense rows with a centered behind/ahead divergence meter
 *   2 Topology    subway-map skeleton: trunk + fork arms, canvas-rendered
 *   3 Garden      freshness decay — stale branches fade; prune section
 *   4 Columns     lifecycle kanban: active / in flight / merged / stale / remote
 *   5 Detail      master-detail with a commits-since-fork mini graph strip
 *   6 Trees       prefix folders (feature/, fix/, spike/…) with aggregates
 */
import { computed, onMounted, onUnmounted } from 'vue'
import { clearControls, controlValue, registerControl } from '../store'
import { BRANCHES } from './branches'
import BranchDumbbells from './BranchDumbbells.vue'
import BranchTopology from './BranchTopology.vue'
import BranchGarden from './BranchGarden.vue'
import BranchColumns from './BranchColumns.vue'
import BranchDetail from './BranchDetail.vue'
import BranchTrees from './BranchTrees.vue'

const DESIGNS = [
  { id: '1', label: 'Dumbbells', blurb: 'divergence meters, sortable', cmp: BranchDumbbells },
  { id: '2', label: 'Topology', blurb: 'subway-map skeleton', cmp: BranchTopology },
  { id: '3', label: 'Garden', blurb: 'freshness decay + prune', cmp: BranchGarden },
  { id: '4', label: 'Columns', blurb: 'lifecycle kanban', cmp: BranchColumns },
  { id: '5', label: 'Detail', blurb: 'list + live fork strip', cmp: BranchDetail },
  { id: '6', label: 'Trees', blurb: 'prefix folders', cmp: BranchTrees },
]

onMounted(() => {
  registerControl({
    id: 'design', kind: 'select', label: 'Design',
    options: DESIGNS.map((design) => design.id), value: '1',
  })
})
onUnmounted(clearControls)

const designId = computed(() => controlValue<string>('design') ?? '1')
const current = computed(() => DESIGNS.find((design) => design.id === designId.value) ?? DESIGNS[0]!)
const localCount = computed(() => BRANCHES.filter((b) => b.upstream !== 'remote-only').length)
const remoteCount = computed(() => BRANCHES.length - localCount.value)
</script>

<template>
  <div class="frame">
    <div class="caption">
      <span class="n">{{ current.id }}</span>
      <span class="t">{{ current.label }}</span>
      <span class="sep">·</span>
      <span class="o">{{ current.blurb }}</span>
    </div>

    <div class="window">
      <div class="bar">
        <span class="title">⎇ Branches</span>
        <span class="dim">{{ localCount }} local · {{ remoteCount }} remote</span>
        <span class="fetch">origin fetched 2m ago</span>
      </div>
      <div class="view">
        <component :is="current.cmp" :key="current.id" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.frame { display: flex; flex-direction: column; gap: 10px; }

.caption { display: flex; align-items: center; gap: 10px; padding-left: 4px; }

.caption .n {
  width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center;
  justify-content: center; font-size: 0.78em; font-weight: 800;
  background: var(--accent); color: var(--bg);
}

.caption .t { color: var(--fg); font-size: 0.9em; font-weight: 600; letter-spacing: 0.3px; }
.caption .sep { color: var(--fg-muted); }
.caption .o { color: var(--fg-muted); font-size: 0.9em; }

.window {
  display: flex;
  flex-direction: column;
  width: min(1080px, 94vw);
  height: min(700px, 84vh);
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  color: var(--fg);
  box-shadow: 0 18px 60px color-mix(in srgb, var(--accent) 8%, transparent);
}

.bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 18px;
  border-bottom: 1px solid var(--border);
  flex: none;
}

.title { font-weight: 700; font-size: 0.9em; }
.dim { color: var(--fg-muted); font-size: 0.82em; }

.fetch {
  margin-left: auto;
  font-size: 0.75em;
  color: var(--fg-muted);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 10px;
}

.view { flex: 1; min-height: 0; }
</style>
