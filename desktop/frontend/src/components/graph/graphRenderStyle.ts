import type { PreferenceValues } from '../../customization/usePreferences'

type GraphRenderStyle = PreferenceValues['graph.renderStyle']
export type RenderProfile = {
  lineWidth: number
  nodeStrokeWidth: number
  nodeRadius: number
  headRadius: number
  diamondRadius: number
  lineCap: 'round' | 'butt' | 'square'
  lineJoin: 'round' | 'miter' | 'bevel'
  glow: number
  mono: boolean
  hollowNodes: boolean
  squareNodes: boolean
}

export const profiles: Record<GraphRenderStyle, RenderProfile> = {
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
