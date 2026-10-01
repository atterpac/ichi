import { computed, reactive, readonly, ref, type WritableComputedRef } from 'vue'
import { emptyPreferences, parsePreferences, type PreferenceDocument } from './document'
import {
  preferenceIds,
  preferenceRegistry,
  validatePreference,
  type PreferenceId,
  type PreferenceOverrides,
  type PreferenceScope,
  type PreferenceValues,
} from './registry'
import { resolvePreferences, type PreferenceContext } from './resolve'

export interface PreferenceSnapshot {
  Content: string
  Revision: string
  Path: string
}
export interface PreferencePersistence {
  load(): Promise<PreferenceSnapshot>
  save(revision: string, content: string): Promise<PreferenceSaveOutcome>
}
export interface PreferenceSaveOutcome {
  Code: string
  Snapshot: PreferenceSnapshot | null
  Message: string
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
export function mergePreferences(
  base: PreferenceDocument,
  local: PreferenceDocument,
  remote: PreferenceDocument,
  preferLocal = true,
) {
  const conflicts: string[] = []
  function merge(before: unknown, ours: unknown, theirs: unknown, path: string): unknown {
    if (equal(ours, before)) return theirs
    if (equal(theirs, before) || equal(ours, theirs)) return ours
    if (record(ours) && record(theirs) && (record(before) || before === undefined)) {
      const prior = record(before) ? before : {}
      const result: Record<string, unknown> = Object.create(null)
      for (const key of new Set([
        ...Object.keys(prior),
        ...Object.keys(ours),
        ...Object.keys(theirs),
      ])) {
        const value = merge(prior[key], ours[key], theirs[key], path ? `${path} / ${key}` : key)
        if (value !== undefined) result[key] = value
      }
      return result
    }
    conflicts.push(path)
    return preferLocal ? ours : theirs
  }
  return { document: clone(merge(base, local, remote, '') as PreferenceDocument), conflicts }
}

export function createPreferenceStore() {
  const document = ref<PreferenceDocument>(emptyPreferences())
  const context = ref<PreferenceContext>({})
  const previews = reactive(new Map<symbol, PreferenceOverrides>())
  const initialStatus = () => ({
    ready: true,
    loading: false,
    saving: false,
    dirty: false,
    error: '',
    path: '',
    diagnostics: [] as string[],
    conflicts: [] as string[],
    persistent: false,
  })
  const status = reactive(initialStatus())
  let persistence: PreferencePersistence | undefined
  let revision = ''
  let saved = emptyPreferences()
  let edit = 0
  let task: Promise<void> | undefined
  let conflictRemote: PreferenceDocument | undefined
  let conflictBase: PreferenceDocument | undefined
  let started: Promise<void> | undefined
  let generation = 0
  const resolution = computed(() =>
    resolvePreferences(document.value, context.value, Object.assign({}, ...previews.values())),
  )
  const values = computed(() => resolution.value.values)
  const diagnostics = computed(() => [...status.diagnostics, ...resolution.value.diagnostics])
  const sources = computed(() => resolution.value.sources)

  async function initialize(adapter: PreferencePersistence) {
    if (started) return started
    persistence = adapter
    status.persistent = true
    status.ready = false
    status.loading = true
    const version = generation
    started = (async () => {
      try {
        const snapshot = await adapter.load()
        if (version !== generation) return
        status.path = snapshot.Path
        const parsed = parsePreferences(snapshot.Content)
        saved = clone(parsed.document)
        // Edits made before the first read complete take precedence over the file.
        document.value = mergePreferences(emptyPreferences(), document.value, saved).document
        revision = snapshot.Revision
        status.diagnostics = parsed.diagnostics
        status.ready = true
      } catch (error) {
        if (version === generation) status.error = String(error)
      } finally {
        if (version === generation) status.loading = false
      }
      if (version === generation && status.dirty && status.ready) void flush()
    })()
    return started
  }

  function changed() {
    edit++
    status.dirty = true
    if (persistence && status.ready && !status.conflicts.length) void flush()
  }
  function overrides(scope: PreferenceScope, scopeId?: string): PreferenceOverrides {
    if (scope === 'user') return document.value.user
    const id = scopeId ?? context.value[scope]
    if (!id) throw new Error(`Select a ${scope} before editing its settings`)
    const table = scope === 'workspace' ? document.value.workspaces : document.value.repositories
    if (!Object.prototype.hasOwnProperty.call(table, id))
      Object.defineProperty(table, id, {
        value: {},
        writable: true,
        enumerable: true,
        configurable: true,
      })
    return table[id]!
  }
  function set<K extends PreferenceId>(
    id: K,
    value: PreferenceValues[K],
    scope: PreferenceScope = 'user',
    scopeId?: string,
  ) {
    const error = validatePreference(id, value)
    if (error) throw new Error(error)
    if (!preferenceRegistry[id].scopes.includes(scope))
      throw new Error(`${id} is unavailable at ${scope} scope`)
    const target = overrides(scope, scopeId)
    if (Object.prototype.hasOwnProperty.call(target, id) && equal(target[id], value)) return
    Object.assign(target, { [id]: value })
    changed()
  }
  function reset(id: PreferenceId, scope: PreferenceScope = 'user', scopeId?: string) {
    const target = overrides(scope, scopeId)
    if (!Object.prototype.hasOwnProperty.call(target, id)) return
    delete target[id]
    changed()
  }
  function resetCategory(category?: string) {
    const target = document.value.user
    let updated = false
    for (const id of preferenceIds)
      if (
        (!category || preferenceRegistry[id].category === category) &&
        Object.prototype.hasOwnProperty.call(target, id)
      ) {
        delete target[id]
        updated = true
      }
    if (updated) changed()
  }
  function bind<K extends PreferenceId>(id: K): WritableComputedRef<PreferenceValues[K]> {
    return computed({ get: () => values.value[id], set: (value) => set(id, value) })
  }
  const bindings = reactive(
    Object.fromEntries(preferenceIds.map((id) => [id, bind(id)])),
  ) as unknown as PreferenceValues

  async function flush(): Promise<void> {
    if (task) return task
    if (!persistence || !status.ready || status.conflicts.length) return
    const adapter = persistence
    const lifetime = generation
    task = Promise.resolve().then(async () => {
      if (lifetime !== generation) return
      status.saving = true
      status.error = ''
      try {
        let retries = 0
        while (lifetime === generation && status.dirty && !status.conflicts.length) {
          const version = edit
          const pending = clone(document.value)
          const outcome = await adapter.save(revision, JSON.stringify(pending, null, 2) + '\n')
          if (lifetime !== generation) return
          const snapshot = outcome.Snapshot
          if (!snapshot) throw new Error('Preferences service returned no save snapshot')
          if (outcome.Code === 'saved') {
            revision = snapshot.Revision
            saved = pending
            status.dirty = version !== edit
            retries = 0
          } else if (outcome.Code === 'conflict') {
            if (retries++ >= 3)
              throw new Error(
                outcome.Message || 'Preferences keep changing elsewhere. Try saving again.',
              )
            const remote = parsePreferences(snapshot.Content, true).document
            const merged = mergePreferences(saved, document.value, remote)
            revision = snapshot.Revision
            conflictBase = clone(saved)
            conflictRemote = clone(remote)
            saved = clone(remote)
            document.value = merged.document
            status.conflicts = merged.conflicts
            if (merged.conflicts.length)
              status.error =
                'Preferences changed elsewhere. Choose which values to keep for the conflicting settings.'
          } else throw new Error(`Unexpected preferences save outcome: ${outcome.Code}`)
        }
      } catch (error) {
        if (lifetime === generation) status.error = String(error)
      } finally {
        if (lifetime === generation) {
          status.saving = false
          task = undefined
        }
      }
    })
    return task
  }
  function resolveConflict(keepLocal: boolean) {
    if (!conflictRemote || !conflictBase) return
    document.value = mergePreferences(
      conflictBase,
      document.value,
      conflictRemote,
      keepLocal,
    ).document
    status.conflicts = []
    conflictRemote = conflictBase = undefined
    status.error = ''
    changed()
  }
  function exportUser(category?: string) {
    const exported = emptyPreferences()
    for (const id of preferenceIds)
      if (
        preferenceRegistry[id].portable &&
        (!category || preferenceRegistry[id].category === category) &&
        Object.prototype.hasOwnProperty.call(document.value.user, id)
      )
        Object.assign(exported.user, { [id]: document.value.user[id] })
    return JSON.stringify(exported, null, 2) + '\n'
  }
  function previewImport(content: string) {
    const candidate = parsePreferences(content, true).document
    if (
      Object.keys(candidate.workspaces).length ||
      Object.keys(candidate.repositories).length ||
      Object.keys(candidate.profiles).length ||
      candidate.selectedProfile ||
      Object.keys(candidate.extensions).length
    )
      throw new Error(
        'This import supports user settings only. Scoped profiles and extensions are not imported here.',
      )
    return {
      overrides: candidate.user,
      changes: preferenceIds.filter(
        (id) =>
          Object.prototype.hasOwnProperty.call(candidate.user, id) &&
          !equal(document.value.user[id], candidate.user[id]),
      ),
    }
  }
  function applyImport(content: string) {
    const preview = previewImport(content)
    // Validate the whole import before modifying anything.
    document.value.user = { ...document.value.user, ...preview.overrides }
    changed()
  }
  function beginPreview() {
    const token = Symbol('preference preview')
    previews.set(token, {})
    return {
      set<K extends PreferenceId>(id: K, value: PreferenceValues[K]) {
        if (!previews.has(token)) throw new Error('This preference preview is closed')
        const error = validatePreference(id, value)
        if (error) throw new Error(error)
        previews.set(token, { ...previews.get(token), [id]: value })
      },
      cancel() {
        previews.delete(token)
      },
      apply() {
        const changes = previews.get(token)
        if (!changes) return
        document.value.user = { ...document.value.user, ...changes }
        previews.delete(token)
        changed()
      },
    }
  }
  return {
    values: readonly(values),
    bindings,
    status: readonly(status),
    diagnostics,
    sources,
    initialize,
    /** Reset the window store and invalidate reads/writes from its previous lifetime. */
    dispose() {
      generation++
      persistence = undefined
      revision = ''
      saved = emptyPreferences()
      edit = 0
      task = started = undefined
      conflictRemote = conflictBase = undefined
      previews.clear()
      document.value = emptyPreferences()
      context.value = {}
      Object.assign(status, initialStatus())
    },
    set,
    reset,
    resetCategory,
    bind,
    flush,
    resolveConflict,
    exportUser,
    previewImport,
    applyImport,
    beginPreview,
    setContext(value: PreferenceContext) {
      context.value = { ...value }
    },
    async retry() {
      if (!persistence) return
      if (!status.ready) {
        started = undefined
        status.error = ''
        await initialize(persistence)
      } else await flush()
    },
    snapshot() {
      return clone(document.value)
    },
  }
}
