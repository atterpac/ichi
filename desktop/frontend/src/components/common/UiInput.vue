<script setup lang="ts">
import { ref } from 'vue'
withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg'; invalid?: boolean }>(), {
  size: 'md',
  invalid: false,
})
const model = defineModel<string>()
const input = ref<HTMLInputElement | null>(null)
defineExpose({ focus: () => input.value?.focus(), select: () => input.value?.select() })
</script>

<template>
  <input
    ref="input"
    v-model="model"
    class="ui-field"
    :class="`size-${size}`"
    :aria-invalid="invalid || undefined"
  />
</template>
