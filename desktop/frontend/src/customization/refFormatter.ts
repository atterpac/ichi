import { createBoundedLru } from '../composables/boundedLru'
import type {
  RefFormatRequest,
  RefFormatResult,
} from '../bindings/github.com/atterpac/ichi/desktop/services/models'

const cache = createBoundedLru<string, { result: RefFormatResult; bytes: number }>({
  maxEntries: 2048,
  maxBytes: 1024 * 1024,
  sizeOf: (entry) => entry.bytes,
})
const inFlight = new Map<string, Promise<RefFormatResult>>()
const pending = new Map<
  string,
  { request: RefFormatRequest; resolve: ((result: RefFormatResult) => void)[] }
>()
let scheduled = false
// These exact presets have the same result in Go and standalone browser previews.
function preset(r: RefFormatRequest): string | undefined {
  let text: string
  switch (r.Format) {
    case '{{.Name}}':
      text = r.Name
      break
    case '{{.Branch}}':
      text = r.Branch
      break
    case '{{.Remote}}/{{.Branch}}':
      text = `${r.Remote}/${r.Branch}`
      break
    case '{{.Branch}} · {{.Remote}}':
      text = `${r.Branch} · ${r.Remote}`
      break
    default:
      return undefined
  }
  text = text.trim()
  if (
    !text ||
    new TextEncoder().encode(text).length > 512 ||
    [...text].some((char) => {
      const code = char.codePointAt(0)!
      return code < 32 || (code >= 127 && code <= 159)
    })
  )
    return undefined
  return text
}
export function formatRef(request: RefFormatRequest): Promise<RefFormatResult> {
  const text = preset(request)
  if (text !== undefined) return Promise.resolve({ Text: text, Error: '' })
  const key = JSON.stringify(request)
  const cached = cache.get(key)
  if (cached) return Promise.resolve(cached.result)
  const existing = inFlight.get(key)
  if (existing) return existing
  const promise = new Promise<RefFormatResult>((resolve) => {
    const entry = pending.get(key)
    if (entry) entry.resolve.push(resolve)
    else pending.set(key, { request, resolve: [resolve] })
    if (!scheduled) {
      scheduled = true
      queueMicrotask(() => void flush())
    }
  })
  inFlight.set(key, promise)
  void promise.then(() => inFlight.delete(key))
  return promise
}
async function flush() {
  const entries = [...pending.entries()]
  pending.clear()
  scheduled = false
  try {
    const { System } = await import('@wailsio/runtime')
    if (!System.IsDesktop())
      throw new Error(
        'Custom Go templates require the desktop app. Presets work in browser previews.',
      )
    const { FormatRefLabels } =
      await import('../bindings/github.com/atterpac/ichi/desktop/services/preferencesservice')
    for (let offset = 0; offset < entries.length; offset += 512) {
      const chunk = entries.slice(offset, offset + 512)
      const results = await FormatRefLabels(chunk.map(([, entry]) => entry.request))
      chunk.forEach(([key, entry], i) => {
        const result = results[i] ?? { Text: '', Error: 'No formatted label returned' }
        cache.set(key, {
          result,
          bytes: (key.length + result.Text.length + result.Error.length) * 2 + 128,
        })
        entry.resolve.forEach((resolve) => resolve(result))
      })
    }
  } catch (err) {
    const result = { Text: '', Error: String(err) }
    entries.forEach(([, entry]) => entry.resolve.forEach((resolve) => resolve(result)))
  }
}
export { preset as refPresetText }
