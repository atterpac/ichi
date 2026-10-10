<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ReactionGroup } from '../../bindings/github.com/atterpac/ichi/internal/remote'
import { useConversation } from './conversationContext'
import CommentComposer from './CommentComposer.vue'
const props = defineProps<{
  comment: {
    ID: string
    Body: string
    URL: string
    CanUpdate: boolean
    CanDelete: boolean
    CanReact: boolean
    Reactions: ReactionGroup[]
  }
  quote?: boolean
  repoUrl?: string
}>()
const emit = defineEmits<{ quote: [body: string]; changed: []; open: [url: string] }>()
const context = useConversation()
const editing = ref(false),
  confirmDelete = ref(false),
  picker = ref(false),
  error = ref(''),
  status = ref('')
const emojis = [
  ['THUMBS_UP', '👍'],
  ['THUMBS_DOWN', '👎'],
  ['LAUGH', '😄'],
  ['HOORAY', '🎉'],
  ['CONFUSED', '😕'],
  ['HEART', '❤️'],
  ['ROCKET', '🚀'],
  ['EYES', '👀'],
]
const groups = computed(() => props.comment.Reactions ?? [])
async function action(Action: string, Reaction = '') {
  if (!context) return
  error.value = ''
  try {
    await context.act({ Action, SubjectID: props.comment.ID, Reaction })
    confirmDelete.value = false
    picker.value = false
    emit('changed')
  } catch (e) {
    error.value = String(e && typeof e === 'object' && 'message' in e ? e.message : e)
  }
}
async function edit(Body: string) {
  await context?.act({ Action: 'edit', SubjectID: props.comment.ID, Body })
}
async function copy() {
  try {
    await navigator.clipboard.writeText(props.comment.URL)
    status.value = 'Link copied.'
  } catch {
    error.value = 'Could not copy the link.'
  }
}
</script>
<template>
  <div v-if="context" class="comment-actions">
    <div class="action-row">
      <button
        v-for="reaction in groups.filter((r) => r.Count > 0)"
        :key="reaction.Content"
        :aria-label="`${reaction.Content.replace(/_/g, ' ').toLowerCase()}: ${reaction.Count}`"
        :aria-pressed="reaction.ViewerHasReacted"
        :disabled="context.busy.value || !comment.CanReact"
        @click="action(reaction.ViewerHasReacted ? 'unreact' : 'react', reaction.Content)"
      >
        {{ emojis.find((e) => e[0] === reaction.Content)?.[1] }} {{ reaction.Count }}
      </button>
      <div v-if="comment.CanReact" class="reaction-picker">
        <button
          :disabled="context.busy.value"
          :aria-expanded="picker"
          aria-label="Add reaction"
          @click="picker = !picker"
        >
          ☺ +
        </button>
        <div v-if="picker" class="reaction-options" @keydown.esc.stop="picker = false">
          <button
            v-for="[name, emoji] in emojis"
            :key="name"
            :aria-label="name!.replace(/_/g, ' ').toLowerCase()"
            :disabled="context.busy.value"
            :aria-pressed="groups.some((r) => r.Content === name && r.ViewerHasReacted)"
            @click="
              action(
                groups.some((r) => r.Content === name && r.ViewerHasReacted) ? 'unreact' : 'react',
                name,
              )
            "
          >
            {{ emoji }}
          </button>
        </div>
      </div>
      <button v-if="quote" @click="emit('quote', comment.Body)">Quote reply</button>
      <details class="comment-menu">
        <summary aria-label="Comment actions">•••</summary>
        <div>
          <button
            v-if="comment.CanUpdate"
            :disabled="context.busy.value"
            @click="editing = !editing"
          >
            Edit</button
          ><button
            v-if="comment.CanDelete"
            :disabled="context.busy.value"
            @click="confirmDelete = true"
          >
            Delete</button
          ><button v-if="comment.URL" @click="copy">Copy link</button>
        </div>
      </details>
    </div>
    <p v-if="error" class="action-error" role="alert">{{ error }}</p>
    <small v-if="status" role="status">{{ status }}</small>
    <div v-if="confirmDelete" class="delete-confirm">
      Delete this comment permanently?
      <button :disabled="context.busy.value" @click="action('delete')">Delete comment</button
      ><button @click="confirmDelete = false">Cancel</button>
    </div>
    <CommentComposer
      v-if="editing"
      :draft-key="`${context.key.value}:edit:${comment.ID}`"
      :initial-body="comment.Body"
      :submit="edit"
      label="Save changes"
      :disabled="context.busy.value"
      :repo-url="repoUrl"
      cancelable
      @cancel="editing = false"
      @saved="editing = false"
      @open="emit('open', $event)"
    />
  </div>
</template>
<style scoped>
.comment-actions {
  margin-top: 12px;
  font-size: 12px;
}
.action-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  flex-wrap: wrap;
}
button,
summary {
  font: inherit;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: transparent;
  color: var(--text-mut);
  padding: 4px 7px;
  cursor: pointer;
}
button[aria-pressed='true'] {
  background: var(--selected);
  color: var(--accent-text);
  border-color: var(--accent-line);
}
button:disabled {
  cursor: default;
}
.comment-menu {
  margin-left: auto;
}
.comment-menu > div {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 6px 0;
}
summary {
  list-style: none;
}
.reaction-picker {
  position: relative;
}
.reaction-options {
  display: grid;
  grid-template-columns: repeat(4, 32px);
  max-width: 250px;
  gap: 4px;
  padding: 8px;
  background: var(--surface-overlay);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.action-error,
.delete-confirm {
  color: var(--negative-text);
}
.delete-confirm {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 0;
}
</style>
