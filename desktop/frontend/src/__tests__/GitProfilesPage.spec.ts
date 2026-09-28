import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import { GitProfile } from '../bindings/github.com/atterpac/ichi/desktop/services/models'
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  assign: vi.fn(),
  refresh: vi.fn(),
  register: vi.fn(),
}))
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', async () => {
  const models = await import('../bindings/github.com/atterpac/ichi/desktop/services/models')
  return { ...models, RepoService: { SaveGitProfile: mocks.save } }
})
const state = reactive({
  profiles: [] as GitProfile[],
  warnings: [],
  error: '',
  syncError: '',
  syncing: false,
  loading: false,
  effective: null,
})
const workspaces = reactive({
  workspaces: [{ id: 'work', name: 'Work', profileId: '' }],
  repos: [{ workspace: 'work', path: '/work/project', name: 'Project' }],
  profileFiles: [] as string[],
})
vi.mock('../composables/useGitProfiles', () => ({
  useGitProfiles: () => ({
    state,
    refresh: mocks.refresh,
    effective: async () => {},
    assign: mocks.assign,
    registerFile: mocks.register,
  }),
}))
vi.mock('../composables/useWorkspaces', () => ({ useWorkspaces: () => ({ state: workspaces }) }))
import GitProfilesPage from '../components/overlays/GitProfilesPage.vue'
function profile() {
  return new GitProfile({
    ID: '/work.gitconfig',
    Label: 'Work',
    Name: 'Work User',
    Email: 'work@example.test',
    SigningEnabled: 'false',
    TagSigningEnabled: 'false',
    SigningFormat: 'ssh',
    Source: '/work.gitconfig',
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  state.profiles = [profile()]
  workspaces.profileFiles = []
  workspaces.workspaces[0]!.profileId = ''
  mocks.refresh.mockResolvedValue(undefined)
  mocks.assign.mockResolvedValue(undefined)
})
describe('Git profile editor', () => {
  it('creates an explicit identity and registers its saved config file', async () => {
    const wrapper = mount(GitProfilesPage)
    const inputs = wrapper.findAll('fieldset input')
    await inputs[0]!.setValue('Personal')
    await inputs[1]!.setValue('Personal User')
    await inputs[2]!.setValue('personal@example.test')
    mocks.save.mockImplementation(
      async (p) => new GitProfile({ ...p, ID: '/new.gitconfig', Source: '/new.gitconfig' }),
    )
    await wrapper.get('form.profile-card').trigger('submit')
    await flushPromises()
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        Label: 'Personal',
        Email: 'personal@example.test',
        SigningEnabled: 'false',
        TagSigningEnabled: 'false',
      }),
    )
    expect(workspaces.profileFiles).toContain('/new.gitconfig')
    expect(wrapper.text()).toContain('Profile saved')
    wrapper.unmount()
  })
  it('duplicates global identities without allowing accidental global edits', async () => {
    state.profiles = [new GitProfile({ ...profile(), ID: 'global', Label: 'Global Git identity' })]
    const wrapper = mount(GitProfilesPage, { props: { initialProfile: 'global' } })
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Duplicate')!
      .trigger('click')
    expect(wrapper.get('fieldset').attributes('disabled')).toBeUndefined()
    mocks.save.mockImplementation(
      async (p) => new GitProfile({ ...p, ID: '/copy.gitconfig', Source: '/copy.gitconfig' }),
    )
    await wrapper.get('form.profile-card').trigger('submit')
    await flushPromises()
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ ID: '', Label: 'Global Git identity copy' }),
    )
    wrapper.unmount()
  })
  it('previews affected repositories and reports assignment failures', async () => {
    const wrapper = mount(GitProfilesPage)
    const selects = wrapper.findAll('section.profile-card select')
    await selects[1]!.setValue('/work.gitconfig')
    expect(wrapper.text()).toContain('1 repositories affected')
    expect(wrapper.text()).toContain('/work/project')
    mocks.assign.mockRejectedValueOnce(new Error('Repository config is locked'))
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Apply to workspace')!
      .trigger('click')
    await flushPromises()
    expect(mocks.assign).toHaveBeenCalledWith('work', '/work.gitconfig')
    expect(wrapper.get('[role="alert"]').text()).toContain('Repository config is locked')
    expect((selects[1]!.element as HTMLSelectElement).value).toBe('')
    wrapper.unmount()
  })
  it('keeps a failed save editable and protects unsaved changes when switching profiles', async () => {
    const wrapper = mount(GitProfilesPage, { props: { initialProfile: '/work.gitconfig' } })
    await wrapper.findAll('fieldset input')[0]!.setValue('Updated')
    mocks.save.mockRejectedValueOnce(new Error('Cannot write profile'))
    await wrapper.get('form.profile-card').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Cannot write profile')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'New profile')!
      .trigger('click')
    expect((wrapper.findAll('fieldset input')[0]!.element as HTMLInputElement).value).toBe(
      'Updated',
    )
    confirm.mockRestore()
    wrapper.unmount()
  })
})
