<script setup lang="ts">
import { computed } from 'vue'
import { avatarSvg, type AvatarStyle } from './generate'
const props = withDefaults(defineProps<{ seed: string; kind: AvatarStyle; size?: number }>(), {
  size: 48,
})
const svg = computed(() => avatarSvg(props.seed, props.kind))
</script>
<template>
  <span
    class="avatar-mark"
    role="img"
    :aria-label="`${kind} avatar for ${seed || 'empty input'}`"
    :style="{ width: `${size}px`, height: `${size}px` }"
    v-html="svg"
  />
</template>
<style scoped>
.avatar-mark {
  display: inline-flex;
  flex: none;
  vertical-align: middle;
}
.avatar-mark :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
