<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(defineProps<{ first?: boolean; last?: boolean; kind?: string }>(), {
  kind: 'COMMENT',
})
const tone = computed(() =>
  props.kind === 'APPROVED'
    ? 'approved'
    : props.kind === 'CHANGES_REQUESTED'
      ? 'changes'
      : props.kind === 'OPENED'
        ? 'opened'
        : 'comment',
)
const symbol = computed(() =>
  tone.value === 'approved'
    ? '✓'
    : tone.value === 'changes'
      ? '!'
      : tone.value === 'opened'
        ? '◇'
        : '•',
)
</script>
<template>
  <div class="timeline-item" :class="{ first, last }">
    <span class="timeline-marker" :class="`marker-${tone}`" aria-hidden="true">{{ symbol }}</span>
    <slot />
  </div>
</template>
<style scoped>
.timeline-item {
  position: relative;
  padding-left: 32px;
  width: 100%;
  max-width: 812px;
  margin: 0 auto;
  flex-shrink: 0;
  min-width: 0;
}
.timeline-item::before {
  content: '';
  position: absolute;
  width: 1px;
  background: var(--border-2);
  left: 10px;
  top: -24px;
  bottom: -24px;
}
.timeline-item.first::before {
  top: 25px;
}
.timeline-item.last::before {
  bottom: calc(100% - 25px);
}
.timeline-marker {
  position: absolute;
  top: 15px;
  left: 0;
  width: 21px;
  height: 21px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-2);
  border-radius: 50%;
  background: var(--surface-panel);
  color: var(--text-mut);
  font: 600 13px/1 var(--font-ui);
  z-index: 1;
}
.timeline-marker.marker-opened {
  color: var(--accent-text);
}
.timeline-marker.marker-approved {
  color: var(--positive-text);
  border-color: var(--positive-text);
}
.timeline-marker.marker-changes {
  color: var(--warning-text);
  border-color: var(--warning-text);
}
.timeline-item :deep(article.pr-post),
.timeline-item :deep(article.comment) {
  margin: 0;
  max-width: none;
  width: 100%;
}
@media (max-width: 650px) {
  .timeline-item {
    padding-left: 26px;
  }
}
</style>
