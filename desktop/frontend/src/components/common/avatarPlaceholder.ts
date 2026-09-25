import { auroraStyle, auroraSvg } from './avatarAurora'
import { pixelCreature, pixelStyles, type PixelStyle } from './avatarPixels'
import { palettes, random, seedHash } from './avatarSeed'

export const placeholderStyles = [...pixelStyles, auroraStyle] as const
export type PlaceholderStyle = PixelStyle | 'aurora'
export function isPlaceholderStyle(value: unknown): value is PlaceholderStyle {
  return placeholderStyles.some((style) => style.id === value)
}
export function placeholderSvg(name: string, style: PlaceholderStyle): string {
  if (style === 'aurora') return auroraSvg(name)
  const r = random(seedHash(`${style}:${name}`))
  const palette = palettes[Math.floor(r() * palettes.length)]!
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">${pixelCreature(style, r, palette)}</svg>`
}
