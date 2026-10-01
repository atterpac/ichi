import { createPreferenceStore } from './store'
import { installPreferenceAppearance } from './appearance'
import { effectScope, type EffectScope } from 'vue'
export type { PreferenceValues, PreferenceId } from './registry'
export type { ToastStyle } from '../components/overlays/toastDesigns'

const preferences = createPreferenceStore()
let scope: EffectScope | undefined
let stopAppearance: (() => void) | undefined
let generation = 0
let initializing: Promise<void> | undefined
export function startPreferences() {
  if (scope) return
  scope = effectScope(true)
  stopAppearance = scope.run(() => installPreferenceAppearance(preferences.values))
}
export function disposePreferences() {
  generation++
  initializing = undefined
  stopAppearance?.()
  stopAppearance = undefined
  scope?.stop()
  scope = undefined
  preferences.dispose()
}
export function usePreferences() {
  startPreferences()
  return preferences
}
// Writable computed bindings use the same validated setter as settings controls.
export function usePreferenceBindings() {
  startPreferences()
  return preferences.bindings
}
export function initializePreferences() {
  startPreferences()
  return (initializing ??= initialize(generation))
}
async function initialize(version: number) {
  // Standalone browser previews are explicitly session-only, with no second store.
  const { System } = await import('@wailsio/runtime')
  if (version !== generation) return
  if (!System.IsDesktop()) return
  const PreferencesService =
    await import('../bindings/github.com/atterpac/ichi/desktop/services/preferencesservice')
  if (version !== generation) return
  await preferences.initialize({
    async load() {
      const snapshot = await PreferencesService.Load()
      if (!snapshot) throw new Error('Preferences service returned no document')
      return snapshot
    },
    async save(revision, content) {
      const outcome = await PreferencesService.Save(revision, content)
      if (!outcome) throw new Error('Preferences service returned no save outcome')
      return outcome
    },
  })
}
