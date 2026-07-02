<script setup lang="ts">
/**
 * Design 4 — state columns. Branches grouped by lifecycle state; after a
 * fetch or merge a branch would visibly migrate columns. Kanban for refs.
 */
import { computed } from 'vue'
import { BRANCHES, stateOf, STATE_LABELS, type Branch, type BranchState } from './branches'

const ORDER: BranchState[] = ['active', 'ahead', 'merged', 'stale', 'remote-only']

const columns = computed(() =>
  ORDER.map((state) => ({
    state,
    label: STATE_LABELS[state],
    branches: BRANCHES.filter((b) => stateOf(b) === state).sort((a, b) => a.ageScore - b.ageScore),
  })).filter((column) => column.branches.length > 0),
)

function tone(state: BranchState): string {
  switch (state) {
    case 'active': return 'var(--accent)'
    case 'ahead': return 'var(--accent-2)'
    case 'merged': return 'color-mix(in srgb, var(--accent) 55%, var(--fg-muted))'
    case 'stale': return 'var(--fg-muted)'
    case 'remote-only': return 'color-mix(in srgb, var(--accent-2) 55%, var(--fg-muted))'
  }
}

function shortName(branch: Branch): string {
  return branch.name
}
</script>

<template>
  <div class="board">
    <section v-for="column in columns" :key="column.state" class="column" :style="{ '--tone': tone(column.state) }">
      <header class="col-head">
        <span class="col-dot" />
        <span class="col-label">{{ column.label }}</span>
        <span class="col-count">{{ column.branches.length }}</span>
      </header>

      <div class="cards">
        <article v-for="branch in column.branches" :key="branch.name" class="card" :class="{ current: branch.current }">
          <p class="card-name">
            {{ shortName(branch) }}
            <span v-if="branch.current" class="chip">HEAD</span>
          </p>
          <p class="card-subject">{{ branch.subject }}</p>
          <div class="card-meta">
            <span v-if="branch.ahead" class="ahead">+{{ branch.ahead }}</span>
            <span v-if="branch.behind" class="behind">−{{ branch.behind }}</span>
            <span v-if="branch.upstream === 'gone'" class="gone">upstream gone</span>
            <span class="age">{{ branch.age }}</span>
          </div>
        </article>
      </div>

      <footer v-if="column.state === 'merged'" class="col-foot">
        <button type="button" class="sweep">Delete all {{ column.branches.length }}</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.board {
  display: flex;
  gap: 12px;
  height: 100%;
  min-height: 0;
  padding: 14px 16px;
  overflow-x: auto;
}

.column {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  min-width: 168px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg) 45%, transparent);
}

.col-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.col-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--tone);
  box-shadow: 0 0 8px color-mix(in srgb, var(--tone) 50%, transparent);
}

.col-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-count {
  margin-left: auto;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 10px;
  color: var(--fg-muted);
}

.cards {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 9px;
}

.card {
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--bg-soft);
  padding: 9px 11px;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.card:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--tone) 55%, var(--border)); }

.card.current { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }

.card-name {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 3px;
  font-size: 11.5px;
  font-weight: 650;
  color: var(--fg);
  word-break: break-all;
}

.chip {
  flex: none;
  font-size: 8.5px;
  font-weight: 700;
  color: var(--bg);
  background: var(--accent);
  border-radius: 999px;
  padding: 1px 6px;
}

.card-subject {
  margin: 0 0 7px;
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--fg-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 9.5px;
}

.ahead { color: var(--accent); }
.behind { color: var(--accent-2); }
.gone { color: var(--accent-2); font-style: italic; }
.age { margin-left: auto; color: var(--fg-muted); }

.col-foot { padding: 8px 9px; border-top: 1px solid var(--border); }

.sweep {
  width: 100%;
  border: 1px dashed color-mix(in srgb, var(--accent-2) 40%, transparent);
  background: transparent;
  color: var(--accent-2);
  font-size: 10.5px;
  font-weight: 600;
  border-radius: 7px;
  padding: 5px;
  cursor: pointer;
}

.sweep:hover { background: color-mix(in srgb, var(--accent-2) 10%, transparent); }
</style>
