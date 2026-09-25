import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
const mocks = vi.hoisted(() => ({ info: vi.fn(), open: vi.fn(), on: vi.fn() }))
vi.mock('@wailsio/runtime', () => ({ Events: { On: mocks.on } }))
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({ RepoService: { Info: mocks.info, Open: mocks.open } }))
beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })
describe('repository switching', () => {
  it('ignores a late status response from the previous repository', async () => {
    let finish!: (value: { Path: string }) => void
    mocks.info.mockReturnValue(new Promise(resolve => { finish = resolve }))
    mocks.open.mockResolvedValue({ Path: '/new' })
    const api = await import('../composables/useRepoStatus')
    const state = api.useRepoStatus()
    await api.switchRepository('/new')
    finish({ Path: '/old' })
    await Promise.resolve()
    expect(state.info?.Path).toBe('/new')
    expect(state.switching).toBe(false)
  })
  it('keeps the active repo after an invalid path and permits retry', async () => {
    mocks.info.mockResolvedValue({ Path: '/current' })
    mocks.open.mockRejectedValueOnce(new Error('not a Git working tree')).mockResolvedValueOnce({ Path: '/next' })
    const api = await import('../composables/useRepoStatus')
    const state = api.useRepoStatus()
    await Promise.resolve()
    await expect(api.switchRepository('/missing')).rejects.toThrow('not a Git')
    expect(state.info?.Path).toBe('/current')
    expect(state.switching).toBe(false)
    await api.switchRepository('/next')
    expect(state.info?.Path).toBe('/next')
  })
  it('removes unsaved-edit guards when their owning view unmounts', async () => {
    const { useRepoSwitchGuard, repoSwitchBlocker } = await import('../composables/useRepoSwitchGuard')
    const wrapper = mount(defineComponent({ setup() { useRepoSwitchGuard(() => 'Save your edit'); return () => null } }))
    expect(repoSwitchBlocker()).toBe('Save your edit')
    wrapper.unmount()
    expect(repoSwitchBlocker()).toBe('')
  })
})
