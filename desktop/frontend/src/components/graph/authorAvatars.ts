/** Shared Gravatar image cache for author badges and optional graph nodes. */
const cache = new Map<string, Promise<HTMLImageElement | null>>()
const MAX_AUTHORS = 256
const queue: (() => void)[] = []
let active = 0
function pump() {
  while (active < 4 && queue.length) { active++; queue.shift()!() }
}

export function authorInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? `${words[0]![0]}${words[words.length - 1]![0]}` : (words[0] ?? '?').slice(0, 2)).toUpperCase()
}

export function gravatarURL(hash: string): string | null {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null
  return `https://www.gravatar.com/avatar/${hash}?s=64&d=404&r=g`
}

export function loadAuthorAvatar(hash: string): Promise<HTMLImageElement | null> {
  const key = hash
  if (!gravatarURL(key)) return Promise.resolve(null)
  const existing = cache.get(key)
  if (existing) {
    cache.delete(key)
    cache.set(key, existing)
    return existing
  }
  const request = Promise.resolve(gravatarURL(key)).then(url => {
    if (!url) return null
    return new Promise<HTMLImageElement | null>(resolve => {
      queue.push(() => {
        const image = new Image()
        image.referrerPolicy = 'no-referrer'
        const finish = (result: HTMLImageElement | null) => {
          clearTimeout(timer)
          image.onload = null
          image.onerror = null
          if (!result) image.src = ''
          active--
          resolve(result)
          pump()
        }
        const timer = setTimeout(() => finish(null), 8000)
        image.onload = () => finish(image)
        image.onerror = () => finish(null)
        image.src = url
      })
      pump()
    })
  }).catch(() => null)
  // Cache missing/failed images too, avoiding requests on every redraw.
  cache.set(key, request)
  if (cache.size > MAX_AUTHORS) cache.delete(cache.keys().next().value!)
  return request
}
