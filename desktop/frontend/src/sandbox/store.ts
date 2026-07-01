/**
 * Sandbox store — the single source of truth the floating bar renders from and
 * the playground reads. Everything here is reactive, so a playground can both
 * register controls and respond to their values.
 *
 * Two control kinds:
 *   - 'toggle'  boolean on/off pill
 *   - 'select'  cycle through a fixed list of options
 *
 * Usage inside a playground (`<script setup>`):
 *   import { sandbox, registerControl, controlValue } from '@/sandbox/store'
 *   onMounted(() => registerControl({
 *     id: 'density', kind: 'select', label: 'Density',
 *     options: ['compact', 'cozy', 'roomy'], value: 'cozy',
 *   }))
 *   const density = computed(() => controlValue<string>('density'))
 *
 * Theme is always available as a built-in select; you never register it.
 */
import { reactive } from 'vue'
import { defaultTheme, themes, type ThemeName } from './themes'

export interface ToggleControl {
  id: string
  kind: 'toggle'
  label: string
  value: boolean
}

export interface SelectControl {
  id: string
  kind: 'select'
  label: string
  options: string[]
  value: string
}

export type Control = ToggleControl | SelectControl

interface SandboxState {
  theme: ThemeName
  showGrid: boolean
  controls: Control[]
}

const state = reactive<SandboxState>({
  theme: defaultTheme,
  showGrid: true,
  controls: [],
})

/**
 * Shared reactive state. Read it freely; prefer the helper mutators
 * (registerControl / setControl / applyTheme) over poking fields directly.
 */
export const sandbox = state

/** Apply the active theme's CSS variables to :root. */
export function applyTheme(name: ThemeName): void {
  state.theme = name
  const theme = themes[name]
  if (!theme) return
  const root = document.documentElement
  for (const [key, val] of Object.entries(theme)) {
    root.style.setProperty(key, val)
  }
}

export function toggleGrid(): void {
  state.showGrid = !state.showGrid
}

/**
 * Register (or replace, by id) a control shown in the floating bar. Idempotent
 * so a playground can call it freely on mount without duplicating pills.
 */
export function registerControl(control: Control): void {
  const idx = state.controls.findIndex((c) => c.id === control.id)
  if (idx >= 0) state.controls.splice(idx, 1, control)
  else state.controls.push(control)
}

/** Remove every registered control — called when the playground unmounts. */
export function clearControls(): void {
  state.controls.length = 0
}

export function setControl(id: string, value: boolean | string): void {
  const control = state.controls.find((c) => c.id === id)
  if (control) control.value = value as never
}

/** Convenience reader for a control's current value. */
export function controlValue<T extends boolean | string>(id: string): T | undefined {
  return state.controls.find((c) => c.id === id)?.value as T | undefined
}
