import type { InjectionKey, Ref } from 'vue'
export const settingsPreviewTarget: InjectionKey<Ref<HTMLElement | null>> =
  Symbol('settings-preview')

export const settingsRevealControls: InjectionKey<() => void> = Symbol('settings-reveal-controls')
