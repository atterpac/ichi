<script setup lang="ts">
import { NAV_GROUPS } from './nav'

defineEmits<{ (e: 'select', id: string): void; (e: 'close'): void }>()
</script>

<template>
  <div class="whichkey" @click.self="$emit('close')">
    <div class="wk-panel" role="menu" aria-label="Go to view">
      <div class="wk-head">
        <span class="kbadge">space</span>
        <span class="wk-crumb">Go to view</span>
      </div>
      <div class="wk-groups">
        <div v-for="group in NAV_GROUPS" :key="group.title" class="wk-group">
          <span class="wk-title">{{ group.title }}</span>
          <button
            v-for="item in group.items"
            :key="item.id"
            class="wk-item"
            type="button"
            role="menuitem"
            @click="$emit('select', item.id)"
          >
            <kbd>{{ item.key }}</kbd>
            <span class="wk-label">{{ item.label }}</span>
          </button>
        </div>
      </div>
      <footer class="wk-foot">
        <span><kbd>g s c …</kbd> jump</span>
        <span><kbd>esc</kbd> close</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.whichkey {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0 var(--space-8) 38px;
  background: rgba(8, 8, 14, 0.5);
  backdrop-filter: blur(2px);
}
.wk-panel {
  width: min(680px, 100%);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-xl);
  background: var(--surface-overlay);
  box-shadow: var(--elev-3);
  overflow: hidden;
}
.wk-head {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-6) var(--space-8);
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}
.kbadge {
  flex: none;
  padding: var(--space-2) var(--space-4);
  border-radius: 6px;
  background: var(--accent);
  color: var(--accent-ink);
  font: 700 var(--fs-xs) var(--font-mono);
  text-transform: uppercase;
}
.wk-crumb {
  flex: none;
  color: var(--text-dim);
  font-size: var(--fs-md);
}
.wk-groups {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2) var(--space-8);
  padding: 10px;
}
.wk-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}
.wk-title {
  padding: var(--space-1) var(--space-4) var(--space-2);
  color: var(--text-mut);
  font-size: var(--fs-2xs);
  font-weight: var(--weight-emphasis);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.wk-item {
  min-height: var(--control-height-md);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  border: 0;
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--text-dim);
  padding: var(--space-4) var(--space-4);
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.wk-item:hover {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px var(--accent-line);
  color: var(--text);
}
.wk-item kbd {
  flex: none;
  min-width: 22px;
  color: var(--accent);
}
.wk-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}
.wk-foot {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-8);
  padding: var(--space-4) var(--space-8);
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}
.wk-foot span {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--text-mut);
  font-size: var(--fs-xs);
}
.wk-foot kbd {
  color: var(--text-dim);
}
@media (max-width: 640px) {
  .wk-groups {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
