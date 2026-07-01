<script setup lang="ts">
defineProps<{ label: string; value: boolean }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <button class="pill" :class="{ on: value }" type="button" @click="$emit('toggle')">
    <span class="dot" />
    <span class="label">{{ label }}</span>
  </button>
</template>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: transparent;
  color: var(--fg-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition:
    color 0.12s,
    border-color 0.12s,
    background 0.12s;
}

.pill:hover {
  color: var(--fg);
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}

.pill.on {
  color: var(--fg);
  border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--fg-muted);
  transition: background 0.12s;
}

.pill.on .dot {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
}
</style>
