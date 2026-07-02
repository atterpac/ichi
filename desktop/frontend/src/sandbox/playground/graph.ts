/**
 * Self-contained graph model for the onboarding playground — a cell-based
 * port of the real GraphCanvas glyph vocabulary so the preview (and the
 * onboarding tree rail) render exactly like the app's commit graph.
 */

export type CanvasStyle = 'classic' | 'fine' | 'bold' | 'neon' | 'mono' | 'angular'
export type BendStyle = 'elbow' | 'rounded' | 'curve' | 'diagonal'
export type CollisionStyle = 'cross' | 'bridge' | 'gap' | 'fade'
export type NodeGlyph = 'semantic' | 'circle' | 'diamond' | 'square' | 'ring' | 'terminal'
export type RowDensity = 'compact' | 'comfortable' | 'spacious'

export interface GraphSettings {
  canvas: CanvasStyle
  bend: BendStyle
  collision: CollisionStyle
  glyph: NodeGlyph
  density: RowDensity
}

export type GlyphKind =
  | 'vertical'
  | 'horizontal'
  | 'top-left'
  | 'top-right'
  | 'bot-left'
  | 'bot-right'
  | 'cross'
  | 'node'
  | 'head-node'
  | 'merge-node'

export interface GraphCell {
  /** column index — even columns are lanes, odd columns carry horizontal arms */
  c: number
  kind: GlyphKind
  color: number
  ct?: boolean
  cb?: boolean
}

export type GraphRow = GraphCell[]

export const CELL_W = 13
export const RAIL_PAD = 8

/** center x of a column, in canvas pixels — used to align HTML overlays */
export function laneCenter(col: number): number {
  return RAIL_PAD + col * CELL_W + CELL_W / 2
}

export interface RenderProfile {
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

/** mirrors the app's GraphCanvas render profiles */
export const PROFILES: Record<CanvasStyle, RenderProfile> = {
  classic: {
    lineWidth: 2.1, nodeStrokeWidth: 2.5, nodeRadius: 4.2, headRadius: 5.2, diamondRadius: 5,
    lineCap: 'round', lineJoin: 'round', glow: 0, mono: false, hollowNodes: false, squareNodes: false,
  },
  fine: {
    lineWidth: 1.35, nodeStrokeWidth: 2, nodeRadius: 3.5, headRadius: 4.5, diamondRadius: 4.4,
    lineCap: 'round', lineJoin: 'round', glow: 0, mono: false, hollowNodes: true, squareNodes: false,
  },
  bold: {
    lineWidth: 3, nodeStrokeWidth: 3, nodeRadius: 5, headRadius: 6, diamondRadius: 5.8,
    lineCap: 'round', lineJoin: 'round', glow: 0, mono: false, hollowNodes: false, squareNodes: false,
  },
  neon: {
    lineWidth: 2.35, nodeStrokeWidth: 2.4, nodeRadius: 4.6, headRadius: 5.8, diamondRadius: 5.4,
    lineCap: 'round', lineJoin: 'round', glow: 9, mono: false, hollowNodes: false, squareNodes: false,
  },
  mono: {
    lineWidth: 2, nodeStrokeWidth: 2.4, nodeRadius: 4.1, headRadius: 5.1, diamondRadius: 5,
    lineCap: 'round', lineJoin: 'round', glow: 0, mono: true, hollowNodes: true, squareNodes: false,
  },
  angular: {
    lineWidth: 2.2, nodeStrokeWidth: 2.2, nodeRadius: 4.4, headRadius: 5.4, diamondRadius: 5,
    lineCap: 'butt', lineJoin: 'miter', glow: 0, mono: false, hollowNodes: false, squareNodes: true,
  },
}

export const PREVIEW_ROW_HEIGHTS: Record<RowDensity, number> = {
  compact: 26,
  comfortable: 32,
  spacious: 40,
}

/**
 * Demo history for the settings preview. Exercises every glyph the options
 * touch: head node, plain nodes, merge diamonds, bends on fork + merge rows,
 * and a lane crossing (row 3) so collision styles are visible.
 */
export const PREVIEW_ROWS: GraphRow[] = [
  [{ c: 0, kind: 'head-node', color: 0, cb: true }],
  [
    { c: 0, kind: 'merge-node', color: 0, ct: true, cb: true },
    { c: 1, kind: 'horizontal', color: 1 },
    { c: 2, kind: 'top-right', color: 1 },
  ],
  [
    { c: 0, kind: 'vertical', color: 0 },
    { c: 2, kind: 'node', color: 1, ct: true, cb: true },
  ],
  [
    { c: 0, kind: 'merge-node', color: 0, ct: true, cb: true },
    { c: 1, kind: 'horizontal', color: 2 },
    { c: 2, kind: 'cross', color: 1 },
    { c: 3, kind: 'horizontal', color: 2 },
    { c: 4, kind: 'top-right', color: 2 },
  ],
  [
    { c: 0, kind: 'vertical', color: 0 },
    { c: 2, kind: 'vertical', color: 1 },
    { c: 4, kind: 'node', color: 2, ct: true, cb: true },
  ],
  [
    { c: 0, kind: 'vertical', color: 0 },
    { c: 2, kind: 'node', color: 1, ct: true, cb: true },
    { c: 4, kind: 'vertical', color: 2 },
  ],
  [
    { c: 0, kind: 'node', color: 0, ct: true, cb: true },
    { c: 2, kind: 'vertical', color: 1 },
    { c: 4, kind: 'vertical', color: 2 },
  ],
  [
    { c: 0, kind: 'node', color: 0, ct: true, cb: true },
    { c: 1, kind: 'horizontal', color: 1 },
    { c: 2, kind: 'bot-right', color: 1 },
    { c: 4, kind: 'vertical', color: 2 },
  ],
  [
    { c: 0, kind: 'node', color: 0, ct: true, cb: true },
    { c: 1, kind: 'horizontal', color: 2 },
    { c: 2, kind: 'horizontal', color: 2 },
    { c: 3, kind: 'horizontal', color: 2 },
    { c: 4, kind: 'bot-right', color: 2 },
  ],
  [{ c: 0, kind: 'node', color: 0, ct: true }],
]

export interface PreviewLabel {
  sha: string
  msg: string
  ref?: string
}

export const PREVIEW_LABELS: PreviewLabel[] = [
  { sha: 'f3a9c21', msg: 'graph: restore focus after modal', ref: 'HEAD' },
  { sha: '7be04d5', msg: 'Merge feature/theme into main', ref: 'main' },
  { sha: '9c1e88a', msg: 'theme: add rosepine palette' },
  { sha: 'd4127fb', msg: 'Merge feature/graph into main' },
  { sha: 'ab99e04', msg: 'graph: bridge lane collisions', ref: 'feature/graph' },
  { sha: '4e0c7aa', msg: 'theme: token pass on borders' },
  { sha: 'c58d112', msg: 'core: reactive settings store' },
  { sha: '31f6b9d', msg: 'graph: lane layout engine' },
  { sha: '88a2c04', msg: 'desktop: scaffold wails shell' },
  { sha: '95b3f94', msg: 'init ichi' },
]

/** hex → hue-rotated hex, so extra lane colors track the active theme */
export function shiftHue(hex: string, degrees: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2])
  const [r, g, b] = hslToRgb((((h + degrees) % 360) + 360) % 360, s, l)
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function parseHex(hex: string): [number, number, number] | null {
  const value = hex.trim().replace(/^#/, '')
  if (value.length === 3) {
    const [r, g, b] = value
    return [parseInt(r! + r, 16), parseInt(g! + g, 16), parseInt(b! + b, 16)]
  }
  if (value.length >= 6) {
    const r = parseInt(value.slice(0, 2), 16)
    const g = parseInt(value.slice(2, 4), 16)
    const b = parseInt(value.slice(4, 6), 16)
    if ([r, g, b].every((n) => Number.isFinite(n))) return [r, g, b]
  }
  return null
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60
  return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    t = ((t % 1) + 1) % 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const hue = h / 360
  return [
    Math.round(channel(hue + 1 / 3) * 255),
    Math.round(channel(hue) * 255),
    Math.round(channel(hue - 1 / 3) * 255),
  ]
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
}
