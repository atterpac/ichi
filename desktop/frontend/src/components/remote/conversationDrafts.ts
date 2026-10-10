import { reactive } from 'vue'
const values = reactive<Record<string, string>>({})
const prefix = 'ichi:conversation-draft:'
export function readDraft(key: string, initial = '') {
  if (!(key in values)) {
    try {
      values[key] = localStorage.getItem(prefix + key) ?? initial
    } catch {
      values[key] = initial
    }
  }
  return values[key] ?? ''
}
export function writeDraft(key: string, value: string) {
  values[key] = value
  try {
    if (value) localStorage.setItem(prefix + key, value)
    else localStorage.removeItem(prefix + key)
  } catch {
    /* Keep the in-memory draft when storage is unavailable. */
  }
}
