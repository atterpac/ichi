import { computed, inject, provide, reactive, type InjectionKey, type Ref } from 'vue'
import { PRService } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import {
  ConversationAction,
  ConversationReview,
} from '../../bindings/github.com/atterpac/ichi/internal/remote'
export type ConversationLocation = {
  remote: string
  repo: string
  number: number
  kind: 'pr' | 'issue'
  login: string
}
export type ConversationContext = {
  key: Ref<string>
  busy: Ref<boolean>
  act: (action: Partial<ConversationAction>) => Promise<void>
  review: (review: ConversationReview) => Promise<void>
}
const pendingConversations = reactive<Record<string, boolean>>({})
const contextKey: InjectionKey<ConversationContext> = Symbol('conversation')
export function provideConversation(
  location: () => ConversationLocation,
  refresh: () => Promise<void>,
) {
  const key = computed(() => {
    const v = location()
    return JSON.stringify([v.repo, v.kind, v.number, v.login])
  })
  const busy = computed(() => !!pendingConversations[key.value])
  async function run(operation: (v: ConversationLocation) => Promise<void>) {
    if (busy.value) throw new Error('Another action is still being submitted.')
    const at = location(),
      original = key.value
    if (!at.number || !at.repo || !at.login)
      throw new Error('Open a conversation with an authenticated GitHub account first.')
    pendingConversations[original] = true
    try {
      await operation(at)
      if (key.value === original) await refresh()
    } finally {
      delete pendingConversations[original]
    }
  }
  const context: ConversationContext = {
    key,
    busy,
    act: (input) =>
      run((v) =>
        PRService.ConversationAction(v.remote, v.number, v.kind, new ConversationAction(input)),
      ),
    review: (input) => run((v) => PRService.PublishReview(v.remote, v.number, input)),
  }
  provide(contextKey, context)
  return context
}
export function useConversation() {
  return inject(contextKey, undefined)
}
