import {
  preferenceDefaults,
  preferenceIds,
  preferenceRegistry,
  type PreferenceId,
  type PreferenceOverrides,
  type PreferenceValues,
} from './registry'
import type { PreferenceDocument } from './document'
export interface PreferenceContext {
  workspace?: string
  repository?: string
}
export type PreferenceSource =
  | 'default'
  | 'profile'
  | 'user'
  | 'workspace'
  | 'repository'
  | 'preview'
export function resolvePreferences(
  document: PreferenceDocument,
  context: PreferenceContext = {},
  preview: PreferenceOverrides = {},
) {
  const values = { ...preferenceDefaults }
  const sources = Object.fromEntries(preferenceIds.map((id) => [id, 'default'])) as Record<
    PreferenceId,
    PreferenceSource
  >
  const layers: [PreferenceSource, PreferenceOverrides | undefined][] = [
    ['profile', document.selectedProfile ? document.profiles[document.selectedProfile] : undefined],
    ['user', document.user],
    ['workspace', context.workspace ? document.workspaces[context.workspace] : undefined],
    ['repository', context.repository ? document.repositories[context.repository] : undefined],
    ['preview', preview],
  ]
  for (const [source, overrides] of layers)
    for (const id of preferenceIds) {
      if (
        (source === 'workspace' || source === 'repository') &&
        !preferenceRegistry[id].scopes.includes(source)
      )
        continue
      // Read absent keys too, so adding the first reactive override invalidates resolution.
      const value = overrides?.[id]
      if (overrides && Object.prototype.hasOwnProperty.call(overrides, id)) {
        Object.assign(values, { [id]: value })
        sources[id] = source
      }
    }
  return {
    values: values as PreferenceValues,
    sources,
    diagnostics:
      document.selectedProfile &&
      !Object.prototype.hasOwnProperty.call(document.profiles, document.selectedProfile)
        ? [
            `Customization profile ${document.selectedProfile} is unavailable; using defaults and overrides.`,
          ]
        : [],
  }
}
