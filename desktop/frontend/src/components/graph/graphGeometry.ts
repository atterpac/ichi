// Keep SVG rails, avatar overlays, and table columns on the same grid.
export const GRAPH_GLYPH_WIDTH = 10
export const GRAPH_RAIL_PADDING = 8
export function graphRailWidth(laneCount: number): number {
  return Math.max(laneCount, 1) * 3 * GRAPH_GLYPH_WIDTH + GRAPH_RAIL_PADDING * 2
}
