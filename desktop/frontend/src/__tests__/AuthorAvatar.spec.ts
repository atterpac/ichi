import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AuthorAvatar from '../components/common/AuthorAvatar.vue'
import { placeholderSvg } from '../components/common/avatarPlaceholder'
import { useShellSettings } from '../composables/useShellSettings'

function renderedSvg(svg: string) { const node = document.createElement('span'); node.innerHTML = svg; return node.innerHTML }

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), image: vi.fn() }))
vi.mock('../components/graph/authorIdentity', () => ({ resolveCommitAvatarHash: mocks.resolve, emailAvatarHash: vi.fn(async () => '') }))
vi.mock('../components/graph/authorAvatars', () => ({ authorInitials: (name: string) => name.split(' ').map(word => word[0]).join(''), loadAuthorAvatar: mocks.image }))

describe('shared author avatar', () => {
  it('defaults to Spore and changes placeholders immediately without replacing photos', async () => {
    const settings = useShellSettings()
    expect(settings.avatarPlaceholder).toBe('spore')
    mocks.resolve.mockResolvedValue('')
    const wrapper = mount(AuthorAvatar, { props: { name: 'Alex Chen' } })
    const initial = wrapper.get('.author-placeholder').element.innerHTML
    settings.avatarPlaceholder = 'alley'
    await flushPromises()
    expect(wrapper.get('.author-placeholder').element.innerHTML).not.toBe(initial)
    expect(wrapper.get('.author-placeholder').element.innerHTML).toBe(renderedSvg(placeholderSvg('Alex Chen', 'alley')))
    settings.avatarPlaceholder = 'spore'
    wrapper.unmount()
  })

  it('replaces the creature with the image and recovers if it fails to display', async () => {
    mocks.resolve.mockResolvedValue('hash')
    mocks.image.mockResolvedValue({ src: 'https://www.gravatar.com/avatar/test' })
    const wrapper = mount(AuthorAvatar, { props: { name: 'Rafael Zasas', commit: 'a'.repeat(40), size: 32 } })
    expect(wrapper.find('.author-placeholder svg').exists()).toBe(true)
    await flushPromises()
    expect(wrapper.get('img').attributes('src')).toContain('gravatar.com')
    useShellSettings().avatarPlaceholder = 'lumen'
    await flushPromises()
    expect(wrapper.get('img').attributes('src')).toContain('gravatar.com')
    useShellSettings().avatarPlaceholder = 'spore'
    await wrapper.get('img').trigger('error')
    expect(wrapper.find('.author-placeholder svg').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does not display the previous author image after switching commits', async () => {
    let resolve!: (image: { src: string }) => void
    mocks.resolve.mockResolvedValue('old-hash')
    mocks.image.mockImplementationOnce(() => new Promise(r => { resolve = r })).mockResolvedValue(null)
    const wrapper = mount(AuthorAvatar, { props: { name: 'Old Author', commit: 'b'.repeat(40) } })
    await flushPromises()
    await wrapper.setProps({ name: 'New Author', commit: 'c'.repeat(40) })
    await flushPromises()
    resolve({ src: 'https://www.gravatar.com/avatar/old' })
    await flushPromises()
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('.author-placeholder').element.innerHTML).toBe(renderedSvg(placeholderSvg('New Author', useShellSettings().avatarPlaceholder)))
    wrapper.unmount()
  })
})
