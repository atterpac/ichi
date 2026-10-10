<script setup lang="ts">
const props = defineProps<{ modelValue: number; min: number; max: number; label: string; side?: 'left' | 'right' }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
let drag: { x: number; width: number; id: number } | null = null
function update(value: number) { emit('update:modelValue', Math.round(Math.max(props.min, Math.min(props.max, value)))) }
function start(event: PointerEvent) {
  if (event.button !== 0) return
  drag = { x: event.clientX, width: props.modelValue, id: event.pointerId }
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId); target.focus(); event.preventDefault()
}
function move(event: PointerEvent) { if (drag?.id === event.pointerId) update(drag.width + (event.clientX - drag.x) * (props.side === 'left' ? -1 : 1)) }
function end(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
  drag = null
}
function key(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault(); event.stopPropagation()
  update(event.key === 'Home' ? props.min : event.key === 'End' ? props.max : props.modelValue + (event.key === 'ArrowRight' ? 16 : -16) * (props.side === 'left' ? -1 : 1))
}
</script>
<template><div class="pane-splitter" :class="{ 'on-left': side === 'left' }" role="separator" tabindex="0" aria-orientation="vertical" :aria-label="label" :aria-valuemin="min" :aria-valuemax="max" :aria-valuenow="modelValue" @pointerdown="start" @pointermove="move" @pointerup="end" @pointercancel="end" @lostpointercapture="drag = null" @keydown="key" /></template>
<style scoped>
.pane-splitter { position: absolute; inset: 0 -3px 0 auto; width: 7px; z-index: 10; cursor: col-resize; touch-action: none; }
.pane-splitter.on-left { inset: 0 auto 0 -3px; }
.pane-splitter:hover, .pane-splitter:focus-visible { background: var(--accent); outline: none; }
</style>
