import { GraphService } from '../../bindings/github.com/atterpac/ichi/desktop/services'

const identities = new Map<string, Promise<string>>()
const pending = new Map<string, (hash: string) => void>()
let scheduled = false

async function flush() {
  scheduled = false
  const batch = [...pending.entries()]
  pending.clear()
  for (let start = 0; start < batch.length; start += 256) {
    const entries = batch.slice(start, start + 256)
    try {
      const hashes = await GraphService.AuthorAvatarHashes(entries.map(([commit]) => commit))
      for (const [commit, resolve] of entries) resolve(hashes[commit] ?? '')
    } catch {
      for (const [commit, resolve] of entries) { identities.delete(commit); resolve('') }
    }
  }
}

/** Batch and share attribution lookups across author badges and graph nodes. */
export function resolveCommitAvatarHash(commit: string): Promise<string> {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit) || /^0+$/.test(commit)) return Promise.resolve('')
  const existing = identities.get(commit)
  if (existing) return existing
  const request = new Promise<string>(resolve => { pending.set(commit, resolve) })
  identities.set(commit, request)
  if (identities.size > 2048) identities.delete(identities.keys().next().value!)
  if (!scheduled) { scheduled = true; queueMicrotask(() => { void flush() }) }
  return request
}

export async function emailAvatarHash(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return ''
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
