import { watch, type Ref } from 'vue'
import { THEMES } from '../theme/themes'
import type { PreferenceValues } from './registry'

export function installPreferenceAppearance(values: Ref<PreferenceValues>) {
  const root = document.documentElement
  const originalThemes = THEMES.filter((theme) => root.classList.contains(`theme-${theme.id}`))
  const originalTokens = new Map<string, { value: string; priority: string }>()
  let applied = new Set<string>()
  const appearanceIds = [
    'appearance.theme',
    'appearance.uiFont',
    'appearance.codeFont',
    'appearance.textScale',
    'appearance.radius',
    'appearance.accent',
    'appearance.background',
    'appearance.surface',
    'appearance.text',
  ] as const
  const stop = watch(
    appearanceIds.map((id) => () => values.value[id]),
    () => {
      const settings = values.value
      THEMES.forEach((theme) => root.classList.remove(`theme-${theme.id}`))
      root.classList.add(`theme-${settings['appearance.theme']}`)
      const tokens: Record<string, string> = {}
      const stack = (font: string, fallback: string) =>
        ['system-ui', 'ui-monospace'].includes(font) ? font : `${JSON.stringify(font)}, ${fallback}`
      tokens['--font-ui'] = stack(settings['appearance.uiFont'], 'system-ui, sans-serif')
      tokens['--font-mono'] = stack(settings['appearance.codeFont'], 'ui-monospace, monospace')
      tokens['--font-code'] = 'var(--font-mono)'
      const scale = settings['appearance.textScale'] / 100
      for (const [name, size] of Object.entries({
        '2xs': 10,
        xs: 11,
        sm: 12,
        md: 13,
        'body-lg': 14,
        lg: 16,
        xl: 20,
      }))
        tokens[`--fs-${name}`] = `${size * scale}px`
      const radius = settings['appearance.radius']
      tokens['--control-radius'] = `${radius}px`
      for (const [key, offset] of Object.entries({ xs: -1, sm: 0, md: 1, lg: 3, xl: 5 }))
        tokens[`--radius-${key}`] = `${Math.max(0, radius + offset)}px`
      for (const [name, token] of [
        ['accent', '--accent'],
        ['background', '--bg'],
        ['surface', '--surface'],
        ['text', '--text'],
      ] as const) {
        const value = settings[`appearance.${name}`]
        if (value) tokens[token] = value
      }
      if (settings['appearance.accent']) {
        tokens['--accent-text'] = settings['appearance.accent']
        tokens['--lane-0'] = settings['appearance.accent']
      }
      if (settings['appearance.text']) tokens['--head'] = settings['appearance.text']
      if (settings['appearance.surface']) {
        tokens['--surface-2'] = 'color-mix(in oklab, var(--surface) 92%, var(--text))'
        tokens['--surface-raised-gen'] = 'color-mix(in oklab, var(--surface) 96%, var(--text))'
        tokens['--surface-overlay-gen'] = 'color-mix(in oklab, var(--surface) 90%, var(--text))'
      }
      for (const key of applied) if (!(key in tokens)) root.style.removeProperty(key)
      for (const [key, value] of Object.entries(tokens)) {
        if (!originalTokens.has(key))
          originalTokens.set(key, {
            value: root.style.getPropertyValue(key),
            priority: root.style.getPropertyPriority(key),
          })
        root.style.setProperty(key, value)
      }
      applied = new Set(Object.keys(tokens))
    },
    { immediate: true, flush: 'sync' },
  )
  return () => {
    stop()
    THEMES.forEach((theme) => root.classList.remove(`theme-${theme.id}`))
    for (const theme of originalThemes) root.classList.add(`theme-${theme.id}`)
    for (const [key, original] of originalTokens) {
      if (original.value) root.style.setProperty(key, original.value, original.priority)
      else root.style.removeProperty(key)
    }
  }
}
