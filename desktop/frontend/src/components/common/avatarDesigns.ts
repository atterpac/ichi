import { random, seedHash } from './avatarSeed'

export const designStyles = [
  {
    id: 'pixel',
    name: 'Pixel',
    category: 'MIRRORED GRID',
    description: 'A symmetric 5×5 sprite, like a tiny invader.',
    note: 'The most legible silhouette at 16 pixels.',
  },
  {
    id: 'truchet',
    name: 'Truchet',
    category: 'WOVEN TILES',
    description: 'Quarter-circle tiles that join into a flowing two-tone maze.',
    note: 'Pattern-led identity with soft curves.',
  },
  {
    id: 'bauhaus',
    name: 'Bauhaus',
    category: 'POSTER BLOCKS',
    description: 'Four checkerboard cells with bold primary shapes.',
    note: 'Strong color blocks that read at any size.',
  },
  {
    id: 'topo',
    name: 'Topo',
    category: 'CONTOUR BANDS',
    description: 'Stacked wavy bands shading from light to dark.',
    note: 'Calm and organic beside dense code.',
  },
  {
    id: 'face',
    name: 'Blob',
    category: 'LITTLE CHARACTERS',
    description: 'A rounded creature with ears, antennae, and an expression.',
    note: 'A face is the fastest thing to recognize.',
  },
] as const
export type DesignStyle = (typeof designStyles)[number]['id']
export type Rng = () => number

// [ink, tint]
const PALETTE = [
  ['#E4572E', '#FCE3DB'],
  ['#E09F12', '#FDF0D2'],
  ['#2E9E6A', '#D8F1E4'],
  ['#1B998B', '#D3EFEC'],
  ['#2F6FDE', '#DCE7FB'],
  ['#5B4BD6', '#E3E0FA'],
  ['#B5449B', '#F5DDEF'],
  ['#D63A5E', '#F9DCE3'],
  ['#6F8A1F', '#ECF0D6'],
  ['#2B3A55', '#DDE2EC'],
] as const
const BAUHAUS = ['#D7263D', '#1B4FBF', '#F2B701', '#22252B', '#F1ECE2', '#2A9D8F'] as const
const FACE_INK = '#1B1E2B'

const int = (r: Rng, n: number) => Math.floor(r() * n)
const pick = <T>(r: Rng, items: readonly T[]): T => items[int(r, items.length)]!
const n = (value: number) => Number(value.toFixed(2))

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
function mix(a: string, b: string, t: number) {
  const to = rgb(b)
  return `#${rgb(a)
    .map((v, i) => Math.round(v + (to[i]! - v) * t).toString(16).padStart(2, '0'))
    .join('')}`
}
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

type Point = readonly [number, number]
/** Catmull-Rom through the points, as cubic Bézier path data. */
function smooth(pts: readonly Point[], closed = false) {
  const len = pts.length
  const at = (i: number) => pts[closed ? (i + len) % len : Math.max(0, Math.min(len - 1, i))]!
  let d = `M${n(pts[0]![0])} ${n(pts[0]![1])}`
  for (let i = 0; i < (closed ? len : len - 1); i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    d +=
      `C${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)} ` +
      `${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)} ${n(p2[0])} ${n(p2[1])}`
  }
  return closed ? `${d}Z` : d
}

function pixel(r: Rng) {
  const [ink, tint] = pick(r, PALETTE)
  const cells = Array.from({ length: 15 }, () => r() < 0.5)
  let on = cells.filter(Boolean).length
  // Keep every sprite between sparse and solid.
  while (on < 6 || on > 11) {
    const i = int(r, 15)
    if (cells[i] === on > 11) {
      cells[i] = !cells[i]
      on += cells[i] ? 1 : -1
    }
  }
  // Cells overlap slightly so neighbours never show an antialiased seam.
  let body = ''
  cells.forEach((v, i) => {
    if (!v) return
    const x = i % 3,
      y = Math.floor(i / 3)
    for (const cx of x === 2 ? [2] : [x, 4 - x])
      body += `<rect x="${15 + cx * 14}" y="${15 + y * 14}" width="14.4" height="14.4" fill="${ink}"/>`
  })
  return { body, bg: tint }
}

function truchet(r: Rng) {
  const [ink, tint] = pick(r, PALETTE)
  const size = 4,
    s = 100 / size,
    h = s / 2
  let body = ''
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const flip = r() < 0.5
      const X = x * s,
        Y = y * s
      // Ink alternates on a vertex checkerboard, so regions match across tile edges.
      if (((x + y) % 2 === 1) !== flip) {
        for (const [cx, cy] of flip ? [[1, 0], [0, 1]] : [[0, 0], [1, 1]]) {
          const CX = X + cx! * s,
            CY = Y + cy! * s
          const dx = cx ? -1 : 1,
            dy = cy ? -1 : 1
          body += `<path d="M${n(CX)} ${n(CY)}L${n(CX + dx * h)} ${n(CY)}A${n(h)} ${n(h)} 0 0 ${dx * dy > 0 ? 1 : 0} ${n(CX)} ${n(CY + dy * h)}Z"/>`
        }
      } else if (!flip) {
        body += `<path d="M${n(X + h)} ${n(Y)}H${n(X + s)}V${n(Y + h)}A${n(h)} ${n(h)} 0 0 0 ${n(X + h)} ${n(Y + s)}H${n(X)}V${n(Y + h)}A${n(h)} ${n(h)} 0 0 0 ${n(X + h)} ${n(Y)}Z"/>`
      } else {
        body += `<path d="M${n(X)} ${n(Y)}H${n(X + h)}A${n(h)} ${n(h)} 0 0 0 ${n(X + s)} ${n(Y + h)}V${n(Y + s)}H${n(X + h)}A${n(h)} ${n(h)} 0 0 0 ${n(X)} ${n(Y + h)}Z"/>`
      }
    }
  // A hairline stroke in the same ink closes seams where neighbouring tiles meet.
  return {
    body: `<g fill="${ink}" stroke="${ink}" stroke-width="0.8" stroke-linejoin="round">${body}</g>`,
    bg: tint,
  }
}

// Corner shapes are anchored at the cell's top-left and never placed in the outer
// corner, where a round mask would cut them into fragments.
const BAUHAUS_SHAPES = [
  [(c: string) => `<path d="M0 0H50A50 50 0 0 1 0 50Z" fill="${c}"/>`, 'corner'],
  [(c: string) => `<path d="M0 0H50L0 50Z" fill="${c}"/>`, 'corner'],
  [(c: string) => `<path d="M0 50A25 25 0 0 1 50 50Z" fill="${c}"/>`, 'free'],
  [(c: string) => `<circle cx="25" cy="25" r="16" fill="${c}"/>`, 'free'],
  [(c: string) => `<path d="M0 50A50 50 0 0 1 50 0A50 50 0 0 1 0 50Z" fill="${c}"/>`, 'leaf'],
] as const
const OUTER_ROTATION = [0, 90, 270, 180]

function bauhaus(r: Rng) {
  const pool: string[] = [...BAUHAUS]
  const [a, b, c] = [0, 1, 2].map(() => pool.splice(int(r, pool.length), 1)[0]!) as [string, string, string]
  // Checkerboard grounds plus one shape color, so cells never bleed into each other.
  let body = `<rect x="50" width="50" height="50" fill="${b}"/><rect y="50" width="50" height="50" fill="${b}"/>`
  for (let i = 0; i < 4; i++) {
    const [draw, kind] = pick(r, BAUHAUS_SHAPES)
    const rotation =
      kind === 'corner'
        ? (OUTER_ROTATION[i]! + 90 * (1 + int(r, 3))) % 360
        : kind === 'leaf'
          ? i === 0 || i === 3
            ? 0
            : 90
          : int(r, 4) * 90
    body += `<g transform="translate(${(i % 2) * 50} ${Math.floor(i / 2) * 50}) rotate(${rotation} 25 25)" stroke="${c}" stroke-width="0.8">${draw(c)}</g>`
  }
  return { body, bg: a }
}

function topo(r: Rng) {
  let [ink, tint]: [string, string] = [...pick(r, PALETTE)]
  if (r() < 0.5) [ink, tint] = [tint, ink]
  const bands = 6,
    gap = 100 / bands
  const a1 = 4 + r() * 5,
    f1 = 0.04 + r() * 0.04,
    p1 = r() * 6.28
  const a2 = 2 + r() * 3,
    f2 = 0.09 + r() * 0.06,
    p2 = r() * 6.28
  const drift = (r() - 0.5) * 0.8
  const tilt = pick(r, [-24, -12, 0, 12, 24])
  let body = ''
  for (let k = -2; k <= bands + 2; k++) {
    const pts: Point[] = []
    for (let x = -40; x <= 140; x += 10)
      pts.push([x, k * gap + a1 * Math.sin(x * f1 + p1 + k * drift) + a2 * Math.sin(x * f2 + p2 - k * drift * 0.5)])
    const t = Math.max(0, Math.min(1, k / bands))
    body += `<path d="${smooth(pts)}L140 170L-40 170Z" fill="${mix(tint, ink, t)}"/>`
  }
  return { body: `<g transform="rotate(${tilt} 50 50)">${body}</g>`, bg: tint }
}

function face(r: Rng) {
  const pi = int(r, PALETTE.length)
  const body = PALETTE[pi]![0]
  const bg = PALETTE[(pi + 3 + int(r, 4)) % PALETTE.length]![1]
  const fc = luminance(body) < 0.15 ? '#FFFFFF' : FACE_INK
  const line = `fill="none" stroke="${fc}" stroke-width="3.2" stroke-linecap="round"`

  // Superellipse silhouette: 2 is an ellipse, higher is squarer; pear skews the width.
  const cx = 50,
    cy = 58
  const a = 28 + r() * 7,
    b = 27 + r() * 6
  const exponent = pick(r, [2, 2.6, 3.4])
  const pear = pick(r, [0, 0, 0.12, -0.08])
  const pts: Point[] = []
  for (let i = 0; i < 24; i++) {
    const t = (i / 24) * Math.PI * 2,
      c = Math.cos(t),
      s = Math.sin(t)
    const y = b * Math.sign(s) * Math.abs(s) ** (2 / exponent)
    pts.push([cx + a * Math.sign(c) * Math.abs(c) ** (2 / exponent) * (1 + pear * (y / b)), cy + y])
  }
  const top = cy - b

  // Accessories share the body color so the silhouette reads as one shape.
  const accessories = [
    () => '',
    () =>
      [-1, 1]
        .map((d) => `<circle cx="${n(cx + d * a * 0.62)}" cy="${n(top + 5)}" r="${n(8 + b * 0.08)}" fill="${body}"/>`)
        .join(''),
    () =>
      [-1, 1]
        .map(
          (d) =>
            `<path d="M${n(cx + d * a * 0.25)} ${n(top + 8)}L${n(cx + d * a * 0.7)} ${n(top - 9)}L${n(cx + d * a * 0.85)} ${n(top + 12)}Z" fill="${body}" stroke="${body}" stroke-width="5" stroke-linejoin="round"/>`,
        )
        .join(''),
    () =>
      `<path d="M${cx} ${n(top + 4)}V${n(top - 9)}" stroke="${body}" stroke-width="3.2" stroke-linecap="round"/><circle cx="${cx}" cy="${n(top - 11)}" r="4.5" fill="${body}"/>`,
    () => [-9, 0, 9].map((dx) => `<circle cx="${cx + dx}" cy="${n(top + 2 - (dx ? 0 : 3))}" r="6" fill="${body}"/>`).join(''),
  ]
  const accessory = pick(r, accessories)()

  const ex = a * (0.32 + r() * 0.1),
    ey = cy - b * (0.12 + r() * 0.12)
  const lx = (r() - 0.5) * 4,
    ly = (r() - 0.5) * 3
  const eyes = [
    `<circle r="4.5" fill="${fc}"/>`,
    `<circle r="7" fill="#FFFFFF"/><circle cx="${n(lx)}" cy="${n(ly)}" r="3.5" fill="${FACE_INK}"/>`,
    `<path d="M-5 2Q0 -5 5 2" ${line}/>`,
    `<path d="M-5 -1Q0 4 5 -1" ${line}/>`,
    `<ellipse rx="3.6" ry="5.5" fill="${fc}"/>`,
  ]
  const eyeL = pick(r, eyes)
  const eyeR = r() < 0.12 ? eyes[2]! : eyeL
  const mouths = [
    `<path d="M-8 0Q0 8 8 0" ${line}/>`,
    `<path d="M-9 -1Q0 14 9 -1Z" fill="${fc}"/>`,
    `<circle r="4" fill="${fc}"/>`,
    `<path d="M-6 0H6" ${line}/>`,
    `<path d="M-7 1Q2 6 8 -2" ${line}/>`,
    `<path d="M-8 -1Q-4 4 0 -1Q4 4 8 -1" ${line}/>`,
  ]
  const my = ey + b * (0.36 + r() * 0.12)
  const cheeks =
    r() < 0.5
      ? [-1, 1]
          .map((d) => `<ellipse cx="${n(cx + d * (ex + 7))}" cy="${n(ey + 9)}" rx="5" ry="3.5" fill="#FF8FA3" opacity=".65"/>`)
          .join('')
      : ''
  const tilt = n((r() - 0.5) * 12)

  return {
    body:
      `<g transform="rotate(${tilt} ${cx} ${cy})">${accessory}<path d="${smooth(pts, true)}" fill="${body}"/>${cheeks}` +
      `<g transform="translate(${n(cx - ex)} ${n(ey)}) scale(1.2)">${eyeL}</g>` +
      `<g transform="translate(${n(cx + ex)} ${n(ey)}) scale(1.2)">${eyeR}</g>` +
      `<g transform="translate(${cx} ${n(my)}) scale(1.2)">${pick(r, mouths)}</g></g>`,
    bg,
  }
}

const generators: Record<DesignStyle, (r: Rng) => { body: string; bg: string }> = {
  pixel,
  truchet,
  bauhaus,
  topo,
  face,
}

/** Only generated numbers and fixed palette colors enter the SVG markup. */
export function designSvg(name: string, style: DesignStyle): string {
  const hash = seedHash(`${style}:${name}`)
  const { body, bg } = generators[style](random(hash))
  // A mask (not clip-path) composites the art first and cuts once, so lower layers
  // can't bleed through the antialiased edge as a light halo.
  const id = `avatar-${style}-${hash.toString(36)}`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">` +
    `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" rx="18" fill="#fff"/></mask></defs>` +
    `<g mask="url(#${id})"><rect width="100" height="100" fill="${bg}"/>${body}</g></svg>`
  )
}
