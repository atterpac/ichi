import type { GraphLayoutRow } from '../../bindings/github.com/atterpac/ichi/desktop/services'

// Graph routes and refs share one five-color palette. Red belongs to Git status.
export const LANE_COLOR_VARS = ['--lane-0', '--lane-1', '--lane-2', '--lane-3', '--lane-4'] as const
export function laneColorVar(colorID: number): string {
  return LANE_COLOR_VARS[Math.abs(Math.trunc(colorID)) % LANE_COLOR_VARS.length] ?? '--lane-0'
}
export function rowLaneColorVar(row: GraphLayoutRow): string {
  const node = row.Lanes.flatMap((lane) => lane.Glyphs).find((glyph) =>
    ['node', 'merge-node', 'head-node', 'unstaged-node'].includes(glyph.Kind),
  )
  return laneColorVar(node?.ColorID ?? 0)
}
