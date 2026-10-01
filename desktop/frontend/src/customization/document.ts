import {
  isPreferenceId,
  preferenceRegistry,
  validatePreference,
  type PreferenceOverrides,
  type PreferenceScope,
} from './registry'

export interface PreferenceDocument {
  version: 1
  user: PreferenceOverrides
  workspaces: Record<string, PreferenceOverrides>
  repositories: Record<string, PreferenceOverrides>
  profiles: Record<string, PreferenceOverrides>
  selectedProfile: string | null
  extensions: Record<string, unknown>
}
export function emptyPreferences(): PreferenceDocument {
  return {
    version: 1,
    user: {},
    workspaces: {},
    repositories: {},
    profiles: {},
    selectedProfile: null,
    extensions: {},
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
export function parsePreferences(
  content: string,
  strict = false,
): { document: PreferenceDocument; diagnostics: string[] } {
  const input: unknown = JSON.parse(content)
  if (!object(input) || input.version !== 1)
    throw new Error('Unsupported preferences document: expected version 1')
  const document = emptyPreferences()
  const diagnostics: string[] = []
  const read = (value: unknown, path: string, scope: PreferenceScope): PreferenceOverrides => {
    if (!object(value)) throw new Error(`${path}: expected an object`)
    const result: Record<string, unknown> = {}
    for (const [id, entry] of Object.entries(value)) {
      const error = !isPreferenceId(id)
        ? `Unknown setting ${id}`
        : !preferenceRegistry[id].scopes.includes(scope)
          ? `${id} is unavailable at ${scope} scope`
          : validatePreference(id, entry)
      if (error) diagnostics.push(`${path}: ${error}`)
      else result[id] = entry
    }
    return result as PreferenceOverrides
  }
  document.user = read(input.user, 'user', 'user')
  for (const [field, scope] of [
    ['workspaces', 'workspace'],
    ['repositories', 'repository'],
    ['profiles', 'user'],
  ] as const) {
    if (!object(input[field])) throw new Error(`${field}: expected an object`)
    const entries = Object.create(null) as Record<string, PreferenceOverrides>
    for (const [id, value] of Object.entries(input[field])) {
      if (!id.trim()) throw new Error(`${field}: scope IDs cannot be empty`)
      entries[id] = read(value, `${field}.${id}`, scope)
    }
    document[field] = entries
  }
  if (
    input.selectedProfile !== null &&
    (typeof input.selectedProfile !== 'string' || !input.selectedProfile.trim())
  )
    throw new Error('selectedProfile: expected a nonempty string or null')
  document.selectedProfile = input.selectedProfile as string | null
  if (!object(input.extensions)) throw new Error('extensions: expected an object')
  document.extensions = input.extensions
  for (const key of Object.keys(input))
    if (!Object.prototype.hasOwnProperty.call(document, key))
      diagnostics.push(`Unknown document field ${key}`)
  if (strict && diagnostics.length) throw new Error(diagnostics.join('\n'))
  return { document, diagnostics }
}
