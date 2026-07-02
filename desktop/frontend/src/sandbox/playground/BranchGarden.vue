<script setup lang="ts">
/**
 * Design 3 — freshness decay. Branch age maps to saturation/opacity so
 * stale work literally fades toward the background. Merged or abandoned
 * branches sink into a "ready to prune" section that begs to be cleaned.
 */
import { computed, ref } from 'vue'
import { PhTrash, PhBroom } from '@phosphor-icons/vue'
import { BRANCHES, type Branch } from './branches'

const pruned = ref(new Set<string>())

function prunable(branch: Branch): boolean {
  return !branch.current && branch.name !== 'main'
    && (branch.merged || (branch.ageScore >= 0.7 && branch.upstream !== 'tracking'))
}

const living = computed(() =>
  BRANCHES.filter((b) => !prunable(b) && !pruned.value.has(b.name)).sort((a, b) => a.ageScore - b.ageScore),
)
const withered = computed(() =>
  BRANCHES.filter((b) => prunable(b) && !pruned.value.has(b.name)).sort((a, b) => a.ageScore - b.ageScore),
)

function decayStyle(branch: Branch) {
  return {
    opacity: String(1 - branch.ageScore * 0.6),
    filter: `saturate(${1 - branch.ageScore * 0.8})`,
  }
}

function prune(branch: Branch) {
  pruned.value = new Set([...pruned.value, branch.name])
}

function pruneAll() {
  pruned.value = new Set([...pruned.value, ...withered.value.map((b) => b.name)])
}

function reasonFor(branch: Branch): string {
  if (branch.merged) return 'merged into main'
  if (branch.upstream === 'gone') return 'upstream deleted'
  return `no commits in ${branch.age}`
}
</script>

<template>
  <div class="wrap">
    <div class="scroll">
      <div class="rows">
        <div
          v-for="branch in living"
          :key="branch.name"
          class="row"
          :style="decayStyle(branch)"
        >
          <span class="freshness" :style="{ '--fresh': String(1 - branch.ageScore) }" />
          <span class="name">
            {{ branch.name }}
            <span v-if="branch.current" class="chip">HEAD</span>
          </span>
          <span class="subject">{{ branch.subject }}</span>
          <span class="age">{{ branch.age }}</span>
        </div>
      </div>

      <template v-if="withered.length">
        <div class="divider">
          <span class="divider-label">
            <PhBroom :size="13" weight="bold" />
            ready to prune — {{ withered.length }}
          </span>
          <button class="prune-all" type="button" @click="pruneAll">Prune all</button>
        </div>

        <TransitionGroup name="wilt" tag="div" class="rows">
          <div
            v-for="branch in withered"
            :key="branch.name"
            class="row withered"
            :style="decayStyle(branch)"
          >
            <span class="freshness" :style="{ '--fresh': String(1 - branch.ageScore) }" />
            <span class="name">{{ branch.name }}</span>
            <span class="subject reason">{{ reasonFor(branch) }}</span>
            <span class="age">{{ branch.age }}</span>
            <button class="prune" type="button" :aria-label="`Delete ${branch.name}`" @click="prune(branch)">
              <PhTrash :size="13" weight="bold" />
            </button>
          </div>
        </TransitionGroup>
      </template>

      <p v-if="pruned.size" class="pruned-note">{{ pruned.size }} pruned this session 🌱</p>
    </div>
  </div>
</template>

<style scoped>
.wrap { height: 100%; min-height: 0; display: flex; flex-direction: column; }

.scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 14px; }

.rows { display: flex; flex-direction: column; gap: 2px; }

.row {
  display: grid;
  grid-template-columns: 4px minmax(0, 1fr) minmax(0, 1.2fr) 40px auto;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  transition: opacity 0.2s ease, filter 0.2s ease, background 0.15s ease;
}

.row:hover { background: color-mix(in srgb, var(--fg) 4%, transparent); opacity: 1 !important; filter: saturate(1) !important; }

/* left edge: a little life-bar whose height tracks freshness */
.freshness {
  height: calc(6px + 16px * var(--fresh, 0.5));
  border-radius: 2px;
  background: linear-gradient(to top, color-mix(in srgb, var(--accent) 35%, transparent), var(--accent));
}

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
  color: var(--bg);
  background: var(--accent);
  border-radius: 999px;
  padding: 1px 7px;
}

.subject {
  font-size: 11px;
  color: var(--fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.reason { font-style: italic; }

.age {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 10px;
  color: var(--fg-muted);
  text-align: right;
}

.prune {
  display: flex;
  align-items: center;
  border: 1px solid transparent;
  background: transparent;
  color: var(--fg-muted);
  border-radius: 6px;
  padding: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.row:hover .prune { opacity: 1; }

.prune:hover {
  color: var(--accent-2);
  border-color: color-mix(in srgb, var(--accent-2) 35%, transparent);
  background: color-mix(in srgb, var(--accent-2) 10%, transparent);
}

.row:not(.withered) { grid-template-columns: 4px minmax(0, 1fr) minmax(0, 1.2fr) 40px; }

.divider {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 16px 4px 8px;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
}

.divider-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.prune-all {
  border: 1px solid color-mix(in srgb, var(--accent-2) 35%, transparent);
  background: color-mix(in srgb, var(--accent-2) 10%, transparent);
  color: var(--accent-2);
  font-size: 10.5px;
  font-weight: 600;
  border-radius: 999px;
  padding: 3px 12px;
  cursor: pointer;
}

.prune-all:hover { background: color-mix(in srgb, var(--accent-2) 18%, transparent); }

.pruned-note {
  margin: 14px 10px 4px;
  font-size: 11px;
  color: var(--fg-muted);
}

.wilt-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.wilt-leave-to { opacity: 0; transform: translateX(14px); }
</style>
