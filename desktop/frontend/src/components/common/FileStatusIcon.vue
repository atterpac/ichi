<script setup lang="ts">
import { computed } from 'vue'
import { PhArrowRight, PhCopy, PhEquals, PhMinus, PhPencilSimple, PhPlus, PhWarning } from '@phosphor-icons/vue'
import type { FileStatus } from '../../bindings/github.com/atterpac/ichi/internal/git'
import { fileStatusPresentation } from './fileStatusPresentation'

const props = withDefaults(defineProps<{ status: string | FileStatus; size?: number }>(), { size: 14 })
const icons = {
  M: PhPencilSimple, A: PhPlus, D: PhMinus, R: PhArrowRight, C: PhCopy,
  '?': PhPlus, '!': PhWarning, I: PhMinus, '–': PhEquals,
}
const statusInfo = computed(() => fileStatusPresentation(props.status))
const icon = computed(() => statusInfo.value.label === 'Unknown status' ? PhWarning : icons[statusInfo.value.code as keyof typeof icons] ?? PhWarning)
</script>

<template>
  <span class="file-status-icon" :class="`status-${statusInfo.tone}`" role="img" :aria-label="statusInfo.label" :title="statusInfo.label">
    <component :is="icon" :size="size" weight="bold" aria-hidden="true" />
  </span>
</template>

<style scoped>
.file-status-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
}
</style>
