import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
})
describe('workspace library', () => {
  it('persists multiple workspaces, assignments and custom names', async () => {
    const { useWorkspaces } = await import('../composables/useWorkspaces')
    const ws = useWorkspaces()
    const work = ws.addWorkspace('Work', '#aabbcc')
    ws.saveRepo('/projects/ichi', 'Workbench', work.id)
    ws.state.repos[0]!.pinned = true
    ws.updateWorkspace(work.id, 'Studio', '#ddeeff')
    await vi.resetModules()
    const reloaded = (await import('../composables/useWorkspaces')).useWorkspaces()
    expect(reloaded.state.workspaces[1]!.name).toBe('Studio')
    expect(reloaded.state.repos[0]).toMatchObject({ name: 'Workbench', pinned: true, workspace: work.id })
    reloaded.removeWorkspace(work.id)
    expect(reloaded.state.repos[0]!.workspace).toBe('personal')
    expect(() => reloaded.removeWorkspace('personal')).toThrow('at least one')
  })
  it('rejects duplicates and canonicalizes opened repositories without losing labels', async () => {
    const ws = (await import('../composables/useWorkspaces')).useWorkspaces()
    expect(() => ws.addWorkspace(' personal ', '#aabbcc')).toThrow('already exists')
    ws.saveRepo('~/code/ichi/', 'Ichi desktop', 'personal')
    expect(() => ws.saveRepo('~/code/ichi', 'Other', 'personal')).toThrow('already saved')
    ws.openedRepo('~/code/ichi', '/home/me/code/ichi', 'ichi')
    expect(ws.state.repos).toHaveLength(1)
    expect(ws.state.repos[0]).toMatchObject({ path: '/home/me/code/ichi', name: 'Ichi desktop' })
    expect(ws.state.repos[0]!.lastOpened).toBeGreaterThan(0)
  })
  it('recovers from malformed storage', async () => {
    localStorage.setItem('ichi.desktop.workspaces.v1', '{broken')
    const ws = (await import('../composables/useWorkspaces')).useWorkspaces()
    expect(ws.state.workspaces).toHaveLength(1)
  })
})
