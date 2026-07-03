import { reactive, watch } from 'vue'
import { DEFAULT_THEME, isThemeId, THEMES, type ThemeId } from '../theme/themes'

export interface ShellSettings {
  theme: ThemeId
  navCollapsed: boolean
  graphLimit: number
  graphShowAuthor: boolean
  graphRowDensity: 'compact' | 'comfortable' | 'spacious'
  graphDetailPosition: 'right' | 'bottom' | 'hidden'
  graphDetailHash: 'short' | 'full'
  graphDetailShowAuthorDate: boolean
  graphCanvasStyle: 'classic' | 'fine' | 'bold' | 'neon' | 'mono' | 'angular'
  graphBendStyle: 'elbow' | 'rounded' | 'curve' | 'diagonal'
  graphCollisionStyle: 'cross' | 'bridge' | 'gap' | 'fade'
  graphNodeGlyph: 'semantic' | 'circle' | 'diamond' | 'square' | 'ring' | 'terminal'
  diffLayout: 'unified' | 'split' | 'inline' | 'changes' | 'result'
  diffWordHighlights: boolean
  diffDensity: 'compact' | 'comfortable' | 'relaxed'
  changesGroupByDir: 'auto' | 'always' | 'never'
  branchesGrouped: boolean
  branchesDetailVisible: boolean
  confirmDestructiveActions: boolean
}

const STORAGE_KEY = 'ichi.desktop.settings'

/** pre-port theme names → their dado equivalents */
const LEGACY_THEMES: Record<string, ThemeId> = {
  night: 'tokyonight-night',
  storm: 'tokyonight-storm',
  moon: 'tokyonight-moon',
  day: 'tokyonight-day',
}

const defaults: ShellSettings = {
  theme: DEFAULT_THEME,
  navCollapsed: false,
  graphLimit: 120,
  graphShowAuthor: true,
  graphRowDensity: 'comfortable',
  graphDetailPosition: 'right',
  graphDetailHash: 'full',
  graphDetailShowAuthorDate: true,
  graphCanvasStyle: 'classic',
  graphBendStyle: 'elbow',
  graphCollisionStyle: 'cross',
  graphNodeGlyph: 'semantic',
  diffLayout: 'unified',
  diffWordHighlights: true,
  diffDensity: 'comfortable',
  changesGroupByDir: 'auto',
  branchesGrouped: false,
  branchesDetailVisible: true,
  confirmDestructiveActions: true,
}

function load(): Partial<ShellSettings> {
  try {
    const stored: Record<string, unknown> = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (typeof stored.theme === 'string' && stored.theme in LEGACY_THEMES) {
      stored.theme = LEGACY_THEMES[stored.theme]
    }
    if (!isThemeId(stored.theme)) delete stored.theme
    // retired layout values (e.g. 'fluid') fall back to the default
    if (typeof stored.diffLayout === 'string' && !['unified', 'split', 'inline', 'changes', 'result'].includes(stored.diffLayout)) {
      delete stored.diffLayout
    }
    // drop keys from retired settings so they stop round-tripping through storage
    return Object.fromEntries(Object.entries(stored).filter(([key]) => key in defaults)) as Partial<ShellSettings>
  } catch {
    return {}
  }
}

const settings = reactive<ShellSettings>({ ...defaults, ...load() })

function applyTheme() {
  const root = document.documentElement
  THEMES.forEach((theme) => root.classList.remove(`theme-${theme.id}`))
  root.classList.add(`theme-${settings.theme}`)
}

function clearRetiredStyling() {
  const root = document.documentElement
  const stale = Array.from(root.classList).filter((cls) => cls.startsWith('kbd-'))
  if (stale.length) root.classList.remove(...stale)
  root.style.removeProperty('--roundness')
}

applyTheme()
clearRetiredStyling()
watch(() => settings.theme, applyTheme)
watch(settings, () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* storage unavailable — settings just won't persist */
  }
}, { deep: true })

export function useShellSettings(): ShellSettings {
  return settings
}
