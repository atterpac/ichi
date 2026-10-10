<script setup lang="ts">
import { inject, onActivated, onDeactivated, ref } from 'vue'
import { settingsPreviewTarget } from './settingsPreview'
const target = inject(settingsPreviewTarget, ref(null))
const active = ref(true)
onActivated(() => {
  active.value = true
})
onDeactivated(() => {
  active.value = false
})
</script>
<template>
  <Teleport v-if="active" :to="target || 'body'" :disabled="!target"><slot /></Teleport>
</template>
