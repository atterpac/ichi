import { describe, expect, it } from 'vitest'
import { laneColorVar, rowLaneColorVar } from '../components/graph/laneColors'
import {
  GraphLayoutRow,
  GraphLane,
  GraphGlyph,
} from '../bindings/github.com/atterpac/ichi/desktop/services/models'

describe('graph lane colors', () => {
  it('uses the commit node color rather than a crossing lane', () => {
    const row = new GraphLayoutRow({
      Lanes: [
        new GraphLane({ Glyphs: [new GraphGlyph({ Kind: 'vert', ColorID: 1 })] }),
        new GraphLane({ Glyphs: [new GraphGlyph({ Kind: 'head-node', ColorID: 3 })] }),
      ],
    })
    expect(rowLaneColorVar(row)).toBe('--lane-3')
    expect(laneColorVar(5)).toBe('--lane-0')
    expect(laneColorVar(4)).toBe('--lane-4')
  })
})
