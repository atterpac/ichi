import { reactive } from 'vue'

export interface ModelineState {
  mode: string
  hints: string
}

const DEFAULTS: ModelineState = {
  mode: 'NORMAL',
  hints: '␣ go · : command · / search · ? help',
}

const state = reactive<ModelineState>({ ...DEFAULTS })

/** Reactive modeline state rendered by the shell footer. Views write, shell reads. */
export function useModeline(): ModelineState {
  return state
}

export function setModeline(patch: Partial<ModelineState>) {
  Object.assign(state, patch)
}

export function resetModeline() {
  Object.assign(state, DEFAULTS)
}
