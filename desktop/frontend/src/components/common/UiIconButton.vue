<script setup lang="ts">
import UiButton from './UiButton.vue'
withDefaults(
  defineProps<{
    label: string
    size?: 'sm' | 'md' | 'lg'
    variant?: 'default' | 'primary' | 'danger' | 'ghost'
  }>(),
  { size: 'md', variant: 'ghost' },
)
</script>

<template>
  <UiButton :size="size" :variant="variant" icon-only :aria-label="label" :title="label"
    ><slot
  /></UiButton>
</template>
