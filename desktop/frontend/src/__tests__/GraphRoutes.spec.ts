import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { usePreferenceBindings } from '../customization/usePreferences'
import GraphSvg from '../components/graph/GraphSvg.vue'
import { GraphLayout, GraphRoute } from '../bindings/github.com/atterpac/ichi/desktop/services'
import { graphLaneCenter, graphRouteGeometry } from '../components/graph/graphRouteGeometry'
import layouts from '../sandbox/graph/routed-fixtures.json'

const appearance = {
  'graph.authorAvatars': false,
  'graph.renderStyle': 'classic' as const,
  'graph.bendStyle': 'rounded' as const,
  'graph.collisionStyle': 'gap' as const,
}

describe('Row-local parent routes', () => {
  it('decodes backend routes and draws every off-lane parent with its own color', () => {
    const graph = GraphLayout.createFrom(layouts['Crossings and converging parents'])
    const wrapper = mount(GraphSvg, {
      props: { rows: graph.Rows, laneCount: graph.LaneCount, appearance },
    })
    const routes = graph.Rows.flatMap((row) =>
      row.Routes.filter((route) => route.FromLane !== route.ToLane),
    )
    expect(wrapper.findAll('.graph-route')).toHaveLength(routes.length)
    const crossing = graph.Rows[3]!.Routes[0]!
    expect(crossing.Crossings).toEqual([1, 2])
    const rendered = wrapper
      .findAll('.graph-route')
      .find((node) => node.attributes('data-parent') === crossing.ParentHash)!
    expect(rendered.attributes('style')).toContain('--lane-3')
    expect(rendered.find('path').attributes('d')).toContain(' M')
    wrapper.unmount()
  })

  it('keeps all octopus arms distinct and ending on their parent rails', () => {
    const graph = GraphLayout.createFrom(layouts['Many new parents'])
    const routes = graph.Rows[0]!.Routes.filter((route) => route.FromLane !== route.ToLane)
    const paths = routes.map((route, track) =>
      graphRouteGeometry(route, track, routes.length, 34, 'rounded', 'gap', 2),
    )
    expect(new Set(paths.map((path) => path.y)).size).toBe(routes.length)
    for (const [i, geometry] of paths.entries()) {
      const route = routes[i]!
      expect(geometry.path).toMatch(
        new RegExp(`${graphLaneCenter(route.ToLane)},${geometry.y + 4} V34$`),
      )
    }
  })

  it.each(['gap', 'bridge', 'fade', 'cross'] as const)(
    'changes unrelated crossings, not the parent junction (%s)',
    (crossing) => {
      const route = new GraphRoute({
        ParentHash: 'P',
        FromLane: 3,
        ToLane: 0,
        ColorID: 3,
        Continues: true,
        Crossings: [1, 2],
      })
      const geometry = graphRouteGeometry(route, 0, 1, 42, 'rounded', crossing, 2)
      expect(geometry.path).toMatch(/Q23,21 23,25 V42$/)
      // The route encounters lane 2 before lane 1 when travelling left.
      const expected = {
        gap: { fragment: 'H87 M79,21 H57 M49,21', faded: 0 },
        fade: { fragment: 'H87 M79,21 H57 M49,21', faded: 2 },
        bridge: { fragment: 'H87 Q83,16 79,21 H57 Q53,16 49,21', faded: 0 },
        cross: { fragment: 'V21 H27', faded: 0 },
      }[crossing]
      expect(geometry.path).toContain(expected.fragment)
      expect(geometry.faded).toHaveLength(expected.faded)
    },
  )

  it('does not mutate shared settings with playground appearance overrides', () => {
    const before = { ...usePreferenceBindings() }
    const graph = GraphLayout.createFrom(layouts['Parents on both sides'])
    const wrapper = mount(GraphSvg, {
      props: {
        rows: graph.Rows,
        laneCount: graph.LaneCount,
        appearance: { ...appearance, 'graph.nodeGlyph': 'terminal' },
      },
    })
    expect(wrapper.findAll('.graph-route')).toHaveLength(2)
    expect({ ...usePreferenceBindings() }).toEqual(before)
    wrapper.unmount()
  })
})

it.each(Object.keys(layouts) as Array<keyof typeof layouts>)('preserves row-local routes across virtual boundaries: %s', (name) => {
  const graph = GraphLayout.createFrom(layouts[name])
  const full = mount(GraphSvg, { props: { rows: graph.Rows, laneCount: graph.LaneCount, rowHeight: 34, appearance } })
  try {
    for (let start = 0; start < graph.Rows.length; start += 2) {
      const slice = mount(GraphSvg, { props: {
        rows: graph.Rows.slice(start, start + 2), startIndex: start,
        totalRows: graph.Rows.length, laneCount: graph.LaneCount, rowHeight: 34, appearance,
      } })
      try {
        for (const row of slice.findAll('[data-graph-row]')) {
          const original = full.findAll('[data-graph-row]').find(candidate => candidate.attributes('data-graph-row') === row.attributes('data-graph-row'))!
          expect(row.attributes('transform')).toBe(original.attributes('transform'))
          expect(row.findAll('path').map(path => path.attributes('d'))).toEqual(original.findAll('path').map(path => path.attributes('d')))
        }
        expect(slice.get('svg').attributes('height')).toBe(full.get('svg').attributes('height'))
      } finally { slice.unmount() }
    }
  } finally { full.unmount() }
})
