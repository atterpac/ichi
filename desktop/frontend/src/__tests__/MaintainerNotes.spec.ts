import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MaintainerNotes from '../components/pr/MaintainerNotes.vue'
import { maintainerNoteKey } from '../components/pr/maintainerNotes'

let sequence = 0
function setup() {
  const repository = `notes-test-${++sequence}/repo`
  const key = maintainerNoteKey(repository, 7)
  const create = () => mount(MaintainerNotes, { props: { repository, number: 7 } })
  return { repository, key, create }
}
afterEach(() => vi.restoreAllMocks())

describe('local maintainer notes', () => {
  it('autosaves, restores on remount, and removes cleared notes', async () => {
    const { key, create } = setup()
    let wrapper = create()
    await wrapper.get('textarea').setValue('Release decision\nKeep this private')
    expect(localStorage.getItem(key)).toBe('Release decision\nKeep this private')
    wrapper.unmount()
    wrapper = create()
    expect(wrapper.get('textarea').element.value).toBe('Release decision\nKeep this private')
    await wrapper.get('textarea').setValue('')
    expect(localStorage.getItem(key)).toBeNull()
    wrapper.unmount()
  })

  it('isolates repositories, PR numbers, and hosts while normalizing repo casing', () => {
    expect(maintainerNoteKey('Owner/Repo', 7)).toBe(maintainerNoteKey('owner/repo', 7))
    expect(maintainerNoteKey('owner/repo', 7)).not.toBe(maintainerNoteKey('other/repo', 7))
    expect(maintainerNoteKey('owner/repo', 7)).not.toBe(maintainerNoteKey('owner/repo', 8))
    expect(maintainerNoteKey('owner/repo', 7)).not.toBe(
      maintainerNoteKey('owner/repo', 7, 'enterprise.test'),
    )
  })

  it('retains unsaved text across remount and allows retry', async () => {
    const { key, create } = setup()
    let wrapper = create()
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    await wrapper.get('textarea').setValue('Do not lose this')
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not save')
    wrapper.unmount()
    wrapper = create()
    expect(wrapper.get('textarea').element.value).toBe('Do not lose this')
    write.mockRestore()
    await wrapper.get('button').trigger('click')
    expect(localStorage.getItem(key)).toBe('Do not lose this')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('protects existing notes when reading storage fails', async () => {
    const { key, create } = setup()
    localStorage.setItem(key, 'Previously saved')
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('unavailable')
    })
    const wrapper = create()
    expect(wrapper.get('textarea').element.disabled).toBe(true)
    read.mockRestore()
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('textarea').element.value).toBe('Previously saved')
    expect(wrapper.get('textarea').element.disabled).toBe(false)
    wrapper.unmount()
  })
})
