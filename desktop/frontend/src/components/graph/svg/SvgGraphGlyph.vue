<script setup lang="ts">
import { profiles, type RenderProfile } from '../graphRenderStyle'
import SvgGraphConnector from './SvgGraphConnector.vue'
import SvgGraphNode from './SvgGraphNode.vue'
import type { BendStyle, ConnectorKind, CrossingStyle, Glyph, NodeKind, NodeShape } from './types'
withDefaults(
  defineProps<{
    glyph: Glyph
    height: number
    strokeWidth: number
    bend: BendStyle
    crossing: CrossingStyle
    shape: NodeShape
    profile?: RenderProfile
  }>(),
  { profile: () => profiles.classic },
)
</script>

<template>
  <g
    :data-glyph="glyph.kind"
    :stroke-linejoin="profile.lineJoin"
    :stroke-dasharray="glyph.dashed ? '0 3.5' : undefined"
    :stroke-linecap="glyph.dashed ? 'round' : profile.lineCap"
    :style="{
      color: glyph.color || 'var(--graph-accent)',
      filter: profile.glow ? `drop-shadow(0 0 ${profile.glow / 2}px currentColor)` : undefined,
    }"
  >
    <SvgGraphNode
      v-if="glyph.kind.endsWith('node')"
      :kind="glyph.kind as NodeKind"
      :height="height"
      :stroke-width="strokeWidth"
      :top="glyph.top"
      :bottom="glyph.bottom"
      :left="glyph.left"
      :right="glyph.right"
      :shape="shape"
      :profile="profile"
    />
    <SvgGraphConnector
      v-else-if="glyph.kind !== 'empty'"
      :kind="glyph.kind as ConnectorKind"
      :height="height"
      :stroke-width="strokeWidth"
      :bend="bend"
      :crossing="crossing"
      :crossing-color="glyph.crossingColor"
    />
  </g>
</template>
