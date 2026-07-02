<script setup lang="ts">
/**
 * Design 1 — divergence dumbbells. Every branch is one dense row; the
 * centered meter shows behind-dots left and ahead-dots right of a hub, so
 * "what needs rebase / what's ready to merge" reads at a glance. Sortable.
 */
import { computed, ref } from 'vue'
import { BRANCHES, type Branch } from './branches'

const MAX_DOTS = 6
const sort = ref<'drift' | 'age' | 'name'>('drift')
const selected = ref<string>(BRANCHES.find((b) => b.current)?.name ?? '')

const sorted = computed(() => {
  const list = [...BRANCHES]
  if (sort.value === 'drift') list.sort((a, b) => b.ahead + b.behind - (a.ahead + a.behind))
  else if (sort.value === 'age') list.sort((a, b) => a.ageScore - b.ageScore)
  else list.sort((a, b) => a.name.localeCompare(b.name))
  return list
})

function dots(n: number): number {
  return Math.min(n, MAX_DOTS)
}

function upstreamChip(branch: Branch): { text: string; tone: 'ok' | 'warn' | 'dim' } | null {
  switch (branch.upstream) {
    case 'gone': return { text: 'upstream gone', tone: 'warn' }
    case 'none': return { text: 'no upstream', tone: 'dim' }
    case 'remote-only': return { text: 'origin only', tone: 'dim' }
    default: return null
  }
}
</script>

<template>
  <div class="wrap">
    <div class="toolbar">
      <span class="hint">behind ← · → ahead of <code>origin/main</code></span>
      <div class="seg">
        <button
          v-for="mode in (['drift', 'age', 'name'] as const)" :key="mode" type="button"
          :class="{ active: sort === mode }" @click="sort = mode"
        >{{ mode }}</button>
      </div>
    </div>

    <div class="rows">
      <button
        v-for="branch in sorted"
        :key="branch.name"
        type="button"
        class="row"
        :class="{ selected: selected === branch.name, merged: branch.merged }"
        @click="selected = branch.name"
      >
        <span class="name">
          <span class="glyph">⎇</span>
          {{ branch.name }}
          <span v-if="branch.current" class="chip head">HEAD</span>
          <span v-if="branch.merged" class="chip dim">merged</span>
          <span v-if="upstreamChip(branch)" class="chip" :class="upstreamChip(branch)!.tone">
            {{ upstreamChip(branch)!.text }}
          </span>
        </span>

        <span class="bell">
          <span class="count behind-count">{{ branch.behind || '' }}</span>
          <span class="side behind">
            <span v-if="branch.behind > MAX_DOTS" class="overflow">+</span>
            <i v-for="d in dots(branch.behind)" :key="d" />
          </span>
          <span class="hub" />
          <span class="side ahead">
            <i v-for="d in dots(branch.ahead)" :key="d" />
            <span v-if="branch.ahead > MAX_DOTS" class="overflow">+</span>
          </span>
          <span class="count ahead-count">{{ branch.ahead || '' }}</span>
        </span>

        <span class="age">{{ branch.age }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.wrap { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--border);
}

.hint { font-size: 11px; color: var(--fg-muted); }
.hint code {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 10px;
  color: var(--accent-2);
}

.seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
}

.seg button {
  border: 0;
  background: transparent;
  color: var(--fg-muted);
  font-size: 10.5px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 6px;
  cursor: pointer;
  text-transform: capitalize;
}

.seg button.active { color: var(--bg); background: var(--accent); }

.rows { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 8px; }

.row {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(240px, 1fr) 44px;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.row:hover { background: color-mix(in srgb, var(--fg) 4%, transparent); }

.row.selected {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
}

.row.merged .name { opacity: 0.6; }

.name {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--fg);
  white-space: nowrap;
  overflow: hidden;
}

.glyph { color: var(--fg-muted); font-weight: 400; }

.chip {
  flex: none;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  border-radius: 999px;
  padding: 1px 7px;
  text-transform: uppercase;
}

.chip.head { color: var(--bg); background: var(--accent); }
.chip.warn {
  color: var(--accent-2);
  background: color-mix(in srgb, var(--accent-2) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-2) 30%, transparent);
}
.chip.dim {
  color: var(--fg-muted);
  border: 1px solid var(--border);
}

/* ---- the dumbbell ---- */
.bell { display: flex; align-items: center; gap: 6px; }

.count {
  width: 22px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 10px;
}

.behind-count { text-align: right; color: var(--accent-2); }
.ahead-count { text-align: left; color: var(--accent); }

.side { display: flex; align-items: center; gap: 3px; flex: 1; }
.side.behind { justify-content: flex-end; }

.side i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex: none;
}

.side.behind i { background: color-mix(in srgb, var(--accent-2) 75%, transparent); }
.side.ahead i { background: var(--accent); }

.overflow { font-size: 9px; color: var(--fg-muted); }

.hub {
  flex: none;
  width: 1px;
  height: 14px;
  background: var(--border);
}

.age {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 10px;
  color: var(--fg-muted);
  text-align: right;
}
</style>
