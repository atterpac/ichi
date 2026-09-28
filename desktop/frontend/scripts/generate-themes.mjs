#!/usr/bin/env node
// Generates src/theme/themes.css and src/theme/themes.ts from local and dado defs.
// Ichi source: src/theme/defs/*.yaml; imported themes: <dado>/theme/themes/defs/*.yaml.
// Override the dado location with DADO_DIR.
// Run: pnpm gen:themes — commit the generated output.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defsDir = process.env.DADO_DIR
  ? join(process.env.DADO_DIR, 'theme/themes/defs')
  : resolve(frontendDir, '../../../dado/theme/themes/defs')

const DEFAULT_THEME = 'ichi'

const LABELS = {
  tokyonight: 'Tokyo Night',
  github: 'GitHub',
  rosepine: 'Rosé Pine',
  onedark: 'One Dark',
  onelight: 'One Light',
  catppuccin: 'Catppuccin',
}
const LABEL_OVERRIDES = {
  'tokyonight-night': 'Tokyo Night',
}

function parseDef(text) {
  const name = text.match(/^name:\s*(\S+)/m)?.[1]
  const colors = {}
  for (const [, key, hex] of text.matchAll(/^\s{2}(\w+):\s*"(#[0-9a-fA-F]{6})"/gm)) {
    colors[key] = hex.toLowerCase()
  }
  return { name, colors }
}

function rgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}

function toHex(channels) {
  return `#${channels.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`
}

function mix(a, b, amount) {
  const ca = rgb(a)
  const cb = rgb(b)
  return toHex(ca.map((c, i) => c + (cb[i] - c) * amount))
}

function isLight(hex) {
  const [r, g, b] = rgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 128
}

function luminance(hex) {
  const [r, g, b] = rgb(hex).map((c) => {
    c /= 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Smallest mix of `from` toward `to` that satisfies `ok`.
function mixUntil(from, to, ok) {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (ok(mix(from, to, mid))) hi = mid
    else lo = mid
  }
  return mix(from, to, hi)
}

// Small metadata must remain readable on every elevation, including overlays.
function tuneMut(mut, surfaces, text) {
  const readable = (hex) => surfaces.every(surface => contrast(hex, surface) >= 4.5)
  if (!readable(mut)) return mixUntil(mut, text, readable)
  return mut
}

function label(id) {
  if (LABEL_OVERRIDES[id]) return LABEL_OVERRIDES[id]
  return id
    .split('-')
    .map((part) => LABELS[part] ?? part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function readDefs(dir) {
  return readdirSync(dir)
  .filter((file) => file.endsWith('.yaml'))
  .map((file) => parseDef(readFileSync(join(dir, file), 'utf8')))
  .filter((def) => def.name && def.colors.bg)
}

// App-owned palettes take precedence over imported definitions.
const themes = [...new Map([
  ...readDefs(defsDir),
  ...readDefs(join(frontendDir, 'src/theme/defs')),
].map((def) => [def.name, def])).values()]
  .sort((a, b) => a.name.localeCompare(b.name))

if (!themes.some((t) => t.name === DEFAULT_THEME)) {
  throw new Error(`default theme "${DEFAULT_THEME}" not found in ${defsDir}`)
}

function cssBlock({ name, colors: c }) {
  const light = isLight(c.bg)
  const selector = name === DEFAULT_THEME ? `:root,\n.theme-${name}` : `.theme-${name}`
  // Layering must be monotonic regardless of how the def orders its bg tones
  // (rosepine ships surface darker than bg): dark stacks lightest-on-top,
  // light keeps the lightest tone for cards with the page slightly darker.
  const layers = [c.bg_dark, c.bg, c.bg_light].sort((a, b) => luminance(a) - luminance(b))
  const surface = light ? mix(layers[2], '#000000', .025) : layers[1]
  const bg = light ? mix(surface, '#000000', .04) : layers[0]
  const surface2 = light ? layers[0] : layers[2]
  // Some palettes sit bg/surface/raised within a few luminance points of each
  // other. Push dark raised panels a touch lighter and give window chrome its
  // own darker step so the frame, working card, and inspectors always separate.
  const raised = light ? mix(layers[2], '#ffffff', .6) : mix(mix(surface, surface2, .65), '#ffffff', .03)
  const chrome = mix(bg, '#000000', light ? .06 : .18)
  const overlay = mix(raised, '#ffffff', light ? .65 : .035)
  const head = light ? mix(c.fg, '#000000', 0.35) : mix(c.fg, '#ffffff', 0.3)
  const accentInk = contrast(c.accent, '#151515') >= contrast(c.accent, '#ffffff') ? '#151515' : '#ffffff'
  const textSurfaces = [chrome, bg, surface, raised, overlay]
  const textTarget = light ? '#000000' : '#ffffff'
  const readableText = tuneMut(c.fg, textSurfaces, textTarget)
  const accentText = tuneMut(c.accent, textSurfaces, textTarget)
  const positiveText = tuneMut(c.success, textSurfaces, textTarget)
  const negativeText = tuneMut(c.error, textSurfaces, textTarget)
  const warningText = tuneMut(c.warning, textSurfaces, textTarget)
  const mut = tuneMut(c.fg_dim, textSurfaces, light ? '#000000' : '#ffffff')
  const vars = [
    // native chrome (select popups, scrollbars) keys off color-scheme, not CSS vars
    `color-scheme:${light ? 'light' : 'dark'};`,
    `--bg:${bg};--surface:${surface};--surface-2:${surface2};`,
    `--surface-chrome-gen:${chrome};--surface-raised-gen:${raised};--surface-overlay-gen:${overlay};`,
    `--text:${readableText};--text-mut:${mut};--head:${head};`,
    `--accent-text:${accentText};--positive-text:${positiveText};--negative-text:${negativeText};--warning-text:${warningText};`,
    `--accent:${c.accent};--accent-ink:${accentInk};`,
    `--lane-0:${c.accent};--lane-1:${c.success};--lane-2:${c.warning};--lane-3:${c.info};--lane-4:${c.accent_dim};`,
    `--green:${c.success};--orange:${c.warning};--red:${c.error};--purple:${c.accent_dim};--cyan:${c.info};--star:${c.warning};`,
  ]
  if (light) {
    vars.push('--elev-1: 0 1px 2px rgba(30,35,60,.08);--elev-2: -8px 0 20px -16px rgba(30,35,60,.2);--elev-3: 0 12px 32px -8px rgba(30,35,60,.22);')
    vars.push('--shadow-1: 0 1px 2px rgba(30,35,60,.1);--shadow-2: 0 8px 24px -4px rgba(30,35,60,.18);')
  } else {
    // Black-on-black shadows carry no elevation cue; a faint inset top
    // highlight does the work on dark surfaces.
    vars.push('--elev-1: inset 0 1px 0 rgba(255,255,255,.04), 0 1px 2px rgba(0,0,0,.2);--elev-2: -8px 0 20px -16px rgba(0,0,0,.35);--elev-3: inset 0 1px 0 rgba(255,255,255,.05), 0 12px 32px -8px rgba(0,0,0,.5);')
    vars.push('--shadow-1: 0 1px 2px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04);--shadow-2: 0 8px 24px -4px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.05);')
  }
  return `${selector} {\n  ${vars.join('\n  ')}\n}`
}

const cssHeader = '/* Generated by scripts/generate-themes.mjs from local and dado theme defs. DO NOT EDIT. */'
const featured = [DEFAULT_THEME, 'ichi-light']
const ordered = [
  ...featured.map((name) => themes.find((t) => t.name === name)).filter(Boolean),
  ...themes.filter((t) => !featured.includes(t.name)),
]
writeFileSync(join(frontendDir, 'src/theme/themes.css'), `${cssHeader}\n\n${ordered.map(cssBlock).join('\n\n')}\n`)

const tsEntries = ordered
  .map(({ name, colors }) => `  { id: '${name}', label: '${label(name)}', light: ${isLight(colors.bg)} },`)
  .join('\n')
const ts = `// Generated by scripts/generate-themes.mjs from local and dado theme defs. DO NOT EDIT.

export const THEMES = [
${tsEntries}
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export const DEFAULT_THEME: ThemeId = '${DEFAULT_THEME}'

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}

export function isLightTheme(id: string): boolean {
  return THEMES.find((theme) => theme.id === id)?.light ?? false
}
`
writeFileSync(join(frontendDir, 'src/theme/themes.ts'), ts)

console.log(`generated ${themes.length} themes from ${defsDir}`)
