import { reactive, watch } from 'vue'

export interface ShellSettings {
  theme: 'night' | 'storm' | 'moon' | 'day'
  navCollapsed: boolean
  roundness: number
  graphLimit: number
  graphShowAuthor: boolean
  graphRowDensity: 'compact' | 'comfortable' | 'spacious'
  graphDetailPosition: 'right' | 'bottom' | 'hidden'
  graphDetailHash: 'short' | 'full'
  graphDetailShowAuthorDate: boolean
  graphFileChipStyle: 'plain' | 'soft' | 'outline' | 'pill' | 'compact' | 'split'
  graphCanvasStyle: 'classic' | 'fine' | 'bold' | 'neon' | 'mono' | 'angular'
  graphBendStyle: 'elbow' | 'rounded' | 'curve' | 'diagonal'
  graphCollisionStyle: 'cross' | 'bridge' | 'gap' | 'fade'
  graphNodeGlyph: 'semantic' | 'circle' | 'diamond' | 'square' | 'ring' | 'terminal'
  contextMenuStyle: 'default' | 'compact' | 'spacious' | 'glass' | 'terminal' | 'pill'
  keybindStyle: 'minimal' | 'outline' | 'solid' | 'keycap' | 'accent' | 'bracket'
  toastStyle: 'stack' | 'compact' | 'glass' | 'rail' | 'banner' | 'terminal'
  confirmDestructiveActions: boolean
}

export const KEYBIND_STYLES = ['minimal', 'outline', 'solid', 'keycap', 'accent', 'bracket'] as const

const STORAGE_KEY = 'ichi.desktop.settings'
const defaults: ShellSettings = {
  theme: 'night',
  navCollapsed: false,
  roundness: 8,
  graphLimit: 120,
  graphShowAuthor: true,
  graphRowDensity: 'comfortable',
  graphDetailPosition: 'right',
  graphDetailHash: 'full',
  graphDetailShowAuthorDate: true,
  graphFileChipStyle: 'plain',
  graphCanvasStyle: 'classic',
  graphBendStyle: 'elbow',
  graphCollisionStyle: 'cross',
  graphNodeGlyph: 'semantic',
  contextMenuStyle: 'glass',
  keybindStyle: 'solid',
  toastStyle: 'stack',
  confirmDestructiveActions: true,
}

function load(): Partial<ShellSettings> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

const settings = reactive<ShellSettings>({ ...defaults, ...load() })

function applyTheme() {
  const root = document.documentElement
  root.classList.remove('theme-night', 'theme-storm', 'theme-moon', 'theme-day')
  root.classList.add(`theme-${settings.theme}`)
}

function applyKeybindStyle() {
  const root = document.documentElement
  KEYBIND_STYLES.forEach((style) => root.classList.remove(`kbd-${style}`))
  root.classList.add(`kbd-${settings.keybindStyle}`)
}

function applyRoundness() {
  document.documentElement.style.setProperty('--roundness', `${Math.max(0, Math.min(settings.roundness, 18))}px`)
}

applyTheme()
applyKeybindStyle()
applyRoundness()
watch(() => settings.theme, applyTheme)
watch(() => settings.keybindStyle, applyKeybindStyle)
watch(() => settings.roundness, applyRoundness)
watch(settings, () => localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)), { deep: true })

export function useShellSettings(): ShellSettings {
  return settings
}
