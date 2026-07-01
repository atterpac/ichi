<script setup lang="ts">
/** Keyboard-first — vim-flavored prompt, resolved with y / n keys. For power users. */
import type { Op } from './ops'
defineProps<{ op: Op }>()
</script>

<template>
  <div class="scrim">
    <div class="card">
      <div class="line">
        <span class="sigil">?</span>
        <span class="q">{{ op.title }}</span>
      </div>
      <div class="cmdline">{{ op.command }}</div>
      <div class="keys">
        <span class="key yes"><kbd>y</kbd> {{ op.confirmLabel }}</span>
        <span class="key no"><kbd>n</kbd> {{ op.cancelLabel }}</span>
        <span class="key esc"><kbd>esc</kbd> dismiss</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: absolute; inset: 0; display: flex; align-items: flex-end;
  justify-content: center; padding-bottom: 40px;
  background: color-mix(in srgb, var(--bg) 40%, transparent);
}
.card {
  width: min(560px, 90%); padding: 16px 18px;
  background: var(--bg-soft); border: 1px solid var(--border); border-radius: 12px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  box-shadow: 0 16px 50px color-mix(in srgb, var(--bg) 70%, transparent);
}
.line { display: flex; gap: 10px; align-items: baseline; }
.sigil { color: var(--accent-2); font-weight: 800; }
.q { font-size: 0.92em; font-weight: 600; }
.cmdline {
  margin: 10px 0 14px; padding-left: 20px; color: var(--fg-muted); font-size: 0.85em;
}
.keys { display: flex; gap: 18px; padding-left: 20px; font-size: 0.82em; }
.key { display: flex; align-items: center; gap: 7px; color: var(--fg-muted); }
kbd {
  min-width: 18px; padding: 2px 7px; border-radius: 5px; text-align: center;
  font-size: 0.9em; font-weight: 700; font-family: inherit;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 60%, var(--bg-soft));
}
.yes kbd { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }
.no kbd { color: var(--accent-2); border-color: color-mix(in srgb, var(--accent-2) 50%, var(--border)); }
</style>
