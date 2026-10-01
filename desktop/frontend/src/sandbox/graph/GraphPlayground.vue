<script setup lang="ts">
import { computed, ref } from 'vue'
import SvgGraphGlyph from '../../components/graph/svg/SvgGraphGlyph.vue'
import {
  connectors,
  nodes,
  type BendStyle,
  type CrossingStyle,
  type Glyph,
  type NodeShape,
} from '../../components/graph/svg/types'
import RoutedGraphExamples from './RoutedGraphExamples.vue'
import { fixtures } from './fixtures'
const bend = ref<BendStyle>('rounded')
const crossing = ref<CrossingStyle>('gap')
const shape = ref<NodeShape>('semantic')
const height = ref(32)
const strokeWidth = ref(2)
const scale = ref(3)
const grid = ref(true)
const light = ref(false)
const color = ref('#48bea1')
const scenario = ref('Branch and merge')
const selected = ref(2)
const sample = computed(() => fixtures[scenario.value]!)
const top = ref(true),
  bottom = ref(true),
  left = ref(false),
  right = ref(true)
const glyphs = computed<Glyph[]>(() =>
  [...connectors, ...nodes].map((kind) => ({
    kind,
    color: color.value,
    crossingColor: '#a592f5',
    top: top.value,
    bottom: bottom.value,
    left: left.value,
    right: right.value,
  })),
)
const options = computed(() => ({
  height: height.value,
  strokeWidth: strokeWidth.value,
  bend: bend.value,
  crossing: crossing.value,
  shape: shape.value,
}))
</script>

<template>
  <main class="lab" :class="{ light }" :style="{ '--graph-accent': color }">
    <div class="page">
      <header>
        <div class="eyebrow">ICHI / GRAPH STUDIES</div>
        <h1>A small vocabulary.<br /><span>A connected history.</span></h1>
        <p>
          Fourteen reusable SVG glyphs. Explore the geometry, then see the pieces join at real
          commit-row sizes.
        </p>
        <span class="badge">Shared app components · local fixtures · no repository required</span>
      </header>
      <section class="controls" aria-label="Drawing controls">
        <label
          >Bends<select v-model="bend">
            <option>rounded</option>
            <option>curve</option>
            <option>diagonal</option>
            <option>square</option>
          </select></label
        >
        <label
          >Crossings<select v-model="crossing">
            <option>gap</option>
            <option>bridge</option>
            <option>continuous</option>
          </select></label
        >
        <label
          >Node shape<select v-model="shape">
            <option>semantic</option>
            <option>circle</option>
            <option>square</option>
            <option>diamond</option>
            <option>ring</option>
            <option>terminal</option>
          </select></label
        >
        <label
          >Row height · {{ height }}px<input
            v-model.number="height"
            type="range"
            min="24"
            max="48"
            step="2"
        /></label>
        <label
          >Stroke · {{ strokeWidth }}px<input
            v-model.number="strokeWidth"
            type="range"
            min="1"
            max="3"
            step="0.25"
        /></label>
        <label>Accent<input v-model="color" type="color" /></label>
        <label class="check"><input v-model="light" type="checkbox" />Light surface</label>
      </section>
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>01 / Connected rows</h2>
            <p>{{ sample.description }}</p>
          </div>
          <select v-model="scenario" aria-label="Graph scenario" @change="selected = -1">
            <option v-for="(_, name) in fixtures" :key="name">{{ name }}</option>
          </select>
        </div>
        <div class="history">
          <button
            v-for="(row, index) in sample.rows"
            :key="`${scenario}-${index}`"
            class="commit"
            :class="{ selected: selected === index }"
            :style="{ height: `${height}px` }"
            :aria-pressed="selected === index"
            @click="selected = index"
          >
            <svg width="136" :height="height" :viewBox="`0 0 136 ${height}`" aria-hidden="true">
              <g
                v-for="(glyph, cell) in row.cells"
                :key="cell"
                :transform="`translate(${8 + cell * 10}, 0)`"
              >
                <SvgGraphGlyph :glyph="glyph" v-bind="options" />
              </g>
            </svg>
            <span>{{ row.label }}</span
            ><code>{{ row.hash }}</code>
          </button>
        </div>
        <p class="footnote">
          Click a row to select it. These hand-authored examples illustrate intended connections;
          they do not run the Go layout engine.
        </p>
      </section>
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>02 / The glyph library</h2>
            <p>
              Nine connectors + five nodes. Junctions meet the rail; unrelated crossings use the
              treatment above.
            </p>
          </div>
          <label
            >Magnification · {{ scale }}×<input
              v-model.number="scale"
              type="range"
              min="1"
              max="5"
              step="1"
          /></label>
        </div>
        <div class="ports">
          <span>Node connections</span>
          <label v-for="port in ['top', 'bottom', 'left', 'right']" :key="port" class="check">
            <input v-if="port === 'top'" v-model="top" type="checkbox" /><input
              v-else-if="port === 'bottom'"
              v-model="bottom"
              type="checkbox"
            /><input v-else-if="port === 'left'" v-model="left" type="checkbox" /><input
              v-else
              v-model="right"
              type="checkbox"
            />{{ port }}
          </label>
          <label class="check grid-toggle"
            ><input v-model="grid" type="checkbox" />Cell guides</label
          >
        </div>
        <div class="glyph-grid">
          <article v-for="glyph in glyphs" :key="glyph.kind" class="glyph-card">
            <div class="glyph-stage" :style="{ height: `${height * scale + 32}px` }">
              <svg
                :width="30 * scale"
                :height="height * scale"
                :viewBox="`-10 0 30 ${height}`"
                role="img"
                :aria-label="glyph.kind"
              >
                <g v-if="grid" fill="none" stroke="var(--guide)" stroke-width=".3">
                  <rect width="10" :height="height" />
                  <path :d="`M-10,${height / 2} H20 M5,0 V${height}`" stroke-dasharray="1 2" />
                </g>
                <SvgGraphGlyph :glyph="glyph" v-bind="options" />
              </svg>
            </div>
            <code>{{ glyph.kind }}</code>
          </article>
        </div>
        <p class="footnote">
          Guides mark the 10px cell and its center. Semantic mode marks merges with diamonds and
          stashes with a tinted tray tile. The library accent applies to isolated glyphs; composed examples
          retain distinct edge colors.
        </p>
      </section>
      <RoutedGraphExamples :height="height" :bend="bend" :crossing="crossing" :shape="shape" />
      <footer>Prototype components: SvgGraphConnector · SvgGraphNode · SvgGraphGlyph</footer>
    </div>
  </main>
</template>

<style>
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
.lab {
  --graph-surface: #141b23;
  --bg: #0c1118;
  --text: #e1e8ee;
  --muted: #92a1ae;
  --border: #2a3541;
  --guide: #718395;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  padding: 48px 28px;
}
.lab.light {
  --graph-surface: #fff;
  --bg: #edf1f4;
  --text: #1a2836;
  --muted: #516477;
  --border: #c7d0d9;
  --guide: #899eaf;
}
.page {
  max-width: 1160px;
  margin: auto;
}
.eyebrow {
  color: var(--graph-accent);
  font:
    11px ui-monospace,
    monospace;
  letter-spacing: 3px;
}
h1 {
  font-size: clamp(30px, 4vw, 48px);
  letter-spacing: -1.8px;
  line-height: 1.1;
  margin: 20px 0;
  font-weight: 550;
}
h1 span {
  color: var(--muted);
}
p {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
  margin: 8px 0;
}
.badge {
  display: inline-block;
  font:
    11px ui-monospace,
    monospace;
  color: var(--muted);
  border: 1px solid var(--border);
  padding: 7px 10px;
  border-radius: 5px;
  margin-top: 12px;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
  padding: 22px 0;
  margin: 18px 0;
}
label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
}
select {
  background: var(--graph-surface);
  color: var(--text);
  border: 1px solid var(--border);
  padding: 8px 10px;
  border-radius: 5px;
  font: inherit;
}
input {
  accent-color: var(--graph-accent);
}
input[type='range'] {
  width: 130px;
}
input[type='color'] {
  width: 42px;
  height: 31px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 5px;
}
.check {
  flex-direction: row;
  align-items: center;
  gap: 5px;
}
.panel {
  background: var(--graph-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 24px;
  overflow: hidden;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 22px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
h2 {
  font-size: 14px;
  font-weight: 550;
  margin: 0;
}
.history {
  padding: 16px 0;
  overflow-x: auto;
}
.commit {
  width: 100%;
  min-width: 520px;
  display: flex;
  align-items: center;
  gap: 18px;
  border: 0;
  padding: 0 24px 0 14px;
  background: transparent;
  color: var(--text);
  text-align: left;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.commit:hover {
  background: color-mix(in srgb, var(--graph-accent) 7%, transparent);
}
.commit.selected {
  background: color-mix(in srgb, var(--graph-accent) 12%, transparent);
  box-shadow: inset 2px 0 var(--graph-accent);
}
.commit svg {
  flex: none;
  overflow: visible;
}
.commit code {
  margin-left: auto;
  color: var(--muted);
  font-size: 11px;
}
:focus-visible {
  outline: 2px solid var(--graph-accent);
  outline-offset: -2px;
}
.ports {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 16px 22px;
  color: var(--muted);
  font-size: 12px;
}
.grid-toggle {
  margin-left: auto;
}
.glyph-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
  gap: 1px;
  background: var(--border);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.glyph-card {
  background: var(--graph-surface);
  text-align: center;
  padding: 12px;
}
.glyph-stage {
  display: flex;
  align-items: center;
  justify-content: center;
}
.glyph-stage svg {
  overflow: visible;
}
.glyph-card code {
  color: var(--muted);
  font-size: 11px;
  display: block;
  padding: 12px 0 4px;
}
.footnote {
  padding: 12px 22px;
  font-size: 11px;
  margin: 0;
}
footer {
  color: var(--muted);
  font:
    11px ui-monospace,
    monospace;
  padding: 8px 0 20px;
}
@media (max-width: 600px) {
  .lab {
    padding: 28px 14px;
  }
  .section-head {
    padding: 16px;
  }
  .grid-toggle {
    margin-left: 0;
  }
}
</style>
