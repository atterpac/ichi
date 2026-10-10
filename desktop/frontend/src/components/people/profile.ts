import { inject, provide, shallowRef, type InjectionKey } from 'vue'
export type Person = {
  name: string
  login?: string
  email?: string
  commit?: string
  avatarUrl?: string
  remote?: string
}
export const profile = shallowRef<Person | null>(null)
const remoteKey: InjectionKey<() => string> = Symbol('profile-remote')
export function provideProfileRemote(remote: () => string) {
  provide(remoteKey, remote)
}
export function useOpenProfile() {
  const remote = inject(remoteKey, () => '')
  return (person: Person) => {
    profile.value = { ...person, remote: person.remote || remote() }
  }
}
export function githubLogin(email: string) {
  return (
    /^(?:\d+\+)?([a-z\d](?:[a-z\d-]*[a-z\d])?(?:\[bot\])?)@users\.noreply\.github\.com$/i.exec(
      email,
    )?.[1] || ''
  )
}

// Cache only completed read results, for a minute, scoped by repository and viewer.
const contributionCache = new Map<string, { expires: number; value: unknown }>()
export async function cachedContributions<T>(key: string, read: () => Promise<T>): Promise<T> {
  const existing = contributionCache.get(key)
  if (existing && existing.expires > Date.now()) return existing.value as T
  const value = await read()
  contributionCache.set(key, { expires: Date.now() + 60_000, value })
  if (contributionCache.size > 32) contributionCache.delete(contributionCache.keys().next().value!)
  return value
}
