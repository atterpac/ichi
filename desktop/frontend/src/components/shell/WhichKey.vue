<script setup lang="ts">
import { computed } from 'vue'
import { NAV_GROUPS } from './nav'
const props = defineProps<{ activeView: string; showCommit: boolean }>()
defineEmits<{ select: [id: string]; close: [] }>()
const views = NAV_GROUPS.flatMap(group => group.items).filter(item => ['graph', 'status', 'branches', 'stashes'].includes(item.id))
const current = computed(() => props.activeView === 'commit' ? 'status' : props.activeView)
</script>

<template>
  <nav class="whichkey" aria-label="Quick navigation">
    <header class="wk-head"><span>Go to</span><kbd>space</kbd></header>
    <div class="wk-views">
      <button v-for="item in views" :key="item.id" class="wk-item" type="button" :aria-current="current === item.id ? 'page' : undefined" @click="$emit('select', item.id)">
        <span>{{ item.label }}</span><kbd>{{ item.key }}</kbd>
      </button>
    </div>
    <div class="wk-extra">
      <button v-if="showCommit" class="wk-item" type="button" @click="$emit('select', 'commit')"><span>Write commit</span><kbd>c</kbd></button>
      <button class="wk-item" type="button" @click="$emit('select', 'finder')"><span>Search…</span><kbd>f</kbd></button>
    </div>
  </nav>
</template>

<style scoped>
.whichkey {
  position: absolute;
  left: 8px;
  bottom: 30px;
  z-index: 80;
  width: min(260px, calc(100vw - 16px));
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-overlay);
  box-shadow: var(--elev-2);
}
.wk-head { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px 10px; color: var(--text-mut); font: var(--fs-xs) var(--font-ui); }
.wk-views { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.wk-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; width: 100%; height: 32px; padding: 0 8px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text-dim); font: var(--fs-sm) var(--font-ui); cursor: pointer; text-align: left; }
.wk-item[aria-current='page'] { background: var(--selected); color: var(--text); }
.wk-item:hover { background: var(--hover); color: var(--text); }
kbd { color: var(--text-mut); font: var(--fs-2xs) var(--font-mono); }
.wk-extra { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--line-faint); }
</style>
