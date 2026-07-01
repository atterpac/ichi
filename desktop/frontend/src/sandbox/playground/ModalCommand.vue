<script setup lang="ts">
/** Command Preview — shows the literal git command in a terminal chip before running it. */
import type { Op } from './ops'
defineProps<{ op: Op }>()
</script>

<template>
  <div class="scrim">
    <div class="card">
      <div class="head">
        <span class="badge">{{ op.verb }}</span>
        <span class="head-t">{{ op.title }}</span>
      </div>
      <div class="term">
        <span class="prompt">$</span>
        <span class="cmd">{{ op.command }}</span>
      </div>
      <p class="hint">This runs the command above in your repository.</p>
      <div class="actions">
        <button class="btn ghost">{{ op.cancelLabel }}</button>
        <button class="btn run">Run ↵</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: absolute; inset: 0; display: grid; place-items: center;
  background: color-mix(in srgb, var(--bg) 65%, transparent);
  backdrop-filter: blur(2px);
}
.card {
  width: min(460px, 84%); padding: 22px;
  background: var(--bg-soft); border: 1px solid var(--border); border-radius: 14px;
  box-shadow: 0 24px 70px color-mix(in srgb, var(--bg) 70%, transparent);
}
.head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.badge {
  padding: 3px 9px; border-radius: 6px; font-size: 0.72em; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.5px;
  background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent);
}
.head-t { font-size: 0.94em; font-weight: 600; }
.term {
  display: flex; gap: 10px; align-items: baseline; padding: 14px 16px;
  border-radius: 10px; background: color-mix(in srgb, var(--bg) 70%, var(--bg-soft));
  border: 1px solid var(--border);
  font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.9em;
}
.prompt { color: var(--accent-2); font-weight: 700; }
.cmd { color: var(--fg); }
.hint { margin: 12px 2px 20px; color: var(--fg-muted); font-size: 0.84em; }
.actions { display: flex; justify-content: flex-end; gap: 10px; }
.btn {
  padding: 9px 16px; border-radius: 9px; font-size: 0.88em; font-weight: 600;
  cursor: pointer; border: 1px solid transparent; transition: filter 0.12s;
}
.btn:hover { filter: brightness(1.12); }
.ghost { background: transparent; border-color: var(--border); color: var(--fg-muted); }
.run {
  background: var(--accent); color: var(--bg);
  font-family: ui-monospace, monospace;
}
</style>
