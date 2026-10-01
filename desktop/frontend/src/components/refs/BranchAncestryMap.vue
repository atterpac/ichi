<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, shallowRef, watch } from 'vue'
import type { Branch } from '../../bindings/github.com/atterpac/ichi/internal/git'
import { GraphService, RefService, type GraphLayout } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import GraphSvg from '../graph/GraphSvg.vue'
import { useVirtualWindow } from '../../composables/useVirtualWindow'

const props = defineProps<{ branches: Branch[]; selected: Branch | null }>()
const emit = defineEmits<{ open: [hash: string] }>()
const reference = computed(() => props.branches.find(b => !b.IsRemote && b.Name === 'main')
  ?? props.branches.find(b => b.Name === 'origin/main')
  ?? props.branches.find(b => !b.IsRemote && b.Name === 'master')
  ?? props.branches.find(b => b.Name.endsWith('/main') || b.Name.endsWith('/master')))
const layout = shallowRef<GraphLayout | null>(null)
const base = ref('')
const comparisonFailed = ref(false)
const loading = ref(false)
const error = ref('')
const limit = ref(80)
const revision = ref(0)
const rowHeight = 44
const scroller = ref<HTMLElement | null>(null)
const cursor = ref(0)
let loadedBranch = ''
let disposed = false
onUnmounted(() => { disposed = true })
watch(() => props.selected?.Name, () => { limit.value = 80 }, { flush: 'sync' })
watch([() => props.selected, reference, limit, revision], async (_, __, onCleanup) => {
  let cancelled = false
  onCleanup(() => { cancelled = true })
  const sameBranch = loadedBranch === props.selected?.Name
  if (!sameBranch) {
    layout.value = null
    base.value = ''
    cursor.value = 0
  }
  error.value = ''
  comparisonFailed.value = false
  const selected = props.selected
  if (!selected) { loading.value = false; return }
  loading.value = true
  try {
    const compare = reference.value && reference.value.Name !== selected.Name
    const [graph, divergence] = await Promise.all([
      GraphService.LoadBranchGraph(selected.Name, limit.value),
      compare ? RefService.BranchDivergence(reference.value!.Name, selected.Name).catch(() => {
        if (!cancelled) comparisonFailed.value = true
        return null
      }) : null,
    ])
    if (cancelled || disposed) return
    loadedBranch = selected.Name
    layout.value = graph
    base.value = divergence?.Base ?? ''
  } catch (err) { if (!cancelled) error.value = String(err) }
  finally { if (!cancelled) loading.value = false }
}, { immediate: true })
const rows = computed(() => layout.value?.Rows ?? [])
const { window: virtualWindow, scrollToRow } = useVirtualWindow({
  container: scroller, count: () => rows.value.length, rowHeight, overscan: 8,
})
const visibleRows = computed(() => rows.value.slice(virtualWindow.value.start, virtualWindow.value.end))
async function focusRow(index: number) {
  cursor.value = Math.max(0, Math.min(index, rows.value.length - 1))
  const target = cursor.value
  scrollToRow(target)
  await nextTick()
  if (!disposed && target === cursor.value) {
    scroller.value?.querySelector<HTMLElement>(`[data-branch-index="${target}"]`)?.focus({ preventScroll: true })
  }
}
function onHistoryKey(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
  const page = Math.max(1, Math.floor((scroller.value?.clientHeight || 330) / rowHeight))
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.value.length - 1
    : ['j', 'ArrowDown'].includes(event.key) ? cursor.value + 1
    : ['k', 'ArrowUp'].includes(event.key) ? cursor.value - 1
    : event.key === 'PageDown' ? cursor.value + page : event.key === 'PageUp' ? cursor.value - page : null
  if (next !== null) { event.preventDefault(); void focusRow(next) }
  else if (event.key === 'Enter' && event.target === scroller.value) {
    const commit = rows.value[cursor.value]?.Commit
    if (commit) { event.preventDefault(); emit('open', commit.Hash) }
  } else if (event.key === 'Tab' && !event.shiftKey && event.target === scroller.value) {
    event.preventDefault(); void focusRow(cursor.value)
  }
}
watch(virtualWindow, range => {
  const focused = document.activeElement as HTMLElement | null
  if (!focused?.matches('.branch-commit-row') || !scroller.value?.contains(focused)) return
  const index = Number(focused.dataset.branchIndex)
  if (index < range.start || index >= range.end) scroller.value.focus({ preventScroll: true })
})
const isBase = (hash: string) => !!base.value && hash.startsWith(base.value)
const baseVisible = computed(() => rows.value.some(row => row.Commit && isBase(row.Commit.Hash)))
const continues = computed(() => {
  const hashes = new Set(rows.value.map(row => row.Commit?.Hash))
  return rows.value.some(row => row.Commit?.Parents.some(parent => !hashes.has(parent)))
})
</script>
<template>
  <section class="branch-map" aria-label="Selected branch graph">
    <header><div><span class="eyebrow">Branch history</span><strong>{{ selected?.Name || 'Select a branch' }}</strong></div><span>Newest first · {{ rows.length }} commits</span></header>
    <p v-if="!selected">Select a branch to explore its history.</p>
    <p v-else-if="loading && !rows.length" role="status">Loading branch history…</p>
    <p v-else-if="error && !rows.length" role="alert">{{ error }} <button @click="revision++">Retry</button></p>
    <template v-else-if="rows.length">
      <div ref="scroller" class="branch-history-scroll" tabindex="0" @keydown="onHistoryKey" :aria-busy="loading" aria-label="Branch commit history" data-keyboard-pane>
        <div class="branch-history-content" :style="{ height: `${virtualWindow.totalHeight}px` }">
          <GraphSvg :segments="layout?.Segments" :rows="visibleRows" :start-index="virtualWindow.start" :total-rows="rows.length" :lane-count="layout?.LaneCount ?? 1" :row-height="rowHeight" />
          <div class="branch-commit-list">
            <button v-for="(row, index) in visibleRows" :key="row.Commit?.Hash" class="branch-commit-row" :data-branch-index="virtualWindow.start + index" :tabindex="cursor === virtualWindow.start + index ? 0 : -1" @focus="cursor = virtualWindow.start + index" :class="{ 'merge-base': row.Commit && isBase(row.Commit.Hash) }" :style="{ height: `${rowHeight}px`, top: `${(virtualWindow.start + index) * rowHeight}px` }" @click="row.Commit && emit('open', row.Commit.Hash)">
              <span class="branch-commit-subject">{{ row.Commit?.Message }}</span>
              <span v-if="virtualWindow.start + index === 0" class="branch-commit-badge">tip</span>
              <span v-if="row.Commit && isBase(row.Commit.Hash)" class="branch-commit-badge">base with {{ reference?.Name }}</span>
              <span class="branch-commit-author">{{ row.Commit?.Author }}</span>
              <code>{{ row.Commit?.ShortHash }}</code>
            </button>
          </div>
        </div>
      </div>
      <p v-if="error" role="alert">{{ error }} <button @click="revision++">Retry</button></p>
      <footer>
        <span v-if="comparisonFailed">Connection to {{ reference?.Name }} unavailable.</span>
        <span v-else-if="base && !baseVisible">Common ancestor with {{ reference?.Name }} is outside these {{ rows.length }} commits.</span>
        <span v-else-if="reference && selected?.Name !== reference.Name && !base">No common ancestor with {{ reference.Name }}.</span>
        <span v-else>Only ancestors of {{ selected?.Name }} · select a commit to open in Graph</span>
        <button v-if="continues && limit < 500" :disabled="loading" @click="limit = Math.min(500, limit + 80)">{{ loading ? 'Loading history…' : 'Load more history' }}</button>
        <span v-else-if="continues">Older history continues in Graph.</span>
      </footer>
    </template>
    <p v-else>No commits on this branch.</p>
  </section>
</template>
<style scoped>
.branch-map { min-width: 0; border-bottom: 1px solid var(--line-faint); background: var(--surface-panel); }
header { display: flex; justify-content: space-between; align-items: center; gap: var(--space-6); padding: var(--space-8) var(--space-12); color: var(--text-mut); font: var(--font-label); }
header > div { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
header strong { color: var(--head); font: 500 var(--fs-md) var(--font-ui); overflow-wrap: anywhere; }
.eyebrow { color: var(--text-mut); }
.branch-history-scroll { max-height: 330px; overflow: auto; border-top: 1px solid var(--line-faint); }
.branch-history-content { display: flex; align-items: flex-start; min-width: 100%; }
.branch-history-content :deep(.graph-svg) { position: relative; inset: auto; flex-shrink: 0; z-index: auto; }
.branch-commit-list { position: relative; flex: 1; min-width: 560px; height: 100%; }
.branch-commit-row { position: absolute; display: flex; align-items: center; gap: var(--space-4); width: 100%; padding: 0 var(--space-8) 0 var(--space-3); border: 0; border-bottom: 1px solid var(--line-faint); background: transparent; text-align: left; color: var(--text); font: var(--fs-sm) var(--font-ui); cursor: pointer; }
.branch-commit-row:hover, .branch-commit-row:focus-visible { background: var(--hover); }
.branch-commit-subject { flex: 1; min-width: 180px; max-width: 520px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.branch-commit-author, code { color: var(--text-mut); font-size: var(--fs-xs); }
.branch-commit-author { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.branch-commit-badge { flex-shrink: 0; padding: 2px 6px; border-radius: var(--radius-pill); background: var(--accent-soft); color: var(--accent-text); font-size: var(--fs-xs); }
.merge-base { background: color-mix(in oklab, var(--accent) 6%, transparent); }
footer { display: flex; justify-content: space-between; align-items: center; gap: var(--space-6); padding: var(--space-6) var(--space-12); color: var(--text-mut); font: var(--font-label); }
footer button { flex-shrink: 0; }
p { padding: var(--space-8) var(--space-12); color: var(--text-mut); }
</style>
