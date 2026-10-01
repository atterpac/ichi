<script setup lang="ts">
import { computed } from 'vue'
import type { BendStyle, ConnectorKind, CrossingStyle } from './types'
const props = withDefaults(
  defineProps<{
    kind: ConnectorKind
    height?: number
    width?: number
    strokeWidth?: number
    bend?: BendStyle
    crossing?: CrossingStyle
    crossingColor?: string
  }>(),
  { height: 32, width: 10, strokeWidth: 2, bend: 'rounded', crossing: 'gap' },
)
const x = computed(() => props.width / 2)
const y = computed(() => props.height / 2)
const gap = computed(() => Math.min(x.value - 1, props.strokeWidth + 1))
const bendPath = computed(() => {
  const junction = props.kind === 'vert-left' || props.kind === 'vert-right'
  const endX = (junction ? props.kind === 'vert-right' : props.kind.endsWith('left'))
    ? props.width
    : 0
  const startY = props.kind.startsWith('top') || junction ? props.height : 0
  const cx = x.value,
    cy = y.value
  if (props.bend === 'diagonal') return `M${cx},${startY} L${endX},${cy}`
  if (props.bend === 'curve') return `M${cx},${startY} Q${cx},${cy} ${endX},${cy}`
  if (props.bend === 'square' || props.bend === 'elbow') return `M${cx},${startY} V${cy} H${endX}`
  const r = Math.min(4, cx, cy)
  return `M${cx},${startY} V${cy + (startY > cy ? r : -r)} Q${cx},${cy} ${cx + (endX > cx ? r : -r)},${cy} H${endX}`
})
const crossPath = computed(() => {
  const cx = x.value,
    cy = y.value,
    g = gap.value
  if (props.crossing === 'continuous' || props.crossing === 'cross' || props.crossing === 'fade')
    return `M0,${cy} H${props.width}`
  if (props.crossing === 'bridge')
    return `M0,${cy} H${cx - g} Q${cx},${cy - 6} ${cx + g},${cy} H${props.width}`
  return `M0,${cy} H${cx - g} M${cx + g},${cy} H${props.width}`
})
</script>

<template>
  <g fill="none" stroke="currentColor" :stroke-width="strokeWidth">
    <path
      v-if="
        kind === 'vertical' || kind === 'vert-left' || kind === 'vert-right' || kind === 'cross'
      "
      :d="`M${x},0 V${height}`"
    />
    <path v-if="kind === 'horizontal'" :d="`M0,${y} H${width}`" />
    <path
      v-if="
        kind.startsWith('top-') ||
        kind.startsWith('bot-') ||
        kind === 'vert-left' ||
        kind === 'vert-right'
      "
      :d="bendPath"
    />
    <!-- A junction actually meets the vertical rail; only unrelated crossings get a gap. -->
    <path
      v-if="kind === 'cross'"
      :d="crossPath"
      :opacity="crossing === 'fade' ? 0.42 : 1"
      :stroke="crossingColor || 'currentColor'"
      :stroke-linecap="crossing === 'gap' ? 'butt' : 'round'"
    />
  </g>
</template>
