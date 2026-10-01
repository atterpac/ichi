<script setup lang="ts">
import { computed } from 'vue'
import { PhTray } from '@phosphor-icons/vue'
import { profiles, type RenderProfile } from '../graphRenderStyle'
import type { NodeKind, NodeShape } from './types'
const props = withDefaults(
  defineProps<{
    kind: NodeKind
    height?: number
    width?: number
    strokeWidth?: number
    top?: boolean
    bottom?: boolean
    left?: boolean
    right?: boolean
    shape?: NodeShape
    profile?: RenderProfile
  }>(),
  { height: 32, width: 10, strokeWidth: 2, shape: 'semantic', profile: () => profiles.classic },
)
const x = computed(() => props.width / 2)
const y = computed(() => props.height / 2)
const isDiamondKind = computed(() => props.kind === 'merge-node' || props.kind === 'stash-node')
const radius = computed(() =>
  props.kind === 'unstaged-node'
    ? Math.max(5.5, props.profile.nodeRadius + 1)
    : props.kind === 'head-node'
      ? props.profile.headRadius
      : isDiamondKind.value
        ? props.profile.diamondRadius
        : props.profile.nodeRadius,
)
const hollow = computed(
  () => props.kind === 'stash-node' || props.profile.hollowNodes || props.shape === 'ring',
)
// The stash is a row-height tile tinted in its lane color around Phosphor's tray.
const stashBox = computed(() => {
  // Fill the row, keeping the same 2px inset as the row's color band.
  const size = Math.max(12, props.height - 4)
  const icon = Math.round(size * 0.6)
  return {
    left: x.value - size / 2,
    top: y.value - size / 2,
    size,
    icon,
    iconLeft: x.value - icon / 2,
    iconTop: y.value - icon / 2,
  }
})
const nodeShape = computed(() => {
  if (props.shape === 'terminal' || props.shape === 'diamond') return props.shape
  if (props.profile.squareNodes || props.shape === 'square') return 'square'
  if (props.shape === 'circle' || props.shape === 'ring') return 'circle'
  return isDiamondKind.value ? 'diamond' : 'circle'
})
</script>

<template>
  <g stroke="currentColor" :stroke-width="strokeWidth">
    <g
      class="node-stems"
      fill="none"
      :stroke-dasharray="kind === 'unstaged-node' ? '3 3' : kind === 'stash-node' ? '0 3.5' : undefined"
      :stroke-linecap="kind === 'stash-node' ? 'round' : undefined"
    >
      <path v-if="top" :d="`M${x},0 V${kind === 'stash-node' ? stashBox.top : y}`" />
      <path v-if="bottom" :d="`M${x},${kind === 'stash-node' ? stashBox.top + stashBox.size : y} V${height}`" />
      <path v-if="left" :d="`M0,${y} H${x}`" />
      <path v-if="right" :d="`M${x},${y} H${width}`" />
    </g>
    <circle
      v-if="kind === 'head-node'"
      class="head-ring"
      :cx="x"
      :cy="y"
      :r="radius + 3"
      fill="none"
      stroke-width="1.5"
      opacity=".55"
    />
    <g v-if="kind === 'unstaged-node'" class="working-node">
      <circle :cx="x" :cy="y" :r="radius + 1" fill="var(--graph-surface)" stroke="none" />
      <circle
        :cx="x"
        :cy="y"
        :r="radius"
        fill="none"
        stroke-width="1.5"
        pathLength="60"
        stroke-dasharray="5 5"
        stroke-dashoffset="2.5"
        stroke-linecap="round"
        :transform="`rotate(-90 ${x} ${y})`"
      />
    </g>
    <!-- A stash is shelved work, not history: a tinted tile with a tray mark. -->
    <g v-else-if="kind === 'stash-node'" class="stash-node">
      <rect
        :x="stashBox.left"
        :y="stashBox.top"
        :width="stashBox.size"
        :height="stashBox.size"
        :rx="stashBox.size * 0.22"
        fill="var(--graph-surface)"
        stroke="none"
      />
      <rect
        :x="stashBox.left"
        :y="stashBox.top"
        :width="stashBox.size"
        :height="stashBox.size"
        :rx="stashBox.size * 0.22"
        fill="currentColor"
        fill-opacity=".2"
        stroke="none"
      />
      <PhTray
        :x="stashBox.iconLeft"
        :y="stashBox.iconTop"
        :size="stashBox.icon"
        weight="bold"
        stroke="none"
      />
    </g>
    <g
      v-else
      class="node-marker"
      :fill="hollow ? 'var(--graph-surface)' : 'currentColor'"
      :stroke="hollow ? 'currentColor' : 'var(--graph-surface)'"
      :stroke-width="profile.nodeStrokeWidth"
    >
      <path
        v-if="nodeShape === 'diamond'"
        :d="`M${x},${y - radius - 1} L${x + radius},${y} L${x},${y + radius + 1} L${x - radius},${y} Z`"
      />
      <rect
        v-else-if="nodeShape === 'square'"
        :x="x - radius"
        :y="y - radius"
        :width="radius * 2"
        :height="radius * 2"
      />
      <rect
        v-else-if="nodeShape === 'terminal'"
        :x="x - radius * 0.85"
        :y="y - radius * 1.175"
        :width="radius * 1.7"
        :height="radius * 2.35"
        rx="3"
      />
      <circle v-else :cx="x" :cy="y" :r="radius" />
    </g>
    <circle
      v-if="kind === 'head-node'"
      :cx="x"
      :cy="y"
      r="2.1"
      fill="var(--graph-surface)"
      stroke="none"
    />
  </g>
</template>
