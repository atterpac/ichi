<script setup lang="ts">
import { computed } from 'vue'
import RefLabel from '../common/RefLabel.vue'
import type { RefDecoration } from '../../bindings/github.com/atterpac/ichi/internal/git'
const props = defineProps<{ decorations: RefDecoration[] }>()
const primary = computed(
  () =>
    props.decorations.find((ref) => ref.IsHead) ??
    props.decorations.find((ref) => ref.Kind === 'branch') ??
    props.decorations.find((ref) => ref.Kind === 'remote') ??
    props.decorations[0],
)
const description = computed(
  () =>
    props.decorations.map((ref) => `${ref.Name}${ref.IsHead ? ' (current)' : ''}`).join('\n') +
    '\nClick or press r for ref actions',
)
</script>

<template>
  <span v-if="primary" class="ref-cluster" :title="description">
    <RefLabel
      :name="primary.Name"
      :kind="primary.Kind"
      :current="primary.IsHead"
      :title="description"
    />
    <span
      v-if="decorations.length > 1"
      class="ref-overflow"
      :aria-label="`${decorations.length - 1} more refs`"
      >+{{ decorations.length - 1 }}</span
    >
  </span>
</template>

<style scoped>
.ref-cluster {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  max-width: 100%;
  cursor: pointer;
}
.ref-overflow {
  flex: none;
  color: var(--text-mut);
  font: var(--fs-xs) var(--font-mono);
}
.ref-cluster:hover .ref-label {
  background: var(--hover);
}
.ref-cluster:hover .ref-overflow {
  color: var(--text);
}
</style>
