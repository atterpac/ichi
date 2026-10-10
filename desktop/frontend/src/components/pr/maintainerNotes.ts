import { reactive } from 'vue'

type LocalNote = { text: string; loaded: boolean; saved: boolean; error: string }
const notes = new Map<string, LocalNote>()

// Separate from GitHub models and review drafts: notes are never mutation inputs.
export function maintainerNoteKey(repository: string, number: number, host = 'github.com') {
  return (
    'ichi:maintainer-note:v1:' +
    JSON.stringify([host.toLowerCase(), repository.trim().toLowerCase(), number])
  )
}
export function loadMaintainerNote(key: string): LocalNote {
  const existing = notes.get(key)
  if (existing) return existing
  const note = reactive<LocalNote>({ text: '', loaded: false, saved: false, error: '' })
  notes.set(key, note)
  readNote(key, note)
  return note
}
function readNote(key: string, note: LocalNote) {
  try {
    note.text = localStorage.getItem(key) ?? ''
    note.loaded = true
    note.saved = true
    note.error = ''
  } catch {
    note.error =
      'Could not read notes from this device. Retry before editing to protect any existing note.'
  }
}
export function saveMaintainerNote(key: string, text: string) {
  const note = loadMaintainerNote(key)
  if (!note.loaded) return
  note.text = text
  try {
    if (text) localStorage.setItem(key, text)
    else localStorage.removeItem(key)
    note.saved = true
    note.error = ''
  } catch {
    note.saved = false
    note.error =
      'Could not save to this device. Your text is kept while Ichi is open; copy it somewhere safe or retry saving.'
  }
}
export function retryMaintainerNote(key: string) {
  const note = loadMaintainerNote(key)
  if (note.loaded) saveMaintainerNote(key, note.text)
  else readNote(key, note)
}
