import type { PreferenceValues } from '../../customization/usePreferences'

export const GRAPH_ROW_HEIGHTS: Record<PreferenceValues['graph.rowDensity'], number> = {
  compact: 24,
  comfortable: 28,
  spacious: 32,
}
