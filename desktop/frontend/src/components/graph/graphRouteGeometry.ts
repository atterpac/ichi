import { GRAPH_GLYPH_WIDTH, GRAPH_RAIL_PADDING } from './graphGeometry'
import type { GraphRoute } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import type { BendStyle, CrossingStyle } from './svg/types'

export function graphLaneCenter(lane: number): number {
  return GRAPH_RAIL_PADDING + (lane * 3 + 1.5) * GRAPH_GLYPH_WIDTH
}

/** Independent horizontal tracks keep octopus edges from becoming false junctions. */
export function graphRouteGeometry(
  route: GraphRoute,
  track: number,
  count: number,
  height: number,
  bend: BendStyle,
  crossing: CrossingStyle,
  strokeWidth: number,
): { path: string; faded: string[]; y: number } {
  const from = graphLaneCenter(route.FromLane)
  const to = graphLaneCenter(route.ToLane)
  const mid = height / 2
  const y = mid + track * Math.min(6, Math.max(0, mid - 6) / Math.max(1, count - 1))
  if (from === to) return { path: `M${from},${mid} V${height}`, faded: [], y }
  const direction = Math.sign(to - from)
  const radius = Math.min(4, (y - mid) / 2)
  let path = `M${from},${mid}`
  if (radius > 0 && (bend === 'rounded' || bend === 'curve')) {
    path += ` V${y - radius} Q${from},${y} ${from + direction * radius},${y}`
  } else {
    path += ` V${y}`
  }
  const faded: string[] = []
  const gap = Math.min(5, strokeWidth + 2)
  // Crossings are listed left-to-right by Go; walk them in route direction.
  const crossings = [...route.Crossings].sort((a, b) => direction * (a - b))
  for (const lane of crossings) {
    const x = graphLaneCenter(lane)
    const before = x - direction * gap
    const after = x + direction * gap
    if (crossing === 'gap' || crossing === 'fade') {
      path += ` H${before} M${after},${y}`
      if (crossing === 'fade') faded.push(`M${before},${y} H${after}`)
    } else if (crossing === 'bridge') {
      path += ` H${before} Q${x},${y - 5} ${after},${y}`
    }
  }
  const cornerX = to - (direction * GRAPH_GLYPH_WIDTH) / 2
  if (bend === 'diagonal') path += ` H${cornerX} L${to},${height}`
  else if (bend === 'curve') path += ` H${cornerX} Q${to},${y} ${to},${height}`
  else if (bend === 'rounded') {
    const r = Math.min(4, height - y)
    path += ` H${to - direction * r} Q${to},${y} ${to},${y + r} V${height}`
  } else path += ` H${to} V${height}`
  return { path, faded, y }
}
