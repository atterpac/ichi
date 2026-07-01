<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useShellSettings, type ShellSettings } from '../../composables/useShellSettings'
import type { GraphGlyph, GraphLayoutRow } from '../../bindings/github.com/atterpac/ichi/desktop/services'

const props = defineProps<{
  rows: GraphLayoutRow[]
  laneCount: number
}>()

const glyphWidth = 12
const railPadding = 8
const canvas = ref<HTMLCanvasElement | null>(null)
const settings = useShellSettings()

const rowHeights: Record<ShellSettings['graphRowDensity'], number> = {
  compact: 30,
  comfortable: 36,
  spacious: 44,
}
const rowHeight = computed(() => rowHeights[settings.graphRowDensity] ?? rowHeights.comfortable)
const width = computed(() => Math.max(props.laneCount, 1) * 3 * glyphWidth + railPadding * 2)
const height = computed(() => Math.max(props.rows.length * rowHeight.value, rowHeight.value))
type GraphCanvasStyle = ShellSettings['graphCanvasStyle']
type RenderProfile = {
  lineWidth: number
  nodeStrokeWidth: number
  nodeRadius: number
  headRadius: number
  diamondRadius: number
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
  glow: number
  mono: boolean
  hollowNodes: boolean
  squareNodes: boolean
}

const profiles: Record<GraphCanvasStyle, RenderProfile> = {
  classic: {
    lineWidth: 2.1,
    nodeStrokeWidth: 2.5,
    nodeRadius: 4.2,
    headRadius: 5.2,
    diamondRadius: 5,
    lineCap: 'round',
    lineJoin: 'round',
    glow: 0,
    mono: false,
    hollowNodes: false,
    squareNodes: false,
  },
  fine: {
    lineWidth: 1.35,
    nodeStrokeWidth: 2,
    nodeRadius: 3.5,
    headRadius: 4.5,
    diamondRadius: 4.4,
    lineCap: 'round',
    lineJoin: 'round',
    glow: 0,
    mono: false,
    hollowNodes: true,
    squareNodes: false,
  },
  bold: {
    lineWidth: 3,
    nodeStrokeWidth: 3,
    nodeRadius: 5,
    headRadius: 6,
    diamondRadius: 5.8,
    lineCap: 'round',
    lineJoin: 'round',
    glow: 0,
    mono: false,
    hollowNodes: false,
    squareNodes: false,
  },
  neon: {
    lineWidth: 2.35,
    nodeStrokeWidth: 2.4,
    nodeRadius: 4.6,
    headRadius: 5.8,
    diamondRadius: 5.4,
    lineCap: 'round',
    lineJoin: 'round',
    glow: 9,
    mono: false,
    hollowNodes: false,
    squareNodes: false,
  },
  mono: {
    lineWidth: 2,
    nodeStrokeWidth: 2.4,
    nodeRadius: 4.1,
    headRadius: 5.1,
    diamondRadius: 5,
    lineCap: 'round',
    lineJoin: 'round',
    glow: 0,
    mono: true,
    hollowNodes: true,
    squareNodes: false,
  },
  angular: {
    lineWidth: 2.2,
    nodeStrokeWidth: 2.2,
    nodeRadius: 4.4,
    headRadius: 5.4,
    diamondRadius: 5,
    lineCap: 'butt',
    lineJoin: 'miter',
    glow: 0,
    mono: false,
    hollowNodes: false,
    squareNodes: true,
  },
}

const profile = computed(() => profiles[settings.graphCanvasStyle] ?? profiles.classic)
const bends = computed(() => settings.graphBendStyle)
const collisions = computed(() => settings.graphCollisionStyle)
const nodeGlyph = computed(() => settings.graphNodeGlyph)

let frame = 0
let themeObserver: MutationObserver | null = null

function scheduleDraw() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    void draw()
  })
}

async function draw() {
  await nextTick()
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
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'

  for (const [rowIndex, row] of props.rows.entries()) {
    for (const [laneIndex, lane] of row.Lanes.entries()) {
      for (const [glyphIndex, glyph] of lane.Glyphs.entries()) {
        drawGlyph(ctx, glyph, laneIndex, glyphIndex, rowIndex)
      }
    }
  }
}

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  glyph: GraphGlyph,
  laneIndex: number,
  glyphIndex: number,
  rowIndex: number,
) {
  if (glyph.Kind === 'empty') return

  const lineWidth = crispWidth(profile.value.lineWidth)
  const x = railPadding + (laneIndex * 3 + glyphIndex) * glyphWidth
  const centerX = snap(x + glyphWidth / 2, lineWidth)
  const top = snap(rowIndex * rowHeight.value, lineWidth)
  const midY = snap(top + rowHeight.value / 2, lineWidth)
  const bottom = snap(top + rowHeight.value, lineWidth)
  const color = laneColor(glyph.ColorID)

  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = lineWidth
  ctx.shadowBlur = settings.graphCanvasStyle === 'neon' ? profile.value.glow : 0
  ctx.shadowColor = settings.graphCanvasStyle === 'neon' ? color : 'transparent'

  switch (glyph.Kind) {
    case 'vertical':
      drawPath(ctx, [
        [centerX, top - 1],
        [centerX, bottom + 1],
      ])
      break
    case 'horizontal':
      drawPath(ctx, [
        [x, midY],
        [x + glyphWidth, midY],
      ])
      break
    case 'top-left':
      drawBend(ctx, centerX, bottom + 1, x + glyphWidth, midY, 'right')
      break
    case 'top-right':
      drawBend(ctx, centerX, bottom + 1, x, midY, 'left')
      break
    case 'bot-left':
      drawBend(ctx, centerX, top - 1, x + glyphWidth, midY, 'right')
      break
    case 'bot-right':
      drawBend(ctx, centerX, top - 1, x, midY, 'left')
      break
    case 'vert-right':
      drawPath(ctx, [
        [centerX, top - 1],
        [centerX, bottom + 1],
      ])
      drawCollisionArm(ctx, x, centerX, x + glyphWidth, midY, 'right')
      break
    case 'vert-left':
      drawPath(ctx, [
        [centerX, top - 1],
        [centerX, bottom + 1],
      ])
      drawCollisionArm(ctx, x, centerX, x + glyphWidth, midY, 'left')
      break
    case 'cross':
      drawCross(ctx, x, centerX, x + glyphWidth, top, midY, bottom)
      break
    case 'node':
    case 'head-node':
    case 'unstaged-node':
      drawNodeLine(ctx, centerX, top, midY, bottom, color, glyph.ConnectTop, glyph.ConnectBottom)
      drawCircleNode(ctx, centerX, midY, glyph.Kind === 'head-node', color, glyph.Kind === 'unstaged-node')
      break
    case 'merge-node':
    case 'stash-node':
      drawNodeLine(ctx, centerX, top, midY, bottom, color, glyph.ConnectTop, glyph.ConnectBottom)
      drawDiamondNode(ctx, centerX, midY, glyph.Kind === 'stash-node')
      break
  }
}

function drawPath(ctx: CanvasRenderingContext2D, points: [number, number][]) {
  const first = points[0]
  if (!first) return

  ctx.beginPath()
  ctx.moveTo(first[0], first[1])
  for (const point of points.slice(1)) {
    ctx.lineTo(point[0], point[1])
  }
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
  if (bends.value === 'diagonal') {
    drawPath(ctx, [
      [verticalX, verticalY],
      [horizontalX, horizontalY],
    ])
    return
  }

  const elbowX = verticalX
  const elbowY = horizontalY
  if (bends.value === 'curve') {
    ctx.beginPath()
    ctx.moveTo(verticalX, verticalY)
    ctx.quadraticCurveTo(elbowX, elbowY, horizontalX, horizontalY)
    ctx.stroke()
    return
  }

  if (bends.value === 'rounded') {
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

  drawPath(ctx, [
    [verticalX, verticalY],
    [elbowX, elbowY],
    [horizontalX, horizontalY],
  ])
}

function drawCollisionArm(
  ctx: CanvasRenderingContext2D,
  leftX: number,
  centerX: number,
  rightX: number,
  midY: number,
  side: 'left' | 'right',
) {
  const gap = profile.value.lineWidth + 2
  const fromX = side === 'left' ? leftX : centerX
  const toX = side === 'left' ? centerX : rightX
  if (collisions.value === 'gap' || collisions.value === 'bridge') {
    const startX = side === 'left' ? fromX : centerX + gap
    const endX = side === 'left' ? centerX - gap : rightX
    drawPath(ctx, [
      [startX, midY],
      [endX, midY],
    ])
    return
  }
  if (collisions.value === 'fade') {
    ctx.save()
    ctx.globalAlpha = .45
    drawPath(ctx, [
      [fromX, midY],
      [toX, midY],
    ])
    ctx.restore()
    return
  }
  drawPath(ctx, [
    [fromX, midY],
    [toX, midY],
  ])
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
  drawPath(ctx, [
    [centerX, top - 1],
    [centerX, bottom + 1],
  ])

  const gap = profile.value.lineWidth + 2
  if (collisions.value === 'gap') {
    drawPath(ctx, [
      [leftX, midY],
      [centerX - gap, midY],
    ])
    drawPath(ctx, [
      [centerX + gap, midY],
      [rightX, midY],
    ])
    return
  }
  if (collisions.value === 'bridge') {
    drawPath(ctx, [
      [leftX, midY],
      [centerX - gap, midY],
    ])
    ctx.beginPath()
    ctx.moveTo(centerX - gap, midY)
    ctx.quadraticCurveTo(centerX, midY - 5, centerX + gap, midY)
    ctx.stroke()
    drawPath(ctx, [
      [centerX + gap, midY],
      [rightX, midY],
    ])
    return
  }
  if (collisions.value === 'fade') {
    ctx.save()
    ctx.globalAlpha = .42
    drawPath(ctx, [
      [leftX, midY],
      [rightX, midY],
    ])
    ctx.restore()
    return
  }
  drawPath(ctx, [
    [leftX, midY],
    [rightX, midY],
  ])
}

function drawNodeLine(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  top: number,
  midY: number,
  bottom: number,
  color: string,
  connectTop: boolean,
  connectBottom: boolean,
) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = profile.value.lineWidth
  if (connectTop) {
    drawPath(ctx, [
      [centerX, top - 1],
      [centerX, midY],
    ])
  }
  if (connectBottom) {
    drawPath(ctx, [
      [centerX, midY],
      [centerX, bottom + 1],
    ])
  }
  ctx.restore()
}

function drawCircleNode(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  isHead: boolean,
  color: string,
  isUnstaged = false,
) {
  const surface = themeVar('--surface')
  const radius = isHead ? profile.value.headRadius : profile.value.nodeRadius
  const glyph = nodeGlyph.value

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
  if (profile.value.hollowNodes || glyph === 'ring' || isUnstaged) ctx.fillStyle = surface
  ctx.fill()
  ctx.lineWidth = profile.value.nodeStrokeWidth
  ctx.strokeStyle = surface
  if (profile.value.hollowNodes || glyph === 'ring' || isUnstaged) ctx.strokeStyle = color
  ctx.stroke()

  if (isHead || isUnstaged) {
    ctx.beginPath()
    if (isUnstaged) {
      ctx.strokeStyle = color
      ctx.lineWidth = Math.max(1, profile.value.lineWidth - 0.5)
      ctx.moveTo(centerX, centerY - 3)
      ctx.lineTo(centerX, centerY + 3)
      ctx.stroke()
    } else {
      ctx.fillStyle = surface
      ctx.arc(centerX, centerY, 2.1, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawDiamondNode(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, isHollow: boolean) {
  const surface = themeVar('--surface')
  const radius = profile.value.diamondRadius
  const glyph = nodeGlyph.value
  const hollow = isHollow || profile.value.hollowNodes || glyph === 'ring'

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
}

function drawDiamondShape(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number) {
  ctx.moveTo(centerX, centerY - radius - 1)
  ctx.lineTo(centerX + radius, centerY)
  ctx.lineTo(centerX, centerY + radius + 1)
  ctx.lineTo(centerX - radius, centerY)
}

function drawTerminalShape(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number) {
  const width = radius * 1.7
  const height = radius * 2.35
  ctx.roundRect(centerX - width / 2, centerY - height / 2, width, height, 3)
}

function laneColor(colorID: number) {
  if (profile.value.mono) {
    return themeVar('--accent')
  }
  const colors = [
    themeVar('--accent'),
    themeVar('--green'),
    themeVar('--orange'),
    themeVar('--cyan'),
    themeVar('--red'),
    themeVar('--purple'),
    themeVar('--accent'),
  ]
  return colors[Math.abs(colorID) % colors.length] || colors[0] || '#7aa2f7'
}

function themeVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

watch(
  () => [
    props.rows,
    props.laneCount,
    settings.graphCanvasStyle,
    settings.graphBendStyle,
    settings.graphCollisionStyle,
    settings.graphNodeGlyph,
    settings.graphRowDensity,
  ],
  scheduleDraw,
  { deep: true },
)

onMounted(() => {
  scheduleDraw()
  themeObserver = new MutationObserver(scheduleDraw)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  themeObserver?.disconnect()
})
</script>

<template>
  <canvas
    ref="canvas"
    class="graph-canvas"
    :style="{ width: `${width}px`, height: `${height}px` }"
    aria-hidden="true"
  />
</template>
