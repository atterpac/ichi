import { renderAurora } from '../../lib/aurora/aurora.mjs'
import { browserPng } from '../../lib/aurora/browserPng'

export const auroraStyle = {
  id: 'aurora',
  name: 'Aurora',
  category: 'NORTHERN LIGHTS',
  description: 'Glowing ribbons that fade upward like curtains of light.',
  note: 'Soft light and flowing silhouettes against a midnight sky.',
} as const

// Keep the existing SVG preview interface, embedding exact raster pixels.
// Names stay local, and the bounded cache avoids rerendering repeated authors.
const cache = new Map<string, string>()
export function auroraSvg(name: string): string {
  const cached = cache.get(name)
  if (cached) return cached
  const bytes = browserPng(renderAurora(name, 128), 128)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none"><image width="100" height="100" href="data:image/png;base64,${btoa(binary)}"/></svg>`
  cache.set(name, svg)
  if (cache.size > 128) cache.delete(cache.keys().next().value!)
  return svg
}
