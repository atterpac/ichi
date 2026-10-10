<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ConversationReview,
  ReviewDraftComment,
} from '../../bindings/github.com/atterpac/ichi/internal/remote'
import { useConversation } from '../remote/conversationContext'
import { readDraft, writeDraft } from '../remote/conversationDrafts'
import CommentComposer from '../remote/CommentComposer.vue'
import MarkdownBody from './MarkdownBody.vue'
const props = defineProps<{
  head: string
  author: string
  login: string
  open: boolean
  target?: { path: string; line: number; side: string } | null
  repoUrl?: string
}>()
const emit = defineEmits<{ open: [url: string]; clearTarget: [] }>()
const context = useConversation()!
const storageKey = computed(() => context.key.value + ':review')
type Draft = { head: string; body: string; event: string; comments: ReviewDraftComment[] }
const draft = computed<Draft>(() => {
  try {
    const data = JSON.parse(readDraft(storageKey.value))
    if (Array.isArray(data.comments)) return data
  } catch {}
  return { head: props.head, body: '', event: 'COMMENT', comments: [] }
})
function save(value: Draft) {
  writeDraft(storageKey.value, JSON.stringify(value))
}
const body = computed({
  get: () => draft.value.body,
  set: (body) => save({ ...draft.value, body }),
})
const event = computed({
  get: () => draft.value.event,
  set: (event) => save({ ...draft.value, event }),
})
const expanded = ref(false),
  error = ref(''),
  success = ref(''),
  editing = ref(-1),
  preview = ref(false)
const stale = computed(
  () =>
    !!draft.value.head &&
    draft.value.head !== props.head &&
    !!(draft.value.body || draft.value.comments.length),
)
async function add(text: string) {
  const target = props.target
  if (!target) return
  if (stale.value) throw new Error('Check the existing draft against the current diff first.')
  save({
    ...draft.value,
    head: props.head,
    comments: [
      ...draft.value.comments,
      new ReviewDraftComment({
        Path: target.path,
        Line: target.line,
        Side: target.side,
        Body: text,
      }),
    ],
  })
  expanded.value = true
  emit('clearTarget')
}
function remove(index: number) {
  save({ ...draft.value, comments: draft.value.comments.filter((_, i) => i !== index) })
  editing.value = -1
}
async function editComment(index: number, text: string) {
  save({
    ...draft.value,
    comments: draft.value.comments.map((c, i) =>
      i === index ? new ReviewDraftComment({ ...c, Body: text }) : c,
    ),
  })
  editing.value = -1
}
async function publish() {
  if (context.busy.value || stale.value) return
  const key = storageKey.value,
    value = draft.value,
    originalDraft = readDraft(storageKey.value)
  error.value = ''
  success.value = ''
  try {
    await context.review(
      new ConversationReview({
        CommitOID: value.head || props.head,
        Event: value.event,
        Body: value.body,
        Comments: value.comments,
      }),
    )
    if (readDraft(key) === originalDraft) writeDraft(key, '')
    success.value = 'Review submitted.'
    expanded.value = false
  } catch (e) {
    error.value = String(e && typeof e === 'object' && 'message' in e ? e.message : e)
  }
}
</script>
<template>
  <section class="review-draft-panel" aria-label="Draft review">
    <CommentComposer
      v-if="target && open"
      :key="`${context.key.value}:${target.path}:${target.side}:${target.line}`"
      :draft-key="`${context.key.value}:line:${head}:${target.path}:${target.side}:${target.line}`"
      :title="`${target.path}:${target.line} (${target.side === 'LEFT' ? 'base' : 'head'})`"
      label="Add to review"
      :submit="add"
      :disabled="context.busy.value || stale"
      :repo-url="repoUrl"
      cancelable
      @cancel="emit('clearTarget')"
      @open="emit('open', $event)"
    />
    <button class="draft-toggle" :aria-expanded="expanded" @click="expanded = !expanded">
      Review draft
      <span
        >{{ draft.comments.length }}
        {{ draft.comments.length === 1 ? 'comment' : 'comments' }}</span
      >
      {{ expanded ? '▾' : '▸' }}
    </button>
    <p v-if="success" role="status">{{ success }}</p>
    <div v-if="expanded">
      <p class="draft-note">
        Draft kept on this device. Use + beside a diff line to add comments, then submit them
        together.
      </p>
      <p v-if="stale" class="draft-error">
        The PR head changed. Check each draft comment against the current diff.
        <button @click="save({ ...draft, head })">I checked the updated diff</button>
      </p>
      <article
        v-for="(comment, index) in draft.comments"
        :key="`${index}:${comment.Path}:${comment.Line}`"
      >
        <header>
          {{ comment.Path }}:{{ comment.Line }} · {{ comment.Side === 'LEFT' ? 'base' : 'head'
          }}<button :disabled="context.busy.value" @click="editing = index">Edit</button
          ><button :disabled="context.busy.value" @click="remove(index)">Remove</button>
        </header>
        <MarkdownBody
          :body="comment.Body"
          :repo-url="repoUrl"
          @open="emit('open', $event)"
        /><CommentComposer
          v-if="editing === index"
          :draft-key="`${context.key.value}:review-edit:${index}:${comment.Path}:${comment.Line}`"
          :initial-body="comment.Body"
          label="Save draft comment"
          :submit="(text) => editComment(index, text)"
          :disabled="context.busy.value"
          cancelable
          @cancel="editing = -1"
          @open="emit('open', $event)"
        />
      </article>
      <label
        >Review decision<select v-model="event" :disabled="context.busy.value || !open">
          <option value="COMMENT">Comment</option>
          <option value="APPROVE" :disabled="author === login">Approve</option>
          <option value="REQUEST_CHANGES" :disabled="author === login">Request changes</option>
        </select></label
      >
      <label
        >Review summary {{ event !== 'APPROVE' ? '(required)' : ''
        }}<textarea
          v-if="!preview"
          v-model="body"
          rows="4"
          maxlength="65536"
          :disabled="context.busy.value"
          placeholder="Summarize your review…"
        /></label
      ><MarkdownBody
        v-if="preview"
        :body="body || 'Nothing to preview yet.'"
        :repo-url="repoUrl"
        @open="emit('open', $event)"
      />
      <div class="draft-footer">
        <button @click="preview = !preview">{{ preview ? 'Write' : 'Preview' }}</button
        ><button
          :disabled="
            context.busy.value || !open || !head || stale || (event !== 'APPROVE' && !body.trim())
          "
          @click="publish"
        >
          {{ context.busy.value ? 'Submitting…' : 'Submit review' }}
        </button>
      </div>
      <p v-if="!open" class="draft-note">This PR is closed. Your draft is retained.</p>
    </div>
    <p v-if="error" class="draft-error" role="alert">
      {{ error }} Your draft is preserved. Refresh before retrying if the connection failed.
    </p>
  </section>
</template>
<style scoped>
.review-draft-panel {
  padding: 12px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}
.draft-toggle {
  width: 100%;
  display: flex;
  justify-content: space-between;
}
.draft-note {
  color: var(--text-mut);
  line-height: 1.6;
}
.draft-error {
  color: var(--negative-text);
}
button,
select,
textarea {
  font: inherit;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface-input);
  color: var(--text);
  padding: 6px 8px;
}
button {
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
label {
  display: grid;
  gap: 6px;
  margin: 12px 0;
}
textarea {
  resize: vertical;
  width: 100%;
  box-sizing: border-box;
}
article {
  padding: 10px;
  border: 1px solid var(--comment-border);
  background: var(--surface-card);
  border-radius: 6px;
  margin: 10px 0;
}
article header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
  overflow-wrap: anywhere;
}
.draft-footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
</style>
