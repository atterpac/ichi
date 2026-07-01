<script setup lang="ts">
/** Inline Banner — slides down from the top, non-blocking, actions on the right. */
import { computed } from 'vue'
import type { Op } from './ops'

const props = defineProps<{ op: Op }>()
const danger = computed(() => props.op.tone === 'danger')
</script>

<template>
  <div class="stage">
    <div class="banner" :class="{ danger }">
      <span class="dot" />
      <div class="text">
        <span class="title">{{ op.title }}</span>
        <span class="summary">{{ op.summary }}</span>
      </div>
      <div class="actions">
        <button class="btn ghost">{{ op.cancelLabel }}</button>
        <button class="btn primary" :class="{ danger }">{{ op.confirmLabel }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage { position: absolute; inset: 0; padding: 16px; }
.banner {
  display: flex; align-items: center; gap: 14px; padding: 12px 12px 12px 16px;
  background: var(--bg-soft); border: 1px solid var(--border); border-radius: 12px;
  border-left: 3px solid var(--accent);
  box-shadow: 0 12px 40px color-mix(in srgb, var(--bg) 60%, transparent);
}
.banner.danger { border-left-color: var(--accent-2); }
.dot {
  width: 8px; height: 8px; border-radius: 50%; flex: none;
  background: var(--accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent);
}
.banner.danger .dot {
  background: var(--accent-2);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-2) 22%, transparent);
}
.text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.title { font-size: 0.9em; font-weight: 600; }
.summary { font-size: 0.8em; color: var(--fg-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions { display: flex; gap: 8px; flex: none; }
.btn {
  padding: 7px 14px; border-radius: 8px; font-size: 0.84em; font-weight: 600;
  cursor: pointer; border: 1px solid transparent; transition: filter 0.12s;
}
.btn:hover { filter: brightness(1.12); }
.ghost { background: transparent; border-color: var(--border); color: var(--fg-muted); }
.primary { background: var(--accent); color: var(--bg); }
.primary.danger { background: var(--accent-2); }
</style>
