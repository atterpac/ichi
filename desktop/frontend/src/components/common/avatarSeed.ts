export function seedHash(input: string): number {
  let hash = 2166136261
  for (const char of input.normalize('NFC')) {
    hash ^= char.codePointAt(0)!
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
export function random(seed: number) {
  return () => {
    seed += 0x6d2b79f5
    let value = Math.imul(seed ^ (seed >>> 15), seed | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
export const palettes = [
  ['#f5bc73', '#e96f61', '#79b6a0', '#606fac'],
  ['#b9a0ee', '#6abec3', '#ed9ac2', '#e8c989'],
  ['#ef805d', '#edc96b', '#729daa', '#456a75'],
  ['#80c9a4', '#c4d37e', '#559fab', '#e6a474'],
  ['#7c9fe0', '#d18ca5', '#9dcaba', '#c7b58e'],
] as const
