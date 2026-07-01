<script setup lang="ts">
/** Type-to-confirm — guards destructive ops behind typing the target name. */
import { ref } from 'vue'
import type { Op } from './ops'

const props = defineProps<{ op: Op }>()
const typed = ref('')
const matched = () => typed.value.trim() === props.op.target
</script>

<template>
  <div class="scrim">
    <div class="card">
      <div class="head">
        <span class="warn">!</span>
        <h2 class="title">{{ op.title }}</h2>
      </div>
      <p class="summary">{{ op.summary }}</p>
      <label class="field">
        <span class="lbl">Type <code>{{ op.target }}</code> to confirm</span>
        <input v-model="typed" class="input" :placeholder="op.target" spellcheck="false" />
      </label>
      <div class="actions">
        <button class="btn ghost">{{ op.cancelLabel }}</button>
        <button class="btn danger" :disabled="!matched()">{{ op.confirmLabel }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: absolute; inset: 0; display: grid; place-items: center;
  background: color-mix(in srgb, var(--bg) 66%, transparent);
  backdrop-filter: blur(2px);
}
.card {
  width: min(440px, 84%); padding: 24px;
  background: var(--bg-soft);
  border: 1px solid color-mix(in srgb, var(--accent-2) 45%, var(--border));
  border-radius: 14px;
  box-shadow: 0 24px 70px color-mix(in srgb, var(--bg) 70%, transparent);
}
.head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.warn {
  width: 22px; height: 22px; flex: none; border-radius: 6px; font-weight: 800;
  display: grid; place-items: center; font-size: 0.85em;
  background: color-mix(in srgb, var(--accent-2) 22%, transparent); color: var(--accent-2);
}
.title { margin: 0; font-size: 1.02em; font-weight: 700; line-height: 1.3; }
.summary { margin: 0 0 18px; color: var(--fg-muted); font-size: 0.9em; line-height: 1.5; }
.field { display: block; margin-bottom: 22px; }
.lbl { display: block; margin-bottom: 8px; font-size: 0.82em; color: var(--fg-muted); }
.lbl code {
  font-family: ui-monospace, monospace; color: var(--fg);
  padding: 1px 5px; border-radius: 4px;
  background: color-mix(in srgb, var(--fg) 10%, transparent);
}
.input {
  width: 100%; padding: 9px 12px; border-radius: 9px;
  background: color-mix(in srgb, var(--bg) 60%, var(--bg-soft));
  border: 1px solid var(--border); color: var(--fg);
  font-family: ui-monospace, monospace; font-size: 0.9em; outline: none;
}
.input:focus { border-color: var(--accent-2); }
.actions { display: flex; justify-content: flex-end; gap: 10px; }
.btn {
  padding: 9px 16px; border-radius: 9px; font-size: 0.88em; font-weight: 600;
  cursor: pointer; border: 1px solid transparent; transition: filter 0.12s;
}
.btn:hover:not(:disabled) { filter: brightness(1.12); }
.ghost { background: transparent; border-color: var(--border); color: var(--fg-muted); }
.danger { background: var(--accent-2); color: var(--bg); }
.danger:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
