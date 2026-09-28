import { describe, expect, it } from 'vitest'
import { Commit, RefDecoration } from '../bindings/github.com/atterpac/ichi/internal/git'
import { branchLabels } from '../components/graph/branchLabels'

function commit(hash: string, parents: string[] = [], name?: string, kind = 'branch') {
  return new Commit({
    Hash: hash,
    Parents: parents,
    Decorations: name ? [new RefDecoration({ Name: name, Kind: kind })] : [],
  })
}

describe('graph branch hover labels', () => {
  it('follows separate branch histories and gives shared history to the current branch', () => {
    const labels = branchLabels([
      commit('feature', ['feature-parent'], 'feature'),
      commit('main', ['base', 'feature'], 'main'),
      commit('feature-parent', ['base']),
      commit('base'),
    ], 'main')
    expect(labels.get('feature-parent')).toBe('feature')
    expect(labels.get('base')).toBe('main')
    expect(labels.get('feature')).toBe('feature')
  })

  it('supports remote branches without treating tags as branches', () => {
    const labels = branchLabels([
      commit('remote-tip', ['older'], 'upstream/feature', 'remote'),
      commit('older'),
      commit('tag-only', [], 'v1.0', 'tag'),
    ], '')
    expect(labels.get('older')).toBe('upstream/feature')
    expect(labels.has('tag-only')).toBe(false)
  })

  it('preserves branch tips encountered in another branch history', () => {
    const labels = branchLabels([
      commit('main', ['other'], 'main'),
      commit('other', ['base'], 'other'),
      commit('base'),
    ], 'main')
    expect(labels.get('other')).toBe('other')
    expect(labels.get('__ichi_working_changes__')).toBe('main')
  })
})
