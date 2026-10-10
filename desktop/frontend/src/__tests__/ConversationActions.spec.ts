import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import CommentComposer from '../components/remote/CommentComposer.vue'
import CommentActions from '../components/remote/CommentActions.vue'
import ReviewThreadView from '../components/pr/ReviewThread.vue'
import ReviewDraftPanel from '../components/pr/ReviewDraftPanel.vue'
import { provideConversation } from '../components/remote/conversationContext'
import {
  DiscussionComment,
  ReactionGroup,
  ReviewThread,
  type ConversationAction,
  type ConversationReview,
} from '../bindings/github.com/atterpac/ichi/internal/remote'
const api = vi.hoisted(() => ({
  act: vi.fn<
    (remote: string, number: number, kind: string, input: ConversationAction) => Promise<void>
  >(),
  review: vi.fn<(remote: string, number: number, input: ConversationReview) => Promise<void>>(),
}))
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  PRService: { ConversationAction: api.act, PublishReview: api.review },
}))
let wrapper: VueWrapper | undefined
let sequence = 0
beforeEach(() => {
  vi.resetAllMocks()
  api.act.mockResolvedValue()
  api.review.mockResolvedValue()
  sequence++
})
afterEach(() => wrapper?.unmount())
function host(render: () => ReturnType<typeof h>, refresh = async () => {}) {
  return defineComponent({
    setup() {
      provideConversation(
        () => ({
          remote: 'origin',
          repo: 'owner/repo',
          number: sequence,
          kind: 'pr',
          login: 'alice',
        }),
        refresh,
      )
      return render
    },
  })
}
it('keeps composer drafts through remount and failed submission, then clears on success', async () => {
  const submit = vi
    .fn<(body: string) => Promise<void>>()
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue()
  const props = { draftKey: 'test-composer:' + sequence, submit, label: 'Post comment' }
  wrapper = mount(CommentComposer, { props })
  await wrapper.get('textarea').setValue('**Keep my text**')
  wrapper.unmount()
  wrapper = mount(CommentComposer, { props })
  expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('**Keep my text**')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('Offline')
  expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('**Keep my text**')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('')
  expect(submit).toHaveBeenCalledTimes(2)
})
it('does not clear a different conversation draft when an old submission completes', async () => {
  let finish!: () => void
  const submit = vi.fn<(body: string) => Promise<void>>(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  wrapper = mount(CommentComposer, { props: { draftKey: 'old:' + sequence, submit } })
  await wrapper.get('textarea').setValue('Old draft')
  await wrapper.get('form').trigger('submit')
  await wrapper.setProps({ draftKey: 'new:' + sequence })
  // A second mounted composer represents the new conversation while the old request is pending.
  const next = mount(CommentComposer, { props: { draftKey: 'new:' + sequence, submit } })
  await next.get('textarea').setValue('New draft')
  finish()
  await flushPromises()
  expect((next.get('textarea').element as HTMLTextAreaElement).value).toBe('New draft')
  expect(submit).toHaveBeenCalledTimes(1)
  next.unmount()
})
it('toggles reactions with the selected subject and respects permission flags', async () => {
  const comment = ref(
    new DiscussionComment({
      ID: 'c1',
      Body: 'Hi',
      URL: 'https://github.com/o/r',
      CanReact: true,
      Reactions: [new ReactionGroup({ Content: 'HEART', Count: 2, ViewerHasReacted: true })],
    }),
  )
  wrapper = mount(
    host(
      () => h(CommentActions, { comment: comment.value }),
      async () => {
        comment.value = new DiscussionComment({ ...comment.value, Reactions: [] })
      },
    ),
  )
  await wrapper.get('[aria-label="heart: 2"]').trigger('click')
  await flushPromises()
  expect(api.act).toHaveBeenLastCalledWith(
    'origin',
    sequence,
    'pr',
    expect.objectContaining({ Action: 'unreact', SubjectID: 'c1', Reaction: 'HEART' }),
  )
  expect(wrapper.find('[aria-label="heart: 2"]').exists()).toBe(false)
  await wrapper.get('[aria-label="Add reaction"]').trigger('click')
  await wrapper.get('[aria-label="rocket"]').trigger('click')
  await flushPromises()
  expect(api.act).toHaveBeenLastCalledWith(
    'origin',
    sequence,
    'pr',
    expect.objectContaining({ Action: 'react', Reaction: 'ROCKET' }),
  )
  expect(wrapper.text()).not.toContain('Delete')
})
it('edits permitted comments and requires an explicit delete confirmation', async () => {
  const comment = new DiscussionComment({
    ID: 'c1',
    Body: 'Original',
    CanUpdate: true,
    CanDelete: true,
  })
  wrapper = mount(host(() => h(CommentActions, { comment })))
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'Edit')!
    .trigger('click')
  await wrapper.get('textarea').setValue('Edited')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(api.act).toHaveBeenLastCalledWith(
    'origin',
    sequence,
    'pr',
    expect.objectContaining({ Action: 'edit', SubjectID: 'c1', Body: 'Edited' }),
  )
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'Delete')!
    .trigger('click')
  expect(api.act).toHaveBeenCalledTimes(1)
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'Delete comment')!
    .trigger('click')
  await flushPromises()
  expect(api.act).toHaveBeenLastCalledWith(
    'origin',
    sequence,
    'pr',
    expect.objectContaining({ Action: 'delete', SubjectID: 'c1' }),
  )
})
it('replies to and resolves the actual review thread', async () => {
  const thread = new ReviewThread({
    ID: 'thread1',
    Path: 'file.go',
    Line: 12,
    CanReply: true,
    CanResolve: true,
    Comments: [new DiscussionComment({ ID: 'c1', Body: 'Question' })],
  })
  wrapper = mount(host(() => h(ReviewThreadView, { thread })))
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'Reply')!
    .trigger('click')
  await wrapper.get('textarea').setValue('A reply')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(api.act).toHaveBeenLastCalledWith(
    'origin',
    sequence,
    'pr',
    expect.objectContaining({ Action: 'reply', SubjectID: 'thread1', Body: 'A reply' }),
  )
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'Resolve thread')!
    .trigger('click')
  await flushPromises()
  expect(api.act).toHaveBeenLastCalledWith(
    'origin',
    sequence,
    'pr',
    expect.objectContaining({ Action: 'resolve', SubjectID: 'thread1' }),
  )
})
it('keeps local inline review drafts on failure and blocks submission after the head changes', async () => {
  const target = ref<{ path: string; line: number; side: string } | null>({
      path: 'file.go',
      line: 12,
      side: 'LEFT',
    }),
    head = ref('head1')
  api.review.mockRejectedValueOnce(new Error('Offline')).mockResolvedValue()
  wrapper = mount(
    host(() =>
      h(ReviewDraftPanel, {
        head: head.value,
        author: 'bob',
        login: 'alice',
        open: true,
        target: target.value,
        onClearTarget: () => {
          target.value = null
        },
      }),
    ),
  )
  await wrapper.get('.comment-composer textarea').setValue('Keep this line')
  await wrapper.get('.comment-composer').trigger('submit')
  await flushPromises()
  expect(api.review).not.toHaveBeenCalled()
  await wrapper.get('textarea').setValue('Please revise')
  const submit = () => wrapper!.findAll('button').find((b) => b.text() === 'Submit review')!
  await submit().trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Offline')
  expect(wrapper.text()).toContain('Keep this line')
  head.value = 'head2'
  await flushPromises()
  expect(submit().attributes('disabled')).toBeDefined()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'I checked the updated diff')!
    .trigger('click')
  await submit().trigger('click')
  await flushPromises()
  expect(api.review).toHaveBeenLastCalledWith(
    'origin',
    sequence,
    expect.objectContaining({
      CommitOID: 'head2',
      Event: 'COMMENT',
      Body: 'Please revise',
      Comments: [
        expect.objectContaining({
          Path: 'file.go',
          Line: 12,
          Side: 'LEFT',
          Body: 'Keep this line',
        }),
      ],
    }),
  )
  expect(wrapper.text()).toContain('Review submitted.')
  expect(wrapper.text()).toContain('0 comments')
})
it('preserves newer text written to the same draft while an earlier post is pending', async () => {
  let finish!: () => void
  const submit = vi.fn<(body: string) => Promise<void>>(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const props = { draftKey: 'same-conversation:' + sequence, submit }
  wrapper = mount(CommentComposer, { props })
  await wrapper.get('textarea').setValue('First message')
  await wrapper.get('form').trigger('submit')
  const returning = mount(CommentComposer, { props })
  await returning.get('textarea').setValue('New message after navigating back')
  finish()
  await flushPromises()
  expect((returning.get('textarea').element as HTMLTextAreaElement).value).toBe(
    'New message after navigating back',
  )
  returning.unmount()
})
