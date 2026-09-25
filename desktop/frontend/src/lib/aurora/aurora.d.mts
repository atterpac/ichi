export const VERSION: 1
export function cyrb128(seed: string): [number, number, number, number]
export function sfc32(a: number, b: number, c: number, d: number): () => number
export function rngFor(seed: string): () => number
export function hslToRgb(h: number, s: number, l: number): [number, number, number]
export function palette(seed: string): { base: number; colors: [number, number, number][]; dark: [number, number, number] }
export function auroraParams(seed: string): { y: number; a: number; f: number; ph: number; a2: number; f2: number; w: number; colorIndex: number }[]
export function renderAurora(seed: string, size?: number): Uint8ClampedArray
