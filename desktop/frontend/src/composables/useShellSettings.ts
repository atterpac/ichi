import { reactive, watch } from 'vue'
import { DEFAULT_THEME, isThemeId, THEMES, type ThemeId } from '../theme/themes'
import { isPlaceholderStyle, type PlaceholderStyle } from '../components/common/avatarPlaceholder'

export interface ShellSettings {
  theme: ThemeId
  graphLimit: number
  graphShowAuthor: boolean
  graphAuthorAvatars: boolean
  avatarPlaceholder: PlaceholderStyle
  graphRowDensity: 'compact' | 'comfortable' | 'spacious'
  graphDetailPosition: 'right' | 'bottom' | 'hidden'
  graphDetailWidth: number
  graphDetailHash: 'short' | 'full'
  graphDetailShowAuthorDate: boolean
  graphCanvasStyle: 'classic' | 'fine' | 'bold' | 'neon' | 'mono' | 'angular'
  graphBendStyle: 'elbow' | 'rounded' | 'curve' | 'diagonal'
  graphCollisionStyle: 'cross' | 'bridge' | 'gap' | 'fade'
  graphNodeGlyph: 'semantic' | 'circle' | 'diamond' | 'square' | 'ring' | 'terminal'
  diffLayout: 'unified' | 'split' | 'inline' | 'changes' | 'result'
  diffWordHighlights: boolean
  diffDensity: 'compact' | 'comfortable' | 'relaxed'
  inspectMode: 'log' | 'blame' | 'inspector'
  inspectScrubber: boolean
  changesGroupByDir: 'auto' | 'always' | 'never'
  branchesGrouped: boolean
  branchesDetailVisible: boolean
  stashesDetailVisible: boolean
  finderUnified: boolean
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
  graphLimit: 120,
  graphShowAuthor: true,
  graphAuthorAvatars: false,
  avatarPlaceholder: 'spore',
  graphRowDensity: 'comfortable',
  graphDetailPosition: 'right',
  graphDetailWidth: 370,
  graphDetailHash: 'full',
  graphDetailShowAuthorDate: true,
  graphCanvasStyle: 'classic',
  graphBendStyle: 'elbow',
  graphCollisionStyle: 'cross',
  graphNodeGlyph: 'semantic',
  diffLayout: 'unified',
  diffWordHighlights: true,
  diffDensity: 'comfortable',
  inspectMode: 'log',
  inspectScrubber: false,
  changesGroupByDir: 'auto',
  branchesGrouped: false,
  branchesDetailVisible: true,
  stashesDetailVisible: true,
  finderUnified: false,
  confirmDestructiveActions: true,
}

function load(): Partial<ShellSettings> {
  try {
    const stored: Record<string, unknown> = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (typeof stored.theme === 'string' && stored.theme in LEGACY_THEMES) {
      stored.theme = LEGACY_THEMES[stored.theme]
    }
    if (typeof stored.graphAuthorAvatars !== 'boolean') delete stored.graphAuthorAvatars
    if (!isPlaceholderStyle(stored.avatarPlaceholder)) delete stored.avatarPlaceholder
    if (!isThemeId(stored.theme)) delete stored.theme
    // retired layout values (e.g. 'fluid') fall back to the default
    if (
      typeof stored.diffLayout === 'string' &&
      !['unified', 'split', 'inline', 'changes', 'result'].includes(stored.diffLayout)
    ) {
      delete stored.diffLayout
    }
    if (typeof stored.graphDetailWidth !== 'number' || !Number.isFinite(stored.graphDetailWidth)) {
      delete stored.graphDetailWidth
    } else stored.graphDetailWidth = Math.min(640, Math.max(320, stored.graphDetailWidth))
    // drop keys from retired settings so they stop round-tripping through storage
    return Object.fromEntries(
      Object.entries(stored).filter(([key]) => key in defaults),
    ) as Partial<ShellSettings>
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
watch(
  settings,
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      /* storage unavailable — settings just won't persist */
    }
  },
  { deep: true },
)

export function useShellSettings(): ShellSettings {
  return settings
}
