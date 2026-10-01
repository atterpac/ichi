import { designStyles, designSvg, type DesignStyle } from './avatarDesigns'

export const placeholderStyles = designStyles
export type PlaceholderStyle = DesignStyle
export const defaultPlaceholderStyle: PlaceholderStyle = 'face'
export function isPlaceholderStyle(value: unknown): value is PlaceholderStyle {
  return placeholderStyles.some((style) => style.id === value)
}
export function placeholderSvg(name: string, style: PlaceholderStyle): string {
  // Settings saved before a style was retired fall back instead of breaking avatars.
  return designSvg(name, isPlaceholderStyle(style) ? style : defaultPlaceholderStyle)
}
