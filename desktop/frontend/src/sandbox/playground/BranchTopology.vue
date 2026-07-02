<script setup lang="ts">
/**
 * Design 2 — topology skeleton. A subway map, not a commit graph: main is
 * the trunk, each branch is one row with a fork node, an arm whose length
 * scales with commits ahead, and a tip glyph (diamond = merged, big dot =
 * HEAD). Rendered by the same canvas engine as the real graph.
 */
import { computed, ref } from 'vue'
import PreviewGraph from './PreviewGraph.vue'
import { BRANCHES, buildTopology, DEFAULT_GRAPH } from './branches'

const ROW_H = 34
const topo = computed(() => buildTopology(BRANCHES))
const selected = ref<string>(BRANCHES.find((b) => b.current)?.name ?? 'main')
</script>

<template>
  <div class="wrap">
    <div class="map">
      <div class="lanes">
        <PreviewGraph :rows="topo.rows" :cols="topo.cols" :row-height="ROW_H" :graph="DEFAULT_GRAPH" surface="--bg-soft" />
        <div class="labels">
          <button
            v-for="{ branch } in topo.labels"
            :key="branch.name"
            type="button"
            class="label"
            :class="{ selected: selected === branch.name, merged: branch.merged, trunk: branch.name === 'main' }"
            :style="{ height: `${ROW_H}px` }"
            @click="selected = branch.name"
          >
            <span class="name">
              {{ branch.name }}
              <span v-if="branch.current" class="chip">HEAD</span>
            </span>
            <span class="meta">
              <span v-if="branch.merged" class="merged-note">merged</span>
              <template v-else-if="branch.name !== 'main'">
                <span v-if="branch.ahead" class="ahead">+{{ branch.ahead }}</span>
                <span v-if="branch.behind" class="behind">−{{ branch.behind }}</span>
              </template>
              <span class="age">{{ branch.age }}</span>
            </span>
          </button>
        </div>
      </div>
    </div>

    <footer class="legend">
      <span><i class="dot" /> branch tip</span>
      <span><i class="dot big" /> HEAD</span>
      <span><i class="diamond" /> merged</span>
      <span class="arm-note">arm length ∝ commits ahead of fork</span>
    </footer>
  </div>
</template>

<style scoped>
.wrap { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.map { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 18px 8px; }

.lanes { display: flex; }

.labels { flex: 1; min-width: 0; margin-left: 14px; }

.label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.label:hover { background: color-mix(in srgb, var(--fg) 4%, transparent); }

.label.selected { background: color-mix(in srgb, var(--accent) 10%, transparent); }

.label.merged .name { opacity: 0.55; }

.label.trunk .name { font-weight: 800; }

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
  text-overflow: ellipsis;
}

.chip {
  flex: none;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--bg);
  background: var(--accent);
  border-radius: 999px;
  padding: 1px 7px;
}

.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 10px;
}

.ahead { color: var(--accent); }
.behind { color: var(--accent-2); }
.merged-note { color: var(--fg-muted); font-style: italic; }
.age { color: var(--fg-muted); width: 30px; text-align: right; }

.legend {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 9px 18px;
  border-top: 1px solid var(--border);
  font-size: 10.5px;
  color: var(--fg-muted);
}

.legend span { display: inline-flex; align-items: center; gap: 6px; }

.legend i { display: inline-block; flex: none; }

.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
.dot.big { width: 11px; height: 11px; box-shadow: inset 0 0 0 2.5px var(--accent), inset 0 0 0 5px var(--bg-soft); }
.diamond {
  width: 8px;
  height: 8px;
  background: var(--accent-2);
  transform: rotate(45deg) scale(0.9);
}

.arm-note { margin-left: auto; font-style: italic; }
</style>
