<script setup lang="ts">
defineProps<{ label: string; value: string; options: string[] }>()
defineEmits<{ prev: []; next: []; select: [value: string] }>()
</script>

<template>
  <div class="pill">
    <button class="arrow" type="button" aria-label="previous" @click="$emit('prev')">‹</button>
    <span class="body">
      <span class="label">{{ label }}</span>
      <span class="value">{{ value }}</span>
    </span>
    <button class="arrow" type="button" aria-label="next" @click="$emit('next')">›</button>
  </div>
</template>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 4px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: transparent;
}

.body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1;
  min-width: 92px;
  padding: 0 4px;
}

.label {
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.value {
  font-size: 12px;
  font-weight: 600;
  color: var(--fg);
  margin-top: 3px;
}

.arrow {
  width: 22px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--fg-muted);
  font-size: 16px;
  cursor: pointer;
  transition:
    color 0.12s,
    background 0.12s;
}

.arrow:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
</style>
