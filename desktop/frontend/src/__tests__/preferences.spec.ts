import { describe, expect, it, vi } from 'vitest'
import {
  createPreferenceStore,
  type PreferencePersistence,
  type PreferenceSaveOutcome,
} from '../customization/store'
import { emptyPreferences, parsePreferences } from '../customization/document'
import { resolvePreferences } from '../customization/resolve'
import {
  preferenceDefaults,
  preferenceIds,
  preferenceSchema,
  validatePreference,
} from '../customization/registry'

describe('preference registry and resolution', () => {
  it('validates every default and rejects invalid values', () => {
    for (const id of preferenceIds)
      expect(validatePreference(id, preferenceDefaults[id])).toBeNull()
    expect(validatePreference('graph.detailWidth', 641)).toContain('320')
    expect(validatePreference('graph.rowDensity', 'unknown')).toContain('unsupported')
    expect(validatePreference('graph.authorAvatars', 'true')).toContain('boolean')
  })
  it('resolves scopes in order and keeps user-only preferences out of repository scope', () => {
    const doc = emptyPreferences()
    doc.profiles.review = { 'graph.limit': 200 }
    doc.selectedProfile = 'review'
    doc.user['graph.limit'] = 300
    doc.workspaces.work = { 'graph.limit': 400 }
    doc.repositories['/repo'] = { 'graph.limit': 500, 'appearance.theme': 'ichi-light' }
    expect(
      resolvePreferences(doc, { workspace: 'work', repository: '/repo' }).values['graph.limit'],
    ).toBe(500)
    expect(
      resolvePreferences(doc, { workspace: 'work', repository: '/repo' }, { 'graph.limit': 600 })
        .sources['graph.limit'],
    ).toBe('preview')
    expect(resolvePreferences(doc, { repository: '/repo' }).values['appearance.theme']).toBe('ichi')
    expect(resolvePreferences(doc, { repository: '/other' }).values['graph.limit']).toBe(300)
  })
  it('reports invalid stored settings while strict imports reject them', () => {
    const doc = emptyPreferences()
    const input = JSON.stringify({ ...doc, user: { 'graph.limit': -1 } })
    expect(parsePreferences(input).diagnostics).toHaveLength(1)
    expect(parsePreferences(input).document.user).toEqual({})
    expect(() => parsePreferences(input, true)).toThrow('History limit')
    expect(() => parsePreferences('{')).toThrow(SyntaxError)
    expect(() => parsePreferences(JSON.stringify({ ...doc, version: 2 }))).toThrow('version')
  })
})
describe('preference store', () => {
  it('updates writable bindings through validation and resets to defaults', () => {
    const store = createPreferenceStore()
    store.bindings['graph.rowDensity'] = 'compact'
    expect(store.snapshot().user['graph.rowDensity']).toBe('compact')
    expect(store.values.value['graph.rowDensity']).toBe('compact')
    expect(store.bindings['graph.rowDensity']).toBe('compact')
    store.reset('graph.rowDensity')
    expect(store.values.value['graph.rowDensity']).toBe('comfortable')
  })
})

it('keeps the shared settings bindings reactive while appearance is applied', async () => {
  const { usePreferences, usePreferenceBindings } = await import('../customization/usePreferences')
  const shared = usePreferences()
  shared.resetCategory()
  usePreferenceBindings()['diff.layout'] = 'changes'
  expect(shared.snapshot().user['diff.layout']).toBe('changes')
  expect(shared.values.value['diff.layout']).toBe('changes')
  expect(usePreferenceBindings()['diff.layout']).toBe('changes')
})

function memoryPersistence() {
  let content = JSON.stringify(emptyPreferences())
  let revision = 0
  return {
    external(document: ReturnType<typeof emptyPreferences>) {
      content = JSON.stringify(document)
      revision++
    },
    content() {
      return JSON.parse(content) as ReturnType<typeof emptyPreferences>
    },
    async load() {
      return { Content: content, Revision: String(revision), Path: '/preferences.json' }
    },
    async save(expected: string, pending: string): Promise<PreferenceSaveOutcome> {
      if (expected !== String(revision))
        return {
          Code: 'conflict',
          Snapshot: await this.load(),
          Message: 'A different writer changed this document.',
        }
      content = pending
      revision++
      return { Code: 'saved', Snapshot: await this.load(), Message: '' }
    },
  }
}

describe('preference persistence and previews', () => {
  it('saves overrides, reloads them, and persists removal instead of copying defaults', async () => {
    const disk = memoryPersistence()
    const store = createPreferenceStore()
    await store.initialize(disk)
    store.set('graph.limit', 300)
    await store.flush()
    expect(disk.content().user).toEqual({ 'graph.limit': 300 })
    const reopened = createPreferenceStore()
    await reopened.initialize(disk)
    expect(reopened.values.value['graph.limit']).toBe(300)
    reopened.reset('graph.limit')
    await reopened.flush()
    expect(disk.content().user).toEqual({})
  })
  it('merges disjoint external changes and asks about overlapping changes', async () => {
    const disk = memoryPersistence()
    const store = createPreferenceStore()
    await store.initialize(disk)
    const remote = emptyPreferences()
    remote.user['diff.layout'] = 'split'
    disk.external(remote)
    store.set('graph.limit', 250)
    await store.flush()
    expect(disk.content().user).toEqual({ 'diff.layout': 'split', 'graph.limit': 250 })
    const overlapping = disk.content()
    overlapping.user['graph.limit'] = 400
    disk.external(overlapping)
    store.set('graph.limit', 300)
    await store.flush()
    expect(store.status.conflicts).toEqual(['user / graph.limit'])
    expect(disk.content().user['graph.limit']).toBe(400)
    store.resolveConflict(false)
    await store.flush()
    expect(store.values.value['graph.limit']).toBe(400)
    expect(disk.content().user['diff.layout']).toBe('split')
  })
  it('keeps unsaved edits on write failure and can retry', async () => {
    const disk = memoryPersistence()
    let fail = true
    const store = createPreferenceStore()
    await store.initialize({
      ...disk,
      async save(revision, content) {
        if (fail) throw new Error('disk full')
        return disk.save(revision, content)
      },
    })
    store.set('graph.limit', 350)
    await store.flush()
    expect(store.status.dirty).toBe(true)
    expect(store.status.error).toContain('disk full')
    expect(disk.content().user).toEqual({})
    fail = false
    await store.retry()
    expect(store.status.dirty).toBe(false)
    expect(disk.content().user['graph.limit']).toBe(350)
  })
  it('never overwrites an unsupported or malformed document after a failed load', async () => {
    const store = createPreferenceStore()
    let writes = 0
    await store.initialize({
      async load() {
        return { Content: '{', Revision: 'bad', Path: '/bad.json' }
      },
      async save() {
        writes++
        throw new Error('must not write')
      },
    })
    store.set('graph.limit', 200)
    await store.flush()
    expect(store.status.ready).toBe(false)
    expect(store.status.error).not.toBe('')
    expect(writes).toBe(0)
  })
  it('validates an entire import before changing any settings', () => {
    const store = createPreferenceStore()
    store.set('graph.limit', 300)
    const candidate = emptyPreferences()
    candidate.user = { 'graph.limit': 350, 'graph.rowDensity': 'invalid' as never }
    expect(() => store.applyImport(JSON.stringify(candidate))).toThrow('Graph row density')
    expect(store.values.value['graph.limit']).toBe(300)
    candidate.user = { 'graph.limit': 350 }
    expect(store.previewImport(JSON.stringify(candidate)).changes).toEqual(['graph.limit'])
    store.applyImport(JSON.stringify(candidate))
    expect(store.values.value['graph.limit']).toBe(350)
    const exported = JSON.parse(store.exportUser())
    expect(exported.repositories).toEqual({})
    expect(exported.workspaces).toEqual({})
    expect(exported.user).toEqual(candidate.user)
  })
  it('owns previews independently and persists only applied values', () => {
    const store = createPreferenceStore()
    const first = store.beginPreview()
    first.set('appearance.textScale', 110)
    const second = store.beginPreview()
    second.set('appearance.textScale', 120)
    expect(store.values.value['appearance.textScale']).toBe(120)
    first.cancel()
    expect(store.values.value['appearance.textScale']).toBe(120)
    expect(store.snapshot().user).toEqual({})
    second.apply()
    expect(store.snapshot().user['appearance.textScale']).toBe(120)
    expect(store.sources.value['appearance.textScale']).toBe('user')
  })
  it('switches scopes and clears overrides back to inherited values', () => {
    const store = createPreferenceStore()
    store.set('graph.limit', 200)
    store.setContext({ workspace: 'work', repository: '/one' })
    store.set('graph.limit', 300, 'workspace')
    store.set('graph.limit', 400, 'repository')
    expect(store.values.value['graph.limit']).toBe(400)
    store.reset('graph.limit', 'repository')
    expect(store.values.value['graph.limit']).toBe(300)
    store.setContext({ repository: '/two' })
    expect(store.values.value['graph.limit']).toBe(200)
    expect(() => store.set('appearance.theme', 'ichi-light', 'repository')).toThrow('unavailable')
  })
})

it('uses the outcome code and current snapshot rather than message text or a second read', async () => {
  const disk = memoryPersistence()
  const load = vi.fn<typeof disk.load>(() => disk.load())
  const save = vi.fn<typeof disk.save>((revision, content) => disk.save(revision, content))
  const store = createPreferenceStore()
  await store.initialize({ load, save })
  const remote = emptyPreferences()
  remote.user['diff.layout'] = 'split'
  disk.external(remote)
  store.set('graph.limit', 250)
  await store.flush()
  expect(load).toHaveBeenCalledOnce()
  expect(save).toHaveBeenCalledTimes(2)
  expect(store.status.error).toBe('')
  expect(disk.content().user).toEqual({ 'diff.layout': 'split', 'graph.limit': 250 })
})

it('does not merge or retry unrelated failures even when their message mentions preferences conflict', async () => {
  const disk = memoryPersistence()
  const load = vi.fn<typeof disk.load>(() => disk.load())
  const save = vi.fn<PreferencePersistence['save']>(async () => {
    throw new Error('Cannot write preferences conflict diagnostics: disk full')
  })
  const store = createPreferenceStore()
  await store.initialize({ load, save })
  store.set('graph.limit', 300)
  await store.flush()
  expect(load).toHaveBeenCalledOnce()
  expect(save).toHaveBeenCalledOnce()
  expect(store.status.dirty).toBe(true)
  expect(store.status.error).toContain('disk full')
})

it('bounds repeated revision conflicts and preserves unsaved local edits', async () => {
  const disk = memoryPersistence()
  const save = vi.fn<PreferencePersistence['save']>(
    async (): Promise<PreferenceSaveOutcome> => ({
      Code: 'conflict',
      Snapshot: await disk.load(),
      Message: 'Busy writer',
    }),
  )
  const store = createPreferenceStore()
  await store.initialize({ load: () => disk.load(), save })
  store.set('graph.limit', 300)
  await store.flush()
  expect(save).toHaveBeenCalledTimes(4)
  expect(store.status.error).toContain('Busy writer')
  expect(store.status.dirty).toBe(true)
  expect(store.values.value['graph.limit']).toBe(300)
})

it('rejects unknown save outcomes rather than treating them as successful writes', async () => {
  const disk = memoryPersistence()
  const store = createPreferenceStore()
  await store.initialize({
    load: () => disk.load(),
    async save() {
      return { Code: 'unexpected', Snapshot: await disk.load(), Message: '' }
    },
  })
  store.set('graph.limit', 300)
  await store.flush()
  expect(store.status.error).toContain('Unexpected preferences save outcome')
  expect(store.status.dirty).toBe(true)
})

it('preserves unsaved preferences when a save outcome omits its required snapshot', async () => {
  const disk = memoryPersistence()
  const store = createPreferenceStore()
  await store.initialize({
    load: () => disk.load(),
    async save() {
      return { Code: 'saved', Snapshot: null, Message: '' }
    },
  })
  store.set('graph.limit', 300)
  await store.flush()
  expect(store.status.error).toContain('no save snapshot')
  expect(store.status.dirty).toBe(true)
  expect(disk.content().user).toEqual({})
})

it('disposes previews and ignores a load from the previous store lifetime', async () => {
  const disk = memoryPersistence()
  let finish!: (snapshot: Awaited<ReturnType<typeof disk.load>>) => void
  const store = createPreferenceStore()
  const preview = store.beginPreview()
  preview.set('graph.limit', 500)
  const opening = store.initialize({
    ...disk,
    load: () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  })
  store.dispose()
  await store.initialize(disk)
  const oldDocument = emptyPreferences()
  oldDocument.user['graph.limit'] = 700
  finish({ Content: JSON.stringify(oldDocument), Revision: 'old', Path: '/old.json' })
  await opening
  expect(store.values.value['graph.limit']).toBe(120)
  expect(store.status.path).toBe('/preferences.json')
  expect(() => preview.set('graph.limit', 600)).toThrow('closed')
})

it('ignores a late save result without disturbing a new save lifetime', async () => {
  const disk = memoryPersistence()
  let finish!: (outcome: PreferenceSaveOutcome) => void
  const store = createPreferenceStore()
  await store.initialize({
    ...disk,
    save: () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  })
  store.set('graph.limit', 250)
  const oldWrite = store.flush()
  await Promise.resolve()
  store.dispose()
  await store.initialize(disk)
  store.set('graph.limit', 350)
  await store.flush()
  finish({
    Code: 'saved',
    Snapshot: { Content: '', Revision: 'old', Path: '/old.json' },
    Message: '',
  })
  await oldWrite
  expect(store.status.dirty).toBe(false)
  expect(store.values.value['graph.limit']).toBe(350)
  store.set('graph.limit', 450)
  await store.flush()
  expect(disk.content().user['graph.limit']).toBe(450)
})

it('preserves edits made while loading and serializes edits made during a save', async () => {
  const disk = memoryPersistence()
  const file = emptyPreferences()
  file.user['diff.layout'] = 'split'
  disk.external(file)
  let finishLoad!: () => void
  let finishSave!: () => void
  let waitForSave = true
  const store = createPreferenceStore()
  const opening = store.initialize({
    async load() {
      await new Promise<void>((resolve) => {
        finishLoad = resolve
      })
      return disk.load()
    },
    async save(revision, content) {
      if (waitForSave) {
        waitForSave = false
        await new Promise<void>((resolve) => {
          finishSave = resolve
        })
      }
      return disk.save(revision, content)
    },
  })
  store.set('graph.limit', 250)
  finishLoad()
  await opening
  await Promise.resolve()
  store.set('graph.limit', 350)
  finishSave()
  await store.flush()
  expect(disk.content().user).toEqual({ 'diff.layout': 'split', 'graph.limit': 350 })
  expect(store.status.dirty).toBe(false)
})

it('exports a schema with scope constraints and matching string validation', () => {
  const schema = preferenceSchema()
  expect(schema.properties.repositories.additionalProperties.properties).not.toHaveProperty(
    'appearance.theme',
  )
  const properties = schema.properties.user.properties
  expect(new RegExp(properties['appearance.uiFont']!.pattern!).test('Inter Variable')).toBe(true)
  expect(new RegExp(properties['appearance.uiFont']!.pattern!).test('bad\nfont')).toBe(false)
  expect(new RegExp(schema.properties.workspaces.propertyNames.pattern).test('work')).toBe(true)
  expect(new RegExp(schema.properties.workspaces.propertyNames.pattern).test('   ')).toBe(false)
})
