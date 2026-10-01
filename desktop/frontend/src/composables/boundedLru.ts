type Entry<T> = { value: T; bytes: number; expires: number }
type Limits = { maxEntries: number; maxBytes: number; ttl?: number }

/** Completed data only. Request ownership and invalidation belong to consumers. */
export function createBoundedLru<K, T>(
  policy: Limits & {
    sizeOf: (value: T) => number
    now?: () => number
  },
) {
  const entries = new Map<K, Entry<T>>()
  const now = policy.now ?? (() => Date.now())
  let retainedBytes = 0

  function remove(key: K) {
    const entry = entries.get(key)
    if (!entry) return
    retainedBytes -= entry.bytes
    entries.delete(key)
  }
  function get(key: K): T | undefined {
    const entry = entries.get(key)
    if (!entry) return undefined
    if (entry.expires <= now()) {
      remove(key)
      return undefined
    }
    entries.delete(key)
    entries.set(key, entry)
    return entry.value
  }
  // A shared consumer may choose a stricter budget or a different expiry.
  function set(key: K, value: T, limits: Limits = policy) {
    remove(key)
    const bytes = policy.sizeOf(value)
    if (limits.maxEntries <= 0 || !Number.isFinite(bytes) || bytes < 0 || bytes > limits.maxBytes)
      return
    const time = now()
    // Expired entries should never evict live data from the budget.
    for (const [id, entry] of entries) if (entry.expires <= time) remove(id)
    entries.set(key, { value, bytes, expires: time + (limits.ttl ?? Infinity) })
    retainedBytes += bytes
    while (entries.size > limits.maxEntries || retainedBytes > limits.maxBytes)
      remove(entries.keys().next().value!)
  }
  return {
    get,
    set,
    delete: remove,
    deleteWhere(predicate: (key: K) => boolean) {
      for (const key of entries.keys()) if (predicate(key)) remove(key)
    },
    clear() {
      entries.clear()
      retainedBytes = 0
    },
  }
}
