<script setup lang="ts">
import { Commit } from '../../bindings/github.com/atterpac/ichi/internal/git'
import GraphSvg from '../graph/GraphSvg.vue'
import type {
  GraphGlyph,
  GraphLane,
  GraphLayoutRow,
} from '../../bindings/github.com/atterpac/ichi/desktop/services'

import { computed } from 'vue'
import { usePreferenceBindings } from '../../customization/usePreferences'
import { GRAPH_ROW_HEIGHTS } from '../graph/rowDensity'
const settings = usePreferenceBindings()
const rowHeight = computed(() => GRAPH_ROW_HEIGHTS[settings['graph.rowDensity']])

const E = 'empty'
const isNode = (kind: string) => kind.endsWith('node')

function lane(
  color: number,
  cells: [string, string, string],
  connect: 'top' | 'bottom' | 'both' = 'both',
): GraphLane {
  return {
    ColorID: color,
    Glyphs: cells.map((kind) => ({
      Kind: kind,
      ColorID: color,
      CommitHash: '',
      ConnectTop: isNode(kind) && connect !== 'bottom',
      ConnectBottom: isNode(kind) && connect !== 'top',
    })) as GraphGlyph[],
  } as GraphLane
}

// Fabricated history exercising every glyph the style settings touch:
// bends (top/bot corners), one crossing row, node shapes, head dot.
// Lanes run past the viewport edges so nothing reads as a closed box.
const sample = [
  {
    subject: 'wip: polish settings preview',
    hash: '9f31c2e',
    lanes: [lane(0, [E, 'head-node', E], 'bottom')],
  },
  {
    subject: "Merge branch 'feature/finder'",
    hash: 'a4d81b7',
    lanes: [lane(0, [E, 'merge-node', 'horizontal']), lane(1, ['horizontal', 'top-right', E])],
  },
  {
    subject: 'feat(finder): unified search mode',
    hash: 'c07e9d3',
    lanes: [lane(0, [E, 'vertical', E]), lane(1, [E, 'node', E])],
  },
  {
    subject: 'fix: keep rail alignment on resize',
    hash: 'e5a2f48',
    lanes: [
      lane(0, [E, 'node', 'horizontal']),
      lane(1, ['horizontal', 'cross', 'horizontal']),
      lane(2, ['horizontal', 'top-right', E]),
    ],
  },
  {
    subject: 'chore: bump dado themes',
    hash: 'b96d015',
    lanes: [lane(0, [E, 'vertical', E]), lane(1, [E, 'vertical', E]), lane(2, [E, 'node', E])],
  },
  {
    subject: 'feat: settings graph preview',
    hash: 'd3384aa',
    lanes: [
      lane(0, [E, 'node', 'horizontal']),
      lane(1, ['horizontal', 'bot-right', E]),
      lane(2, [E, 'vertical', E]),
    ],
  },
]

const rows = sample.map(
  (row, index) =>
    ({
      Commit: new Commit({
        Hash: row.hash,
        Message: row.subject,
        Author: ['Alex Chen', 'Sam Rivera', 'Jordan Lee'][index % 3],
      }),
      Lanes: row.lanes,
    }) as GraphLayoutRow,
)
</script>

<template>
  <div class="graph-preview-frame" aria-hidden="true">
    <GraphSvg :rows="rows" :lane-count="3" :row-height="rowHeight" />
    <div class="graph-preview-rows">
      <div
        v-for="row in sample"
        :key="row.hash"
        class="graph-preview-row"
        :style="{ height: `${rowHeight}px` }"
      >
        <span class="gp-subject">{{ row.subject }}</span>
        <span class="gp-hash">{{ row.hash }}</span>
      </div>
    </div>
  </div>
</template>
