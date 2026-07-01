<script setup lang="ts">
/** Rich Context — headline plus a meta grid of everything the op will touch. */
import { computed } from 'vue'
import type { Op } from './ops'

const props = defineProps<{ op: Op }>()
const danger = computed(() => props.op.tone === 'danger')
</script>

<template>
  <div class="scrim">
    <div class="card" :class="{ danger }">
      <div class="head">
        <span class="verb">{{ op.verb }}</span>
        <h2 class="title">{{ op.title }}</h2>
      </div>
      <p class="summary">{{ op.summary }}</p>
      <dl class="meta">
        <div v-for="m in op.meta" :key="m.label" class="row">
          <dt>{{ m.label }}</dt>
          <dd>{{ m.value }}</dd>
        </div>
      </dl>
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
  background: color-mix(in srgb, var(--bg) 62%, transparent);
  backdrop-filter: blur(2px);
}
.card {
  width: min(480px, 86%); padding: 24px;
  background: var(--bg-soft); border: 1px solid var(--border); border-radius: 14px;
  box-shadow: 0 24px 70px color-mix(in srgb, var(--bg) 70%, transparent);
}
.card.danger { border-color: color-mix(in srgb, var(--accent-2) 45%, var(--border)); }
.head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.verb {
  padding: 3px 9px; border-radius: 6px; font-size: 0.7em; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.5px;
  background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent);
}
.card.danger .verb { background: color-mix(in srgb, var(--accent-2) 20%, transparent); color: var(--accent-2); }
.title { margin: 0; font-size: 1.02em; font-weight: 700; line-height: 1.3; }
.summary { margin: 0 0 18px; color: var(--fg-muted); font-size: 0.9em; line-height: 1.5; }
.meta {
  margin: 0 0 22px; padding: 4px 0; border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.row {
  display: flex; justify-content: space-between; gap: 16px; padding: 8px 2px;
  font-size: 0.86em;
}
.row + .row { border-top: 1px solid color-mix(in srgb, var(--border) 55%, transparent); }
dt { color: var(--fg-muted); }
dd { margin: 0; font-weight: 600; font-family: ui-monospace, monospace; text-align: right; }
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
