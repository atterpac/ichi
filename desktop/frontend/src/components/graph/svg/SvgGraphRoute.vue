<script setup lang="ts">
import { computed } from 'vue'
import type { GraphRoute } from '../../../bindings/github.com/atterpac/ichi/desktop/services'
import type { RenderProfile } from '../graphRenderStyle'
import { graphRouteGeometry } from '../graphRouteGeometry'
import type { BendStyle, CrossingStyle } from './types'
const props = defineProps<{
  route: GraphRoute
  track: number
  count: number
  height: number
  color: string
  profile: RenderProfile
  bend: BendStyle
  crossing: CrossingStyle
}>()
const geometry = computed(() =>
  graphRouteGeometry(
    props.route,
    props.track,
    props.count,
    props.height,
    props.bend,
    props.crossing,
    props.profile.lineWidth,
  ),
)
</script>

<template>
  <g
    class="graph-route"
    :data-parent="route.ParentHash"
    :data-from-lane="route.FromLane"
    :data-to-lane="route.ToLane"
    :data-track="track"
    fill="none"
    stroke="currentColor"
    :stroke-width="profile.lineWidth"
    :stroke-linecap="route.Dashed ? 'round' : profile.lineCap"
    :stroke-linejoin="profile.lineJoin"
    :stroke-dasharray="route.Dashed ? '0 3.5' : undefined"
    :style="{
      color,
      filter: profile.glow ? `drop-shadow(0 0 ${profile.glow / 2}px currentColor)` : undefined,
    }"
  >
    <path :d="geometry.path" />
    <path v-for="(path, index) in geometry.faded" :key="index" :d="path" opacity=".42" />
  </g>
</template>
