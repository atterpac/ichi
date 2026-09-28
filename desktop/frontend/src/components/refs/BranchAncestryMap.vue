<script setup lang="ts">
import { computed } from 'vue'
import type { Branch, Commit } from '../../bindings/github.com/atterpac/ichi/internal/git'

const props = defineProps<{ commits: Commit[]; branches: Branch[]; selected: Branch | null; loading: boolean; error: string }>()
const emit = defineEmits<{ select: [branch: Branch]; retry: [] }>()

// Compress history into branch relationships. Distances deliberately aren't a
// time/commit scale: only the reference line, forks, and branch tips are drawn.
const layout = computed(() => {
  const byHash = new Map(props.commits.map(c => [c.Hash, c]))
  function tip(branch: Branch) {
    return props.commits.find(c => branch.LastCommit && c.Hash.startsWith(branch.LastCommit))?.Hash
  }
  function ancestors(hash: string | undefined) {
    const distances = new Map<string, number>()
    const queue: [string, number][] = hash ? [[hash, 0]] : []
    for (let i = 0; i < queue.length; i++) {
      const [next, distance] = queue[i]!
      if (distances.has(next)) continue
      distances.set(next, distance)
      for (const parent of byHash.get(next)?.Parents ?? []) queue.push([parent, distance + 1])
    }
    return distances
  }
  const reference = props.branches.find(b => !b.IsRemote && b.Name === 'main')
    ?? props.branches.find(b => b.IsRemote && b.Name === 'origin/main')
    ?? props.branches.find(b => b.IsRemote && b.Name.endsWith('/main'))
    ?? props.branches.find(b => !b.IsRemote && b.Name === 'master')
    ?? props.branches.find(b => b.IsCurrent)
    ?? props.branches.find(b => !b.IsRemote)
    ?? props.branches[0]
  if (!reference) return { rows: [], reference: '' }
  const referenceTip = tip(reference)
  const history = ancestors(referenceTip)
  // Use the lab's five-lane composition. Keep the selected branch in the
  // picture without letting a large repository turn the overview into a graph.
  const selected = props.selected && props.selected !== reference ? props.selected : null
  const candidates = props.branches.filter(b => b !== reference && b !== selected)
    .sort((a, b) => Number(a.IsRemote) - Number(b.IsRemote))
  const others = [...(selected ? [selected] : []), ...candidates].slice(0, 4)
  const ordered = [reference, ...others]
  const colors = ['var(--text-mut)', 'var(--accent)', 'var(--positive-text)', 'var(--accent-text)', 'var(--text-dim)']
  const rows = ordered.map((branch, index) => {
    const hash = tip(branch)
    const branchHistory = ancestors(hash)
    const shared = [...branchHistory.keys()].filter(h => history.has(h))
      .sort((a, b) => (history.get(a)! + branchHistory.get(a)!) - (history.get(b)! + branchHistory.get(b)!))[0]
    const y = [155, 95, 215, 35, 275][index]!
    let relation = ''
    let known = true
    let x = 445
    let forkX = 245
    if (branch === reference) relation = branch.IsCurrent ? 'checked out' : 'reference'
    else if (!shared) { relation = 'relationship outside loaded history'; known = false; x = 345 }
    else if (hash === referenceTip) relation = 'same tip'
    else if (history.has(hash!)) { relation = 'behind'; x = 345; forkX = 145 }
    else if (branchHistory.has(referenceTip!)) { relation = 'ahead'; x = 545 }
    else { relation = 'diverged'; x = 445; forkX = 145 }
    const path = branch === reference ? `M 50 155 H ${x}`
      : !known ? `M 245 ${y} H ${x}`
      : `M ${forkX} 155 C ${forkX + 50} 155, ${forkX + 50} ${y}, ${forkX + 100} ${y} H ${x}`
    const name = branch.Name.length > 39 ? branch.Name.slice(0, 36) + '…' : branch.Name
    return { branch, x, y, relation, known, path, name,
      color: colors[index], labelWidth: Math.min(380, name.length * 8.6 + 30),
      markerX: branch !== reference && known && x > forkX + 100 ? forkX + 100 : null,
      reference: branch === reference }
  })
  return { rows, reference: reference.Name }

})
</script>
<template>
  <section class="branch-map" aria-label="Branch overview">
    <header><span>Branch map</span><span v-if="branches.length > 5">{{ layout.rows.length }} of {{ branches.length }} branches · select a branch to bring it into view</span></header>
    <p v-if="loading">Loading branch overview…</p>
    <p v-else-if="error">{{ error }} <button @click="emit('retry')">Retry</button></p>
    <p v-else-if="!branches.length">No branches yet.</p>
    <div v-else class="branch-map-scroll" tabindex="0" aria-label="Scroll branch map" data-keyboard-pane>
      <svg viewBox="0 0 950 310" preserveAspectRatio="xMinYMid meet" role="group" aria-label="Schematic branch overview; spacing is illustrative">
        <g v-for="row in layout.rows" :key="`path:${row.branch.IsRemote}:${row.branch.Name}`" :style="{ '--branch-color': row.color }" :class="{ active: selected === row.branch, unknown: !row.known }">
          <path :d="row.path" class="map-edge" />
          <circle v-if="row.markerX" :cx="row.markerX" :cy="row.y" r="5" class="map-node" />
        </g>
        <circle v-for="x in [50, 145, 245, 345]" :key="x" :cx="x" cy="155" r="5" class="map-node map-history" />
        <g v-for="row in layout.rows" :key="`${row.branch.IsRemote}:${row.branch.Name}`" :style="{ '--branch-color': row.color }" class="map-branch" :class="{ active: selected === row.branch }">
          <circle :cx="row.x" :cy="row.y" r="5" class="map-node" />
          <g role="button" tabindex="0" :aria-label="`Inspect ${row.branch.Name}`" :aria-pressed="selected === row.branch" class="map-label" @click="emit('select', row.branch)" @keydown.enter.prevent="emit('select', row.branch)" @keydown.space.prevent="emit('select', row.branch)">
            <rect :x="row.x + 18" :y="row.y - 17" :width="row.labelWidth" height="34" rx="6" />
            <text :x="row.x + 32" :y="row.y + 5.5">{{ row.name }}{{ row.branch.IsCurrent ? ' ●' : '' }}</text>
            <title>{{ row.branch.Name }} · {{ row.relation }}</title>
          </g>
        </g>
      </svg>
    </div>
  </section>
</template>
<style scoped>
/* Faint dot grid marks this as a schematic canvas rather than a list. */
.branch-map { min-width: 0; padding: var(--space-6) var(--space-12) var(--space-2); border-bottom: 1px solid var(--line-faint); background: radial-gradient(circle, color-mix(in oklab, var(--text) 7%, transparent) 1px, transparent 1.5px) 0 0 / 16px 16px, var(--surface-panel); }
header { display: flex; justify-content: space-between; gap: var(--space-6); color: var(--text-mut); font: var(--font-label); }
header span:first-child { color: var(--text-dim); }
.branch-map-scroll { overflow: auto; }
svg { display: block; width: 100%; max-width: 1040px; height: 230px; min-width: 680px; }
.map-edge { fill: none; stroke: var(--text-mut); stroke-width: 2; opacity: .45; }
.active .map-edge { stroke: var(--branch-color); opacity: 1; stroke-width: 3; }
.unknown .map-edge { stroke-dasharray: 5 5; }
.map-node { fill: var(--surface-panel); stroke: var(--text-mut); stroke-width: 2; }
.active .map-node { fill: var(--branch-color); stroke: var(--branch-color); }
.map-label { cursor: pointer; outline: none; }
.map-label rect { fill: var(--surface-raised); stroke: var(--line-faint); stroke-width: 1; transition: fill var(--ease-fast); }
.map-label:hover rect { fill: color-mix(in oklab, var(--text) 8%, var(--surface-raised)); }
.map-label text { fill: var(--text-dim); font: 500 16px var(--font-ui); }
.active .map-label rect { fill: color-mix(in oklch, var(--branch-color) 16%, var(--surface-raised)); stroke: color-mix(in oklch, var(--branch-color) 45%, transparent); }
.active .map-label text { fill: var(--head); }
.map-label:focus-visible rect { stroke: var(--accent-text); stroke-width: 2; }
p { padding: var(--space-10) 0; color: var(--text-mut); }
</style>
