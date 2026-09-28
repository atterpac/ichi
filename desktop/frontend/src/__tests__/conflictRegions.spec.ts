import { describe, expect, it } from 'vitest'
import {
  conflictRegions,
  hasConflictMarkers,
  resolveRegion,
} from '../components/conflicts/conflictRegions'
describe('Conflict region resolution', () => {
  it('preserves auto-merged context and other regions', () => {
    const conflict = '<<<<<<< HEAD\ncurrent\n||||||| base\nbase\n=======\nincoming\n>>>>>>> topic\n'
    const content = `auto merged before\n${conflict}auto merged middle\n${conflict}after\n`
    const regions = conflictRegions(content)
    expect(regions).toHaveLength(2)
    expect(regions[0]!.base).toBe('base\n')
    const result = resolveRegion(content, regions[0]!, 'incoming')
    expect(result).toBe(`auto merged before\nincoming\nauto merged middle\n${conflict}after\n`)
    expect(conflictRegions(result)).toHaveLength(1)
  })
  it('preserves CRLF and a missing final newline', () => {
    const content = 'before\r\n<<<<<<< HEAD\r\ncurrent\r\n=======\r\nincoming\r\n>>>>>>> topic'
    expect(resolveRegion(content, conflictRegions(content)[0]!, 'both')).toBe(
      'before\r\ncurrent\r\nincoming',
    )
  })
  it('handles custom marker lengths and refuses to consider malformed markers resolved', () => {
    const content = '<<<<< HEAD\na\n=====\nb\n>>>>> topic\n'
    expect(conflictRegions(content, 5)).toHaveLength(1)
    expect(hasConflictMarkers(content, 5)).toBe(true)
    expect(
      hasConflictMarkers(resolveRegion(content, conflictRegions(content, 5)[0]!, 'current'), 5),
    ).toBe(false)
    expect(conflictRegions('<<<<<<< HEAD\nunclosed')).toEqual([])
    expect(hasConflictMarkers('<<<<<<< HEAD\nunclosed')).toBe(true)
  })
})
