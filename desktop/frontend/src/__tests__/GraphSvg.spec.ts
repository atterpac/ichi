import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import GraphSvg from '../components/graph/GraphSvg.vue'
import SvgGraphConnector from '../components/graph/svg/SvgGraphConnector.vue'
import { usePreferenceBindings } from '../customization/usePreferences'
import type { GraphLayoutRow } from '../bindings/github.com/atterpac/ichi/desktop/services'

const settings = usePreferenceBindings()
const original = { ...settings }
beforeEach(() =>
  Object.assign(settings, {
    'graph.authorAvatars': false,
    'graph.renderStyle': 'classic',
    'graph.nodeGlyph': 'semantic',
    'graph.bendStyle': 'rounded',
    'graph.collisionStyle': 'gap',
    'graph.rowDensity': 'comfortable',
  }),
)
afterEach(() => Object.assign(settings, original))
const rows = [
  {
    Commit: { Hash: 'merge', Author: 'Author', Decorations: [] },
    Lanes: [
      {
        Glyphs: [
          { Kind: 'horizontal', ColorID: 2 },
          { Kind: 'merge-node', ColorID: 2, ConnectTop: true, ConnectBottom: true },
          { Kind: 'horizontal', ColorID: 2 },
        ],
      },
    ],
  },
] as unknown as GraphLayoutRow[]

describe('SVG graph renderer', () => {
  it('connects horizontal arms inside node cells and keeps nodes above their stems', () => {
    const wrapper = mount(GraphSvg, { props: { rows, laneCount: 1, rowHeight: 32 } })
    expect(wrapper.find('canvas').exists()).toBe(false)
    expect(wrapper.find('svg').element.namespaceURI).toBe('http://www.w3.org/2000/svg')
    const node = wrapper.find('[data-glyph="merge-node"]')
    expect(node.findAll('.node-stems path').map((p) => p.attributes('d'))).toEqual([
      'M5,0 V16',
      'M5,16 V32',
      'M0,16 H5',
      'M5,16 H10',
    ])
    expect(node.find('.node-marker path').exists()).toBe(true)
    expect(wrapper.find('.graph-ref-connector').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each(['vert-left', 'vert-right'] as const)(
    'keeps %s continuous while curving the branch, independent of crossing style',
    async (kind) => {
      const wrapper = mount(SvgGraphConnector, {
        props: { kind, height: 42, bend: 'rounded', crossing: 'gap' },
      })
      const paths = () => wrapper.findAll('path').map((p) => p.attributes('d'))
      const rounded = paths()
      expect(rounded).toHaveLength(2)
      expect(rounded[0]).toBe('M5,0 V42')
      expect(rounded[1]).toContain('Q')
      expect(rounded[1]).toMatch(kind === 'vert-left' ? /H0$/ : /H10$/)
      await wrapper.setProps({ crossing: 'bridge' })
      expect(paths()).toEqual(rounded)
      await wrapper.setProps({ bend: 'curve' })
      expect(paths()[0]).toBe('M5,0 V42')
      expect(paths()[1]).not.toBe(rounded[1])
      wrapper.unmount()
    },
  )

  it('reacts to profiles, shape and density settings without manual redraws', async () => {
    const wrapper = mount(GraphSvg, { props: { rows, laneCount: 1 } })
    expect(wrapper.find('svg').attributes('height')).toBe('28')
    settings['graph.nodeGlyph'] = 'terminal'
    settings['graph.renderStyle'] = 'mono'
    settings['graph.rowDensity'] = 'compact'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('svg').attributes('height')).toBe('24')
    expect(wrapper.find('.node-marker rect').attributes('rx')).toBe('3')
    expect(wrapper.find('[data-glyph="merge-node"]').attributes('style')).toContain('var(--accent)')
    expect(wrapper.find('.node-marker').attributes('fill')).toBe('var(--graph-surface)')
    settings['graph.renderStyle'] = 'neon'
    settings['graph.nodeGlyph'] = 'ring'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-glyph="merge-node"]').attributes('style')).toContain('drop-shadow')
    expect(wrapper.find('.node-marker circle').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows ref connectors only for decorated commits', async () => {
    const wrapper = mount(GraphSvg, { props: { rows, laneCount: 1, showRefConnections: true } })
    expect(wrapper.find('.graph-ref-connector').exists()).toBe(false)
    await wrapper.setProps({
      rows: [
        { ...rows[0]!, Commit: { ...rows[0]!.Commit!, Decorations: [{}] } },
      ] as GraphLayoutRow[],
    })
    expect(wrapper.find('.graph-ref-connector').exists()).toBe(true)
    await wrapper.setProps({ showRefConnections: false })
    expect(wrapper.find('.graph-ref-connector').exists()).toBe(false)
    wrapper.unmount()
  })
})

it('keeps slice coordinates and glyph objects stable across horizontal scrolling', async () => {
  const wrapper = mount(GraphSvg, {
    props: { rows, laneCount: 20, startIndex: 100, totalRows: 500, viewportWidth: 160 },
  })
  try {
    const { default: SvgGraphGlyph } = await import('../components/graph/svg/SvgGraphGlyph.vue')
    const cells = wrapper.findAllComponents(SvgGraphGlyph)
    const glyphs = cells.map(cell => cell.props('glyph'))
    const routesBefore = wrapper.findAll('.node-stems path').map(path => path.attributes('d'))
    expect(wrapper.get('[data-graph-row="merge"]').attributes('transform')).toBe('translate(0 2800)')
    expect(wrapper.get('.graph-rails').attributes('height')).toBe('14000')
    await wrapper.setProps({ scrollOffset: 300, viewportWidth: 200 })
    expect(wrapper.get('.graph-lanes').attributes('transform')).toBe('translate(-300 0)')
    wrapper.findAllComponents(SvgGraphGlyph).forEach((cell, i) => expect(cell.props('glyph')).toBe(glyphs[i]))
    expect(wrapper.findAll('.node-stems path').map(path => path.attributes('d'))).toEqual(routesBefore)
    expect(wrapper.get('.graph-band').attributes('x')).toBe('0')
  } finally { wrapper.unmount() }
})
