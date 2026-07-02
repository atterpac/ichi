<script setup lang="ts">
/**
 * Canvas commit-graph renderer — a faithful port of the app's GraphCanvas
 * drawing routines onto the playground's cell model. Lane colors derive from
 * the active sandbox theme (--accent / --accent-2 plus hue rotations) so the
 * graph re-tints when the theme changes.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { sandbox } from '../store'
import {
  CELL_W,
  PROFILES,
  RAIL_PAD,
  shiftHue,
  type GraphCell,
  type GraphRow,
  type GraphSettings,
} from './graph'

const props = withDefaults(
  defineProps<{
    rows: GraphRow[]
    cols: number
    rowHeight: number
    graph: GraphSettings
    /** CSS var used to knock node interiors out of the background */
    surface?: string
  }>(),
  { surface: '--bg' },
)

const canvas = ref<HTMLCanvasElement | null>(null)
const width = computed(() => RAIL_PAD * 2 + props.cols * CELL_W)
const height = computed(() => Math.max(props.rows.length, 1) * props.rowHeight)
const profile = computed(() => PROFILES[props.graph.canvas] ?? PROFILES.classic)

let frame = 0

function scheduleDraw() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(draw)
}

function themeVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function laneColors(): string[] {
  const accent = themeVar('--accent') || '#3b82f6'
  const accent2 = themeVar('--accent-2') || accent
  if (profile.value.mono) return [accent]
  return [accent, accent2, shiftHue(accent, 145), shiftHue(accent2, -70), shiftHue(accent, -100)]
}

function draw() {
  const element = canvas.value
  if (!element) return

  const ratio = window.devicePixelRatio || 1
  element.width = Math.ceil(width.value * ratio)
  element.height = Math.ceil(height.value * ratio)
  element.style.width = `${width.value}px`
  element.style.height = `${height.value}px`

  const ctx = element.getContext('2d')
  if (!ctx) return

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width.value, height.value)
  ctx.lineCap = profile.value.lineCap
  ctx.lineJoin = profile.value.lineJoin

  const colors = laneColors()
  const surface = themeVar(props.surface) || '#000'

  for (const [rowIndex, row] of props.rows.entries()) {
    for (const cell of row) {
      drawCell(ctx, cell, rowIndex, colors, surface)
    }
  }
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  cell: GraphCell,
  rowIndex: number,
  colors: string[],
  surface: string,
) {
  const lineWidth = crispWidth(profile.value.lineWidth)
  const x = RAIL_PAD + cell.c * CELL_W
  const centerX = snap(x + CELL_W / 2, lineWidth)
  const top = snap(rowIndex * props.rowHeight, lineWidth)
  const midY = snap(top + props.rowHeight / 2, lineWidth)
  const bottom = snap(top + props.rowHeight, lineWidth)
  const color = colors[Math.abs(cell.color) % colors.length] ?? colors[0] ?? '#3b82f6'

  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = lineWidth
  ctx.shadowBlur = props.graph.canvas === 'neon' ? profile.value.glow : 0
  ctx.shadowColor = props.graph.canvas === 'neon' ? color : 'transparent'

  switch (cell.kind) {
    case 'vertical':
      drawPath(ctx, [[centerX, top - 1], [centerX, bottom + 1]])
      break
    case 'horizontal':
      drawPath(ctx, [[x, midY], [x + CELL_W, midY]])
      break
    case 'top-left':
      drawBend(ctx, centerX, bottom + 1, x + CELL_W, midY, 'right')
      break
    case 'top-right':
      drawBend(ctx, centerX, bottom + 1, x, midY, 'left')
      break
    case 'bot-left':
      drawBend(ctx, centerX, top - 1, x + CELL_W, midY, 'right')
      break
    case 'bot-right':
      drawBend(ctx, centerX, top - 1, x, midY, 'left')
      break
    case 'cross':
      drawCross(ctx, x, centerX, x + CELL_W, top, midY, bottom)
      break
    case 'node':
    case 'head-node':
      drawNodeLine(ctx, centerX, top, midY, bottom, cell)
      drawCircleNode(ctx, centerX, midY, cell.kind === 'head-node', surface)
      break
    case 'merge-node':
      drawNodeLine(ctx, centerX, top, midY, bottom, cell)
      drawDiamondNode(ctx, centerX, midY, surface)
      break
  }
}

function drawPath(ctx: CanvasRenderingContext2D, points: [number, number][]) {
  const first = points[0]
  if (!first) return
  ctx.beginPath()
  ctx.moveTo(first[0], first[1])
  for (const point of points.slice(1)) ctx.lineTo(point[0], point[1])
  ctx.stroke()
}

function snap(value: number, lineWidth: number) {
  return Math.round(value) + (lineWidth % 2 === 0 ? 0 : 0.5)
}

function crispWidth(value: number) {
  return Math.max(1, Math.round(value))
}

function drawBend(
  ctx: CanvasRenderingContext2D,
  verticalX: number,
  verticalY: number,
  horizontalX: number,
  horizontalY: number,
  direction: 'left' | 'right',
) {
  const bend = props.graph.bend
  if (bend === 'diagonal') {
    drawPath(ctx, [[verticalX, verticalY], [horizontalX, horizontalY]])
    return
  }

  const elbowX = verticalX
  const elbowY = horizontalY
  if (bend === 'curve') {
    ctx.beginPath()
    ctx.moveTo(verticalX, verticalY)
    ctx.quadraticCurveTo(elbowX, elbowY, horizontalX, horizontalY)
    ctx.stroke()
    return
  }

  if (bend === 'rounded') {
    const radius = Math.min(5, Math.abs(verticalY - elbowY) / 2, Math.abs(horizontalX - elbowX) / 2)
    const yBefore = verticalY < elbowY ? elbowY - radius : elbowY + radius
    const xAfter = direction === 'right' ? elbowX + radius : elbowX - radius
    ctx.beginPath()
    ctx.moveTo(verticalX, verticalY)
    ctx.lineTo(elbowX, yBefore)
    ctx.quadraticCurveTo(elbowX, elbowY, xAfter, elbowY)
    ctx.lineTo(horizontalX, horizontalY)
    ctx.stroke()
    return
  }

  drawPath(ctx, [[verticalX, verticalY], [elbowX, elbowY], [horizontalX, horizontalY]])
}

function drawCross(
  ctx: CanvasRenderingContext2D,
  leftX: number,
  centerX: number,
  rightX: number,
  top: number,
  midY: number,
  bottom: number,
) {
  drawPath(ctx, [[centerX, top - 1], [centerX, bottom + 1]])

  const collision = props.graph.collision
  const gap = profile.value.lineWidth + 2
  if (collision === 'gap') {
    drawPath(ctx, [[leftX, midY], [centerX - gap, midY]])
    drawPath(ctx, [[centerX + gap, midY], [rightX, midY]])
    return
  }
  if (collision === 'bridge') {
    drawPath(ctx, [[leftX, midY], [centerX - gap, midY]])
    ctx.beginPath()
    ctx.moveTo(centerX - gap, midY)
    ctx.quadraticCurveTo(centerX, midY - 5, centerX + gap, midY)
    ctx.stroke()
    drawPath(ctx, [[centerX + gap, midY], [rightX, midY]])
    return
  }
  if (collision === 'fade') {
    ctx.save()
    ctx.globalAlpha = 0.42
    drawPath(ctx, [[leftX, midY], [rightX, midY]])
    ctx.restore()
    return
  }
  drawPath(ctx, [[leftX, midY], [rightX, midY]])
}

function drawNodeLine(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  top: number,
  midY: number,
  bottom: number,
  cell: GraphCell,
) {
  if (cell.ct) drawPath(ctx, [[centerX, top - 1], [centerX, midY]])
  if (cell.cb) drawPath(ctx, [[centerX, midY], [centerX, bottom + 1]])
}

function drawCircleNode(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  isHead: boolean,
  surface: string,
) {
  const color = ctx.strokeStyle as string
  const radius = isHead ? profile.value.headRadius : profile.value.nodeRadius
  const glyph = props.graph.glyph
  const hollow = profile.value.hollowNodes || glyph === 'ring'

  ctx.beginPath()
  if (glyph === 'diamond') {
    drawDiamondShape(ctx, centerX, centerY, radius)
  } else if (glyph === 'terminal') {
    drawTerminalShape(ctx, centerX, centerY, radius)
  } else if (profile.value.squareNodes || glyph === 'square') {
    ctx.rect(centerX - radius, centerY - radius, radius * 2, radius * 2)
  } else {
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  }
  if (hollow) ctx.fillStyle = surface
  ctx.fill()
  ctx.lineWidth = profile.value.nodeStrokeWidth
  ctx.strokeStyle = hollow ? color : surface
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.fillStyle = color

  if (isHead) {
    ctx.beginPath()
    ctx.fillStyle = surface
    ctx.arc(centerX, centerY, 2.1, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = color
  }
}

function drawDiamondNode(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, surface: string) {
  const color = ctx.strokeStyle as string
  const radius = profile.value.diamondRadius
  const glyph = props.graph.glyph
  const hollow = profile.value.hollowNodes || glyph === 'ring'

  ctx.beginPath()
  if (glyph === 'circle' || glyph === 'ring') {
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  } else if (glyph === 'terminal') {
    drawTerminalShape(ctx, centerX, centerY, radius)
  } else if (profile.value.squareNodes || glyph === 'square') {
    ctx.rect(centerX - radius, centerY - radius, radius * 2, radius * 2)
  } else {
    drawDiamondShape(ctx, centerX, centerY, radius)
  }
  ctx.closePath()
  if (hollow) {
    ctx.fillStyle = surface
    ctx.fill()
    ctx.lineWidth = profile.value.nodeStrokeWidth
    ctx.stroke()
  } else {
    ctx.fill()
    ctx.lineWidth = profile.value.nodeStrokeWidth
    ctx.strokeStyle = surface
    ctx.stroke()
  }
  ctx.strokeStyle = color
  ctx.fillStyle = color
}

function drawDiamondShape(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number) {
  ctx.moveTo(centerX, centerY - radius - 1)
  ctx.lineTo(centerX + radius, centerY)
  ctx.lineTo(centerX, centerY + radius + 1)
  ctx.lineTo(centerX - radius, centerY)
}

function drawTerminalShape(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number) {
  const shapeWidth = radius * 1.7
  const shapeHeight = radius * 2.35
  ctx.roundRect(centerX - shapeWidth / 2, centerY - shapeHeight / 2, shapeWidth, shapeHeight, 3)
}

watch(
  () => [props.rows, props.graph, props.rowHeight, props.cols, sandbox.theme],
  scheduleDraw,
  { deep: true },
)

onMounted(scheduleDraw)
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <canvas
    ref="canvas"
    class="preview-graph"
    :style="{ width: `${width}px`, height: `${height}px` }"
    aria-hidden="true"
  />
</template>

<style scoped>
.preview-graph {
  display: block;
  flex: none;
}
</style>
