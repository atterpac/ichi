export type ConnectorKind =
  | 'vertical'
  | 'horizontal'
  | 'top-left'
  | 'top-right'
  | 'bot-left'
  | 'bot-right'
  | 'vert-left'
  | 'vert-right'
  | 'cross'
export type NodeKind = 'node' | 'head-node' | 'merge-node' | 'stash-node' | 'unstaged-node'
export type GlyphKind = ConnectorKind | NodeKind | 'empty'
export type BendStyle = 'rounded' | 'curve' | 'diagonal' | 'square' | 'elbow'
export type NodeShape = 'semantic' | 'circle' | 'diamond' | 'square' | 'ring' | 'terminal'
export type CrossingStyle = 'gap' | 'bridge' | 'continuous' | 'cross' | 'fade'
export interface Glyph {
  kind: GlyphKind
  color?: string
  crossingColor?: string
  top?: boolean
  bottom?: boolean
  left?: boolean
  right?: boolean
  /** Stash links to a base commit, which are not history. */
  dashed?: boolean
}
export const connectors: ConnectorKind[] = [
  'vertical',
  'horizontal',
  'top-left',
  'top-right',
  'bot-left',
  'bot-right',
  'vert-left',
  'vert-right',
  'cross',
]
export const nodes: NodeKind[] = ['node', 'head-node', 'merge-node', 'stash-node', 'unstaged-node']
