import { auroraStyle, auroraSvg } from '../../components/common/avatarAurora'
import { seedHash, random, palettes } from '../../components/common/avatarSeed'
export { seedHash } from '../../components/common/avatarSeed'
import { pixelCreature, pixelStyles, type PixelStyle } from '../../components/common/avatarPixels'

export const avatarStyles = [
  {
    id: 'weave',
    name: 'Loom',
    category: 'TEXTILE',
    description: 'Interlocking ribbons. A tiny piece of woven fabric.',
    note: 'Strong color blocks at small sizes.',
  },
  {
    id: 'stars',
    name: 'Star chart',
    category: 'CELESTIAL',
    description: 'A personal constellation, drawn across a midnight sky.',
    note: 'Airy and quiet beside dense code.',
  },
  {
    id: 'contour',
    name: 'Terrain',
    category: 'TOPOGRAPHIC',
    description: 'Nested contours form an imaginary island.',
    note: 'Organic identity without a face.',
  },
  {
    id: 'glass',
    name: 'Prism',
    category: 'GEOMETRIC',
    description: 'A cut-glass silhouette with asymmetric colored facets.',
    note: 'Distinct silhouette, even in a busy list.',
  },
  {
    id: 'plant',
    name: 'Herbarium',
    category: 'BOTANICAL',
    description: 'A branching specimen with its own leaves and blossoms.',
    note: 'A softer, more human feeling.',
  },
  {
    id: 'sprite',
    name: 'Bitkin',
    category: 'CHARACTER',
    description: 'A little pixel creature with a recognizable expression.',
    note: 'Playful, with a face you can remember.',
  },
  auroraStyle,
  ...pixelStyles,
] as const
export type AvatarStyle = (typeof avatarStyles)[number]['id']

const n = (value: number) => Number(value.toFixed(2))
const point = (x: number, y: number) => `${n(x)},${n(y)}`

/** Only generated numbers and fixed palette colors enter the SVG markup. */
export function avatarSvg(input: string, style: AvatarStyle): string {
  if (style === 'aurora') return auroraSvg(input)
  const r = random(seedHash(`${style}:${input}`))
  const palette = palettes[Math.floor(r() * palettes.length)]!
  const color = () => palette[Math.floor(r() * palette.length)]!
  let art = ''
  if (style === 'weave') {
    art = '<rect x="4" y="4" width="92" height="92" rx="12" fill="#20242a"/>'
    const colors = Array.from({ length: 5 }, color)
    const offset = Math.floor(r() * 5)
    for (let i = 0; i < 5; i++) {
      art += `<rect x="${12 + i * 16}" y="10" width="12" height="80" rx="3" fill="${colors[i]}"/>`
      art += `<rect x="10" y="${12 + i * 16}" width="80" height="12" rx="3" fill="${colors[(i + offset) % 5]}"/>`
    }
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++) {
        if ((x + y + offset) % 2 === 0)
          art += `<path d="M${18 + x * 16} ${10 + y * 16}v16" stroke="#15191d" stroke-width="16"/><path d="M${18 + x * 16} ${10 + y * 16}v16" stroke="${colors[x]}" stroke-width="12"/>`
      }
  } else if (style === 'stars') {
    art = '<rect x="2" y="2" width="96" height="96" rx="24" fill="#141e32"/>'
    for (let i = 0; i < 16; i++)
      art += `<circle cx="${n(10 + r() * 80)}" cy="${n(10 + r() * 80)}" r=".65" fill="#a8bbd5" opacity=".35"/>`
    const points = Array.from({ length: 6 }, (_, i) => ({
      x: 16 + i * 13 + r() * 7,
      y: 20 + r() * 60,
    }))
    art += `<polyline points="${points.map((p) => point(p.x, p.y)).join(' ')}" fill="none" stroke="${palette[0]}" stroke-width="2" opacity=".7"/>`
    points.forEach((p, i) => {
      art += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${i === 2 ? 5 : n(2 + r() * 1.5)}" fill="${i === 2 ? palette[1] : '#eef2ff'}"/>`
      if (i === 2)
        art += `<path d="M${n(p.x - 9)} ${n(p.y)}h18M${n(p.x)} ${n(p.y - 9)}v18" stroke="${palette[1]}" stroke-width="1.4"/>`
    })
  } else if (style === 'contour') {
    art = '<rect x="2" y="2" width="96" height="96" rx="16" fill="#192b29"/>'
    const phase = r() * Math.PI * 2
    const lobes = 3 + Math.floor(r() * 4)
    const cx = 44 + r() * 12,
      cy = 44 + r() * 12
    for (let ring = 0; ring < 7; ring++) {
      const radius = 39 - ring * 5
      const points = Array.from({ length: 96 }, (_, i) => {
        const a = (i / 96) * Math.PI * 2
        const d = radius * (1 + 0.13 * Math.sin(a * lobes + phase) + 0.08 * Math.cos(a * 2 - phase))
        return point(cx + Math.cos(a) * d, cy + Math.sin(a) * d)
      })
      art += `<polygon points="${points.join(' ')}" fill="${ring === 6 ? palette[0] : 'none'}" stroke="${ring % 3 === 0 ? palette[0] : palette[2]}" stroke-width="1.8" stroke-linejoin="round"/>`
    }
  } else if (style === 'glass') {
    const sides = 5 + Math.floor(r() * 3),
      phase = r() * 1.5
    const cx = 37 + r() * 22,
      cy = 37 + r() * 22
    const points = Array.from({ length: sides }, (_, i) => {
      const angle = (i / sides) * Math.PI * 2 + phase
      const radius = 34 + r() * 13
      return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius }
    })
    points.forEach((p, i) => {
      const q = points[(i + 1) % sides]!
      art += `<polygon points="${point(cx, cy)} ${point(p.x, p.y)} ${point(q.x, q.y)}" fill="${palette[i % 4]}" stroke="#20242a" stroke-width="1.2" stroke-linejoin="round"/>`
      if (i % 2 === 0)
        art += `<polygon points="${point(cx, cy)} ${point(p.x, p.y)} ${point((p.x + q.x) / 2, (p.y + q.y) / 2)}" fill="#fff" opacity=".15"/>`
    })
  } else if (style === 'plant') {
    art = '<rect x="8" y="2" width="84" height="96" rx="40" fill="#e9e3cf"/>'
    const lean = -12 + r() * 24
    art += `<path d="M50 88Q${n(43 + lean)} 53 ${n(50 + lean)} 15" fill="none" stroke="#426458" stroke-width="3" stroke-linecap="round"/>`
    const count = 3 + Math.floor(r() * 3)
    for (let i = 0; i < count; i++) {
      const y = 76 - i * 11,
        x = 50 + lean * (1 - y / 100),
        side = i % 2 === 0 ? -1 : 1
      const tipX = x + side * (18 + r() * 12),
        tipY = y - 12 - r() * 8
      art += `<path d="M${point(x, y)}Q${point(tipX, y + 4)} ${point(tipX, tipY)}Q${point(x, tipY - 2)} ${point(x, y)}" fill="${i % 2 ? '#6d9573' : '#426458'}"/>`
      art += `<path d="M${point(x, y)}L${point(tipX, tipY)}" stroke="#e9e3cf" opacity=".4" stroke-width="1"/>`
    }
    const petals = 4 + Math.floor(r() * 3),
      bloom = color()
    for (let i = 0; i < petals; i++) {
      const angle = (i / petals) * Math.PI * 2
      art += `<circle cx="${n(50 + lean + Math.cos(angle) * 7)}" cy="${n(18 + Math.sin(angle) * 7)}" r="5.5" fill="${bloom}"/>`
    }
    art += `<circle cx="${n(50 + lean)}" cy="18" r="3.5" fill="#795b3b"/>`
  } else if (style !== 'sprite') {
    art = pixelCreature(style as PixelStyle, r, palette)
  } else {
    const body = color(),
      secondary = color(),
      eye = 3 + Math.floor(r() * 2)
    art = '<rect x="2" y="2" width="96" height="96" rx="18" fill="#222033"/>'
    art += `<g shape-rendering="crispEdges">`
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 5; x++) {
        const on = y >= 2 && y <= 6 ? x >= 1 || r() > 0.4 : r() > 0.55
        if (!on) continue
        const fill = y > 6 ? secondary : body
        art += `<rect x="${14 + x * 8}" y="${14 + y * 8}" width="8" height="8" fill="${fill}"/>`
        if (x < 4)
          art += `<rect x="${78 - x * 8}" y="${14 + y * 8}" width="8" height="8" fill="${fill}"/>`
      }
    art += `<path d="M30 ${14 + eye * 8}h12v8H30zM58 ${14 + eye * 8}h12v8H58z" fill="#faf0db"/><path d="M34 ${14 + eye * 8}h4v8h-4zM62 ${14 + eye * 8}h4v8h-4z" fill="#222033"/>`
    art += `<path d="M42 62h16v4H42z" fill="#222033"/></g>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">${art}</svg>`
}
