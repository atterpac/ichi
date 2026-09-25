import { pixelCreature, pixelStyles, type PixelStyle } from './avatarPixels'
import { palettes, random, seedHash } from './avatarSeed'

export { pixelStyles as placeholderStyles }
export type PlaceholderStyle = PixelStyle
export function isPlaceholderStyle(value: unknown): value is PlaceholderStyle {
  return pixelStyles.some((style) => style.id === value)
}
export function placeholderSvg(name: string, style: PlaceholderStyle): string {
  const r = random(seedHash(`${style}:${name}`))
  const palette = palettes[Math.floor(r() * palettes.length)]!
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">${pixelCreature(style, r, palette)}</svg>`
}

// Render the same rectangles directly on the graph canvas: no image loading or
// first-frame initials, and a bounded cache for long histories.
type Pixel = { x: number; y: number; w: number; h: number; fill: string }
const cache = new Map<string, Pixel[]>()
export function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  name: string,
  style: PlaceholderStyle,
  x: number,
  y: number,
  size: number,
) {
  const key = JSON.stringify([name, style])
  let pixels = cache.get(key)
  if (!pixels) {
    const svg = new DOMParser().parseFromString(placeholderSvg(name, style), 'image/svg+xml')
    pixels = Array.from(svg.querySelectorAll('rect'), (rect) => ({
      x: Number(rect.getAttribute('x')),
      y: Number(rect.getAttribute('y')),
      w: Number(rect.getAttribute('width')),
      h: Number(rect.getAttribute('height')),
      fill: rect.getAttribute('fill')!,
    }))
    cache.set(key, pixels)
    if (cache.size > 256) cache.delete(cache.keys().next().value!)
  }
  for (const pixel of pixels) {
    ctx.fillStyle = pixel.fill
    ctx.fillRect(
      x + (pixel.x * size) / 100,
      y + (pixel.y * size) / 100,
      (pixel.w * size) / 100,
      (pixel.h * size) / 100,
    )
  }
}
