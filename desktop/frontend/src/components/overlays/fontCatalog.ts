export type FontChoice = {
  family: string
  label: string
  monospace: boolean
  source: 'Bundled' | 'System' | 'Default' | 'Current'
}
export const bundledFonts: FontChoice[] = [
  ['Inter Variable', 'Inter', false],
  ['JetBrains Mono', 'JetBrains Mono', true],
  ['Source Sans 3 Variable', 'Source Sans 3', false],
  ['Public Sans Variable', 'Public Sans', false],
  ['Work Sans Variable', 'Work Sans', false],
  ['Manrope Variable', 'Manrope', false],
  ['Nunito Sans Variable', 'Nunito Sans', false],
  ['Literata Variable', 'Literata', false],
  ['Fira Code Variable', 'Fira Code', true],
  ['Source Code Pro Variable', 'Source Code Pro', true],
  ['Roboto Mono Variable', 'Roboto Mono', true],
  ['Inconsolata Variable', 'Inconsolata', true],
  ['IBM Plex Sans', 'IBM Plex Sans', false],
  ['IBM Plex Mono', 'IBM Plex Mono', true],
  ['Space Mono', 'Space Mono', true],
].map(([family, label, monospace]) => ({
  family: family as string,
  label: label as string,
  monospace: monospace as boolean,
  source: 'Bundled',
}))
export function fontChoices(
  system: { Family: string; Monospace: boolean }[],
  code: boolean,
  current: string,
  query: string,
): FontChoice[] {
  const defaults: FontChoice[] = [
    {
      family: code ? 'ui-monospace' : 'system-ui',
      label: code ? 'System monospace' : 'System interface',
      monospace: code,
      source: 'Default',
    },
  ]
  const choices = [
    ...defaults,
    ...bundledFonts,
    ...system.map((font) => ({
      family: font.Family,
      label: font.Family,
      monospace: font.Monospace,
      source: 'System' as const,
    })),
  ]
  const seen = new Set<string>()
  const unique = choices.filter((font) => {
    const key = font.family.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const selected = unique.find((font) => font.family === current)
  const filtered = unique.filter(
    (font) =>
      (!code || font.monospace) && font.label.toLowerCase().includes(query.trim().toLowerCase()),
  )
  // Keep an existing custom choice visible; discovery never resets a saved preference.
  if (current && !filtered.some((font) => font.family === current))
    filtered.unshift(
      selected || { family: current, label: current, monospace: code, source: 'Current' },
    )
  return filtered
}
