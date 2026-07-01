<script setup lang="ts">
/** Classic — centered card, headline + summary + two buttons. The safe default. */
import { computed } from 'vue'
import type { Op } from './ops'

const props = defineProps<{ op: Op }>()
const danger = computed(() => props.op.tone === 'danger')
</script>

<template>
  <div class="scrim">
    <div class="card" :class="{ danger }">
      <h2 class="title">{{ op.title }}</h2>
      <p class="summary">{{ op.summary }}</p>
      <div class="actions">
        <button class="btn ghost">{{ op.cancelLabel }}</button>
        <button class="btn primary" :class="{ danger }">{{ op.confirmLabel }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: absolute; inset: 0; display: grid; place-items: center;
  background: color-mix(in srgb, var(--bg) 60%, transparent);
  backdrop-filter: blur(2px);
}
.card {
  width: min(420px, 82%); padding: 26px 26px 20px;
  background: var(--bg-soft); border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 24px 70px color-mix(in srgb, var(--bg) 70%, transparent);
}
.card.danger { border-color: color-mix(in srgb, var(--accent-2) 45%, var(--border)); }
.title { margin: 0 0 8px; font-size: 1.12em; font-weight: 700; line-height: 1.3; }
.summary { margin: 0 0 22px; color: var(--fg-muted); font-size: 0.92em; line-height: 1.5; }
.actions { display: flex; justify-content: flex-end; gap: 10px; }
.btn {
  padding: 9px 16px; border-radius: 9px; font-size: 0.88em; font-weight: 600;
  cursor: pointer; border: 1px solid transparent; transition: filter 0.12s;
}
.btn:hover { filter: brightness(1.12); }
.ghost { background: transparent; border-color: var(--border); color: var(--fg-muted); }
.primary { background: var(--accent); color: var(--bg); }
.primary.danger { background: var(--accent-2); }
</style>
