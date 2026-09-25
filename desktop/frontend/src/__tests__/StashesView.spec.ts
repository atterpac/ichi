import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import StashesView from '../components/refs/StashesView.vue'
import { useShellSettings } from '../composables/useShellSettings'

const applyIndex = vi.fn<(i: number) => Promise<void>>(() => Promise.resolve())
const popIndex = vi.fn<(i: number) => Promise<void>>(() => Promise.resolve())
const dropIndex = vi.fn<(i: number) => Promise<void>>(() => Promise.resolve())
const checkoutFiles = vi.fn<(i: number, paths: string[]) => Promise<void>>(() => Promise.resolve())
const stashFiles = vi.fn<
  (i: number) => Promise<{ Path: string; Added: number; Deleted: number }[]>
>((i) =>
  Promise.resolve([
    { Path: 'src/a.ts', Added: 10, Deleted: 2 },
    { Path: 'src/b.ts', Added: 3, Deleted: 3 },
    { Path: 'README.md', Added: 1, Deleted: 0 },
  ]),
)

vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  StashService: {
    ListStashes: () =>
      Promise.resolve([
        { Index: 0, Branch: 'main', Message: 'WIP layout tweak' },
        { Index: 1, Branch: 'feature/x', Message: 'half-done refactor' },
      ]),
    StashApplyIndex: (i: number) => applyIndex(i),
    StashPopIndex: (i: number) => popIndex(i),
    StashDropIndex: (i: number) => dropIndex(i),
    StashBranch: () => Promise.resolve(),
    StashPush: () => Promise.resolve(),
    StashClear: () => Promise.resolve(),
    StashFiles: (i: number) => stashFiles(i),
    StashCheckoutFiles: (i: number, paths: string[]) => checkoutFiles(i, paths),
  },
}))

async function mountView() {
  const wrapper = mount(StashesView, {
    attachTo: document.body,
    global: { stubs: { Teleport: true } },
  })
  await flushPromises()
  return wrapper
}

describe('StashesView', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    applyIndex.mockClear()
    popIndex.mockClear()
    dropIndex.mockClear()
    checkoutFiles.mockClear()
    stashFiles.mockClear()
  })

  afterEach(() => {
    useShellSettings().stashesDetailVisible = true
  })

  it('routes keys from the focused details pane and returns to the list', async () => {
    const wrapper = await mountView()
    const list = wrapper.find('.branches-list')
    await list.trigger('keydown', { key: 'l' })
    expect(document.activeElement).toBe(wrapper.find('.branch-detail').element)
    await wrapper.find('.branch-detail').trigger('keydown', { key: 'j' })
    expect(wrapper.find('.st-file.cursor').text()).toContain('src/b.ts')
    await wrapper.find('.branch-detail').trigger('keydown', { key: 'Escape' })
    expect(document.activeElement).toBe(list.element)
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    list.element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    await wrapper.find('.map-segment').trigger('keydown', { key: 'Enter' })
    expect(checkoutFiles).not.toHaveBeenCalled()
    expect(applyIndex).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('lists stashes with index and origin', async () => {
    const wrapper = await mountView()
    const rows = wrapper.findAll('.branch-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.find('.stash-idx').text()).toBe('0')
    expect(rows[0]!.text()).toContain('WIP layout tweak')
    expect(rows[0]!.find('.stash-branch').text()).toContain('on main')
    wrapper.unmount()
  })

  it('applies the selected stash on enter', async () => {
    const wrapper = await mountView()
    const list = wrapper.find('.branches-list')
    await list.trigger('keydown', { key: 'j' })
    await list.trigger('keydown', { key: 'Enter' })
    expect(applyIndex).toHaveBeenCalledWith(1)
    wrapper.unmount()
  })

  it('pops with p', async () => {
    const wrapper = await mountView()
    const list = wrapper.find('.branches-list')
    await list.trigger('keydown', { key: 'p' })
    expect(popIndex).toHaveBeenCalledWith(0)
    wrapper.unmount()
  })

  it('confirms before dropping, then drops', async () => {
    const wrapper = await mountView()
    const list = wrapper.find('.branches-list')
    await list.trigger('keydown', { key: 'd' })
    await flushPromises()
    const confirm = document.querySelector<HTMLButtonElement>('.operation-primary')
    expect(dropIndex).not.toHaveBeenCalled()
    confirm?.click()
    await flushPromises()
    expect(dropIndex).toHaveBeenCalledWith(0)
    wrapper.unmount()
  })

  it('renders the stash files as chips with churn', async () => {
    const wrapper = await mountView()
    expect(stashFiles).toHaveBeenCalledWith(0)
    const chips = wrapper.findAll('.st-file')
    expect(chips).toHaveLength(3)
    expect(chips[0]!.find('.st-file-path').text()).toBe('src/a.ts')
    expect(chips[0]!.find('.st-file-delta .add').text()).toBe('+10')
    wrapper.unmount()
  })

  it('moves the file cursor from the heatmap without selecting or restoring files', async () => {
    const wrapper = await mountView()
    await wrapper.findAll('.map-segment')[1]!.trigger('click')
    expect(wrapper.find('.st-file.cursor').text()).toContain('src/b.ts')
    expect(wrapper.findAll('.st-file.on')).toHaveLength(0)
    expect(checkoutFiles).not.toHaveBeenCalled()
    expect(applyIndex).not.toHaveBeenCalled()
    await wrapper.find('.branches-list').trigger('keydown', { key: 'j' })
    expect(wrapper.findAll('.map-segment')[2]!.attributes('aria-pressed')).toBe('true')
    wrapper.unmount()
  })

  it('steps into the file list, selects files, and restores just those', async () => {
    const wrapper = await mountView()
    const list = wrapper.find('.branches-list')
    // enter the pane, select first file, move down, select second
    await list.trigger('keydown', { key: 'l' })
    await list.trigger('keydown', { key: ' ' }) // select src/a.ts, cursor advances
    await list.trigger('keydown', { key: ' ' }) // select src/b.ts
    await flushPromises()
    expect(wrapper.find('.st-selcount').text()).toContain('2 selected')
    await list.trigger('keydown', { key: 'a' })
    await flushPromises()
    expect(checkoutFiles).toHaveBeenCalledWith(0, ['src/a.ts', 'src/b.ts'])
    wrapper.unmount()
  })

  it('restores the cursor file with enter when nothing is ticked', async () => {
    const wrapper = await mountView()
    const list = wrapper.find('.branches-list')
    await list.trigger('keydown', { key: 'l' })
    await list.trigger('keydown', { key: 'j' }) // move to src/b.ts
    await list.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(checkoutFiles).toHaveBeenCalledWith(0, ['src/b.ts'])
    wrapper.unmount()
  })
})
