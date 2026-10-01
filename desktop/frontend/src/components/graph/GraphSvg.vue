<script setup lang="ts">
import { computed } from 'vue'
import { usePreferenceBindings, type PreferenceValues } from '../../customization/usePreferences'
import { GRAPH_ROW_HEIGHTS } from './rowDensity'
import { GRAPH_GLYPH_WIDTH, GRAPH_RAIL_PADDING, graphRailWidth } from './graphGeometry'
import { profiles } from './graphRenderStyle'
import { laneColorVar } from './laneColors'
import AuthorAvatar from '../common/AuthorAvatar.vue'
import SvgGraphGlyph from './svg/SvgGraphGlyph.vue'
import SvgGraphRoute from './svg/SvgGraphRoute.vue'
import { connectors, nodes, type Glyph, type GlyphKind } from './svg/types'
import type { GraphLayoutRow, GraphRailSegment } from '../../bindings/github.com/atterpac/ichi/desktop/services'

const props = defineProps<{
  rows: GraphLayoutRow[]
  laneCount: number
  segments?: GraphRailSegment[]
  /** Global position/height when rows is a viewport slice. */
  startIndex?: number
  totalRows?: number
  showRefConnections?: boolean
  viewportWidth?: number
  scrollOffset?: number
  /** Fixed row height override for settings and embedded previews. */
  rowHeight?: number
  /** Local appearance overrides for previews; never writes persisted settings. */
  appearance?: Partial<
    Pick<
      PreferenceValues,
      | 'graph.renderStyle'
      | 'graph.bendStyle'
      | 'graph.collisionStyle'
      | 'graph.nodeGlyph'
      | 'graph.authorAvatars'
      | 'graph.rowDensity'
    >
  >
}>()
const shellSettings = usePreferenceBindings()
const settings = computed(() => ({ ...shellSettings, ...props.appearance }))
const rowHeight = computed(
  () =>
    props.rowHeight ??
    GRAPH_ROW_HEIGHTS[settings.value['graph.rowDensity']] ??
    GRAPH_ROW_HEIGHTS.comfortable,
)
const width = computed(() => props.viewportWidth ?? graphRailWidth(props.laneCount))
const scrollOffset = computed(() => props.scrollOffset ?? 0)
const height = computed(() => Math.max(props.totalRows ?? props.rows.length, 1) * rowHeight.value)
const profile = computed(() => profiles[settings.value['graph.renderStyle']] ?? profiles.classic)
const nodeKinds = new Set<string>(nodes)
const glyphKinds = new Set<string>([...connectors, ...nodes])
const color = (id: number) =>
  profile.value.mono ? 'var(--accent)' : `var(${laneColorVar(id)}, #7aa2f7)`

// Keep backend lane coordinates intact. Explicit routes carry parent identity
// and color; port inference supports the older glyph-only settings fixtures.
const geometryRows = computed(() =>
  props.rows.map((row, rowIndex) => {
    const glyphs = row.Lanes.flatMap((lane, laneIndex) =>
      lane.Glyphs.flatMap((glyph, glyphIndex) => {
        if (!glyphKinds.has(glyph.Kind)) return []
        const node = nodeKinds.has(glyph.Kind)
        return [
          {
            key: `${laneIndex}:${glyphIndex}`,
            x: GRAPH_RAIL_PADDING + ((lane.Column ?? laneIndex) * 3 + glyphIndex) * GRAPH_GLYPH_WIDTH,
            glyph: {
              kind: glyph.Kind as GlyphKind,
              color: color(glyph.ColorID),
              top: glyph.ConnectTop,
              bottom: glyph.ConnectBottom,
              left: node && lane.Glyphs[glyphIndex - 1]?.Kind === 'horizontal',
              right: node && lane.Glyphs[glyphIndex + 1]?.Kind === 'horizontal',
            } satisfies Glyph,
          },
        ]
      }),
    )
    const node = glyphs.find((cell) => nodeKinds.has(cell.glyph.kind))
    return {
      key: row.Commit?.Hash || rowIndex,
      y: ((props.startIndex ?? 0) + rowIndex) * rowHeight.value,
      commit: row.Commit,
      rails: glyphs.filter((cell) => !nodeKinds.has(cell.glyph.kind)),
      nodes: glyphs.filter((cell) => nodeKinds.has(cell.glyph.kind)),
      routes: (row.Routes ?? []).filter((route) => route.FromLane !== route.ToLane),
      node,
      avatar:
        settings.value['graph.authorAvatars'] &&
        row.Commit &&
        node &&
        ['node', 'head-node', 'merge-node'].includes(node.glyph.kind),
    }
  }),
)
const visibleSegments = computed(() => {
  const first = props.startIndex ?? 0
  const last = first + props.rows.length
  return (props.segments ?? []).flatMap(segment => {
    const start = Math.max(first, segment.FromRow)
    const end = Math.min(last, segment.ToRow)
    if (start >= end) return []
    return [{
      key: `${segment.Lane}:${segment.FromRow}:${segment.ToRow}`,
      x: GRAPH_RAIL_PADDING + (segment.Lane * 3 + 1) * GRAPH_GLYPH_WIDTH,
      y: start * rowHeight.value, height: (end - start) * rowHeight.value,
      glyph: { kind: 'vertical', color: color(segment.ColorID), dashed: segment.Dashed } satisfies Glyph,
    }]
  })
})
// Horizontal movement changes only viewport positions, not glyph/route objects.
const renderRows = computed(() => geometryRows.value.map(row => {
  const centerX = row.node ? row.node.x + GRAPH_GLYPH_WIDTH / 2 - scrollOffset.value : 0
  return { ...row, centerX, bandStart: Math.max(0, Math.min(centerX, width.value - 2)) }
}))
</script>

<template>
  <div class="graph-svg" :style="{ width: `${width}px`, height: `${height}px` }" aria-hidden="true">
    <svg
      class="graph-rails"
      :width="width"
      :height="height"
      :viewBox="`0 0 ${width} ${height}`"
      focusable="false"
    >
      <g class="graph-bands">
        <template v-for="row in renderRows" :key="row.key">
          <g v-if="row.node" :fill="row.node.glyph.color">
            <rect
              class="graph-band"
              :x="row.bandStart"
              :y="row.y + 2"
              :width="width - row.bandStart"
              :height="Math.max(1, rowHeight - 4)"
              opacity=".12"
            />
            <rect
              class="graph-band-edge"
              :x="width - 2"
              :y="row.y + 2"
              width="2"
              :height="Math.max(1, rowHeight - 4)"
              opacity=".85"
            />
            <path
              v-if="showRefConnections && row.commit?.Decorations?.length"
              class="graph-ref-connector"
              :d="`M0,${row.y + rowHeight / 2} H${row.centerX}`"
              :stroke="row.node.glyph.color"
              stroke-width="1"
              opacity=".5"
            />
          </g>
        </template>
      </g>
      <g class="graph-lanes" :transform="`translate(${-scrollOffset} 0)`">
        <SvgGraphGlyph v-for="segment in visibleSegments" :key="segment.key"
          :transform="`translate(${segment.x} ${segment.y})`" :glyph="segment.glyph"
          :height="segment.height" :stroke-width="profile.lineWidth" :profile="profile"
          :bend="settings['graph.bendStyle']" :crossing="settings['graph.collisionStyle']" :shape="settings['graph.nodeGlyph']" />
        <g v-for="row in renderRows" :key="row.key" :transform="`translate(0 ${row.y})`" :data-graph-row="row.key">
          <SvgGraphGlyph
            v-for="cell in row.rails"
            :key="cell.key"
            :transform="`translate(${cell.x} 0)`"
            :glyph="cell.glyph"
            :height="rowHeight"
            :stroke-width="profile.lineWidth"
            :profile="profile"
            :bend="settings['graph.bendStyle']"
            :crossing="settings['graph.collisionStyle']"
            :shape="settings['graph.nodeGlyph']"
          />
          <SvgGraphRoute
            v-for="(route, track) in row.routes"
            :key="route.ParentHash"
            :route="route"
            :track="track"
            :count="row.routes.length"
            :height="rowHeight"
            :color="color(route.ColorID)"
            :profile="profile"
            :bend="settings['graph.bendStyle']"
            :crossing="settings['graph.collisionStyle']"
          />
          <SvgGraphGlyph
            v-for="cell in row.nodes"
            :key="cell.key"
            :transform="`translate(${cell.x} 0)`"
            :glyph="cell.glyph"
            :height="rowHeight"
            :stroke-width="profile.lineWidth"
            :profile="profile"
            :bend="settings['graph.bendStyle']"
            :crossing="settings['graph.collisionStyle']"
            :shape="settings['graph.nodeGlyph']"
          />
        </g>
      </g>
    </svg>
    <template v-for="row in renderRows" :key="row.key">
      <span
        v-if="row.avatar && row.commit && row.node"
        class="graph-avatar-node"
        :class="{
          head: row.node.glyph.kind === 'head-node',
          merge: row.node.glyph.kind === 'merge-node',
        }"
        :style="{
          left: `${row.centerX}px`,
          top: `${row.y + rowHeight / 2}px`,
          '--node-color': row.node.glyph.color,
        }"
      >
        <AuthorAvatar :name="row.commit.Author" :commit="row.commit.Hash" :size="Math.max(10, rowHeight - 8)" />
      </span>
    </template>
  </div>
</template>

<style scoped>
.graph-svg {
  --graph-surface: var(--surface);
  overflow: hidden;
}
.graph-rails {
  display: block;
  overflow: hidden;
}
.graph-avatar-node {
  position: absolute;
  display: flex;
  transform: translate(-50%, -50%);
  border: 2px solid var(--node-color);
  border-radius: 50%;
  background: var(--surface);
  pointer-events: none;
}
.graph-avatar-node :deep(.author-avatar) {
  border-radius: 50%;
}
.graph-avatar-node.head {
  outline: 1px solid var(--node-color);
  outline-offset: 1px;
}
</style>
