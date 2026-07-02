<script setup lang="ts">
/**
 * Design 5 — master-detail with a live strip. Compact list on the left;
 * the selected branch gets a commits-since-fork mini graph (real canvas
 * renderer), a meta grid, and the full action row.
 */
import { computed, ref } from 'vue'
import {
  PhArrowsClockwise,
  PhCheck,
  PhGitMerge,
  PhPencilSimple,
  PhTrash,
} from '@phosphor-icons/vue'
import PreviewGraph from './PreviewGraph.vue'
import { BRANCHES, buildDetail, DEFAULT_GRAPH, type Branch } from './branches'

const ROW_H = 30
const selectedName = ref<string>(BRANCHES.find((b) => b.current)?.name ?? BRANCHES[0]!.name)

const sorted = computed(() => [...BRANCHES].sort((a, b) => a.ageScore - b.ageScore))
const selected = computed<Branch>(() => BRANCHES.find((b) => b.name === selectedName.value) ?? BRANCHES[0]!)
const detail = computed(() => buildDetail(selected.value))

const upstreamText = computed(() => {
  switch (selected.value.upstream) {
    case 'tracking': return `origin/${selected.value.name}`
    case 'gone': return 'gone (deleted on origin)'
    case 'none': return 'not set'
    case 'remote-only': return 'origin only — no local ref'
  }
})
</script>

<template>
  <div class="split">
    <div class="list">
      <button
        v-for="branch in sorted"
        :key="branch.name"
        type="button"
        class="item"
        :class="{ selected: branch.name === selectedName, merged: branch.merged }"
        @click="selectedName = branch.name"
      >
        <span class="item-name">
          {{ branch.name }}
          <span v-if="branch.current" class="chip">HEAD</span>
        </span>
        <span class="item-meta">
          <span v-if="branch.ahead" class="ahead">+{{ branch.ahead }}</span>
          <span v-if="branch.behind" class="behind">−{{ branch.behind }}</span>
          <span class="age">{{ branch.age }}</span>
        </span>
      </button>
    </div>

    <div class="detail">
      <header class="d-head">
        <h2>{{ selected.name }}</h2>
        <div class="d-chips">
          <span v-if="selected.current" class="chip">HEAD</span>
          <span v-if="selected.merged" class="tag dim">merged</span>
          <span v-if="selected.upstream === 'gone'" class="tag warn">upstream gone</span>
        </div>
      </header>

      <div class="strip">
        <div class="strip-inner">
          <PreviewGraph
            :rows="detail.rows" :cols="4" :row-height="ROW_H"
            :graph="DEFAULT_GRAPH" surface="--bg"
          />
          <div class="strip-labels">
            <div
              v-for="(label, i) in detail.labels" :key="i"
              class="sl" :class="`sl-${label.kind}`" :style="{ height: `${ROW_H}px` }"
            >
              <span class="sl-msg">{{ label.msg }}</span>
              <span v-if="label.sha" class="sl-sha">{{ label.sha }}</span>
            </div>
          </div>
        </div>
      </div>

      <dl class="meta">
        <div><dt>Tip</dt><dd class="mono">{{ selected.tip }}</dd></div>
        <div><dt>Author</dt><dd>{{ selected.author }}</dd></div>
        <div><dt>Upstream</dt><dd>{{ upstreamText }}</dd></div>
        <div><dt>Last commit</dt><dd>{{ selected.age }} ago</dd></div>
        <div><dt>Ahead / behind</dt><dd class="mono">+{{ selected.ahead }} / −{{ selected.behind }}</dd></div>
        <div><dt>State</dt><dd>{{ selected.merged ? 'merged into main' : 'in flight' }}</dd></div>
      </dl>

      <div class="actions">
        <button class="act primary" type="button" :disabled="selected.current">
          <PhCheck :size="13" weight="bold" /> Checkout
        </button>
        <button class="act" type="button"><PhPencilSimple :size="13" weight="bold" /> Rename</button>
        <button class="act" type="button"><PhArrowsClockwise :size="13" weight="bold" /> Rebase onto main</button>
        <button class="act" type="button"><PhGitMerge :size="13" weight="bold" /> Merge into main</button>
        <button class="act danger" type="button" :disabled="selected.current">
          <PhTrash :size="13" weight="bold" /> Delete
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.split {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

/* ---- list ---- */
.list {
  min-height: 0;
  overflow-y: auto;
  border-right: 1px solid var(--border);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 9px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.item:hover { background: color-mix(in srgb, var(--fg) 4%, transparent); }
.item.selected { background: color-mix(in srgb, var(--accent) 12%, transparent); }
.item.merged .item-name { opacity: 0.55; }

.item-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--fg);
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  display: flex;
  gap: 7px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 9.5px;
}

.ahead { color: var(--accent); }
.behind { color: var(--accent-2); }
.age { margin-left: auto; color: var(--fg-muted); }

.chip {
  flex: none;
  font-size: 8.5px;
  font-weight: 700;
  color: var(--bg);
  background: var(--accent);
  border-radius: 999px;
  padding: 1px 6px;
}

/* ---- detail ---- */
.detail {
  min-height: 0;
  overflow-y: auto;
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.d-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

.d-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--fg);
  word-break: break-all;
}

.d-chips { display: flex; gap: 6px; }

.tag {
  font-size: 9.5px;
  font-weight: 600;
  border-radius: 999px;
  padding: 2px 9px;
}

.tag.dim { color: var(--fg-muted); border: 1px solid var(--border); }
.tag.warn {
  color: var(--accent-2);
  border: 1px solid color-mix(in srgb, var(--accent-2) 35%, transparent);
  background: color-mix(in srgb, var(--accent-2) 10%, transparent);
}

.strip {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  padding: 10px 14px;
}

.strip-inner { display: flex; }

.strip-labels { flex: 1; min-width: 0; margin-left: 12px; }

.sl {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  font-size: 11px;
}

.sl-msg {
  color: var(--fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sl-tip .sl-msg { color: var(--fg); font-weight: 600; }
.sl-fork .sl-msg, .sl-base .sl-msg { font-style: italic; font-size: 10.5px; }

.sl-sha {
  flex: none;
  margin-left: auto;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 10px;
  color: var(--accent-2);
}

.meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 22px;
  margin: 0;
}

.meta > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 2px;
  border-bottom: 1px solid var(--border);
}

.meta dt { font-size: 10.5px; color: var(--fg-muted); }
.meta dd { margin: 0; font-size: 11px; color: var(--fg); text-align: right; }
.meta dd.mono { font-family: ui-monospace, 'SF Mono', Menlo, monospace; color: var(--accent-2); }

.actions { display: flex; flex-wrap: wrap; gap: 7px; }

.act {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 55%, transparent);
  color: var(--fg);
  font-size: 11px;
  font-weight: 600;
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.act:hover:not(:disabled) { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }
.act:disabled { opacity: 0.4; cursor: default; }

.act.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--bg);
}

.act.danger { color: var(--accent-2); }
.act.danger:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent-2) 50%, var(--border));
  background: color-mix(in srgb, var(--accent-2) 8%, transparent);
}
</style>
