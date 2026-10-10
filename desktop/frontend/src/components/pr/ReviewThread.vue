<script setup lang="ts">
import type { ReviewThread } from '../../bindings/github.com/atterpac/ichi/internal/remote'
import MarkdownBody from './MarkdownBody.vue'
import ActivityIdentity from '../remote/ActivityIdentity.vue'
import UiButton from '../common/UiButton.vue'
import { ref } from 'vue'
import CommentActions from '../remote/CommentActions.vue'
import CommentComposer from '../remote/CommentComposer.vue'
import { useConversation } from '../remote/conversationContext'
const props = defineProps<{
  thread: ReviewThread
  compact?: boolean
  baseUrl?: string
  repoUrl?: string
}>()
defineEmits<{ file: [thread: ReviewThread]; open: [url: string] }>()
const context = useConversation()
const reply = ref(false),
  error = ref('')
async function sendReply(Body: string) {
  await context?.act({ Action: 'reply', SubjectID: props.thread.ID, Body })
  reply.value = false
}
async function resolveThread() {
  try {
    await context?.act({
      Action: props.thread.Resolved ? 'unresolve' : 'resolve',
      SubjectID: props.thread.ID,
    })
    error.value = ''
  } catch (e) {
    error.value = String(e && typeof e === 'object' && 'message' in e ? e.message : e)
  }
}
function date(value: string) {
  const d = new Date(value)
  return Number.isFinite(d.getTime()) && d.getFullYear() > 1 ? d.toLocaleString() : ''
}
</script>
<template>
  <details class="review-thread" :open="!thread.Resolved">
    <summary>
      <span class="thread-path"
        >{{
          compact
            ? thread.Line || thread.OriginalLine
              ? 'Line '
              : 'File discussion'
            : thread.Path
        }}<template v-if="thread.Line || thread.OriginalLine"
          >{{ compact ? '' : ':' }}{{ thread.Line || thread.OriginalLine }}</template
        ></span
      >
      <span class="thread-state" :class="{ resolved: thread.Resolved }">{{
        thread.Resolved ? 'Resolved' : 'Unresolved'
      }}</span>
      <span v-if="thread.Outdated" class="thread-state">Outdated</span>
      <span class="thread-count"
        >{{ thread.Comments.length }}
        {{ thread.Comments.length === 1 ? 'comment' : 'comments' }}</span
      >
    </summary>
    <div class="thread-context">
      <UiButton size="sm" @click="$emit('file', thread)"
        >View {{ thread.Side === 'LEFT' ? 'base' : 'head' }} diff</UiButton
      >
      <span v-if="thread.Outdated">This discussion refers to an earlier version.</span>
      <details v-if="thread.Comments[0]?.DiffHunk">
        <summary>Original code context</summary>
        <pre>{{ thread.Comments[0].DiffHunk }}</pre>
      </details>
    </div>
    <article
      v-for="(comment, i) in thread.Comments"
      :key="comment.ID"
      class="thread-comment"
      :class="{ reply: i > 0 }"
    >
      <header>
        <ActivityIdentity :author="comment.Author" :avatar-url="comment.AvatarURL" /><time
          :datetime="comment.CreatedAt"
          >{{ date(comment.CreatedAt) }}</time
        ><button v-if="comment.URL" class="comment-link" @click="$emit('open', comment.URL)">
          GitHub ↗
        </button>
      </header>
      <MarkdownBody
        class="comment-body"
        :body="comment.Body || 'No comment text.'"
        :base-url="baseUrl"
        :repo-url="repoUrl"
        @open="$emit('open', $event)"
      />
      <CommentActions :comment="comment" :repo-url="repoUrl" @open="$emit('open', $event)" />
    </article>
    <div v-if="context" class="thread-context">
      <UiButton
        v-if="thread.CanReply"
        size="sm"
        :disabled="context.busy.value"
        @click="reply = !reply"
        >Reply</UiButton
      >
      <UiButton
        v-if="thread.Resolved ? thread.CanUnresolve : thread.CanResolve"
        size="sm"
        :disabled="context.busy.value"
        @click="resolveThread"
        >{{ thread.Resolved ? 'Reopen thread' : 'Resolve thread' }}</UiButton
      >
      <p v-if="error" role="alert">{{ error }}</p>
      <CommentComposer
        v-if="reply"
        :draft-key="`${context.key.value}:reply:${thread.ID}`"
        :submit="sendReply"
        label="Reply to thread"
        :disabled="context.busy.value"
        :repo-url="repoUrl"
        cancelable
        @cancel="reply = false"
        @open="$emit('open', $event)"
      />
    </div>
    <p v-if="!thread.Comments.length" class="thread-context">Comments are no longer available.</p>
  </details>
</template>
<style scoped>
.review-thread {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  overflow: hidden;
}
.review-thread > summary {
  cursor: pointer;
  padding: 12px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  background: var(--surface-2);
}
.review-thread > summary::before {
  content: '▸';
  color: var(--text-mut);
}
.review-thread[open] > summary::before {
  content: '▾';
}
.thread-path {
  font: var(--fs-sm) var(--font-mono);
  overflow-wrap: anywhere;
}
.thread-state {
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 5px;
  font-size: var(--fs-xs);
  color: var(--warning-text);
}
.thread-state.resolved {
  color: var(--text-mut);
}
.thread-count {
  color: var(--text-mut);
  font-size: var(--fs-xs);
}
.thread-context {
  padding: 10px 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--text-mut);
  font-size: var(--fs-xs);
}
.thread-context :deep(.comment-composer) {
  width: 100%;
  min-width: 0;
}
.thread-context details {
  width: 100%;
}
.thread-context summary {
  cursor: pointer;
}
pre {
  overflow: auto;
  max-height: 260px;
  font: var(--fs-xs)/1.6 var(--font-mono);
  white-space: pre;
}
.thread-comment {
  border-top: 1px solid var(--border);
  padding: 12px;
}
.thread-comment.reply {
  border-left: 3px solid var(--accent-line);
}
header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  font-size: var(--fs-sm);
}
time {
  color: var(--text-mut);
  font-size: var(--fs-xs);
}
.comment-link {
  margin-left: auto;
  border: 0;
  background: none;
  color: var(--accent-text);
  cursor: pointer;
}
.comment-body {
  margin: 10px 0 0;
  overflow-wrap: anywhere;
  line-height: 1.6;
  font-size: var(--fs-md);
}

.thread-comment,
.thread-comment.reply {
  margin: 12px;
  padding: 0 12px 12px;
  border: 1px solid var(--comment-border);
  border-radius: var(--radius-md);
  background: var(--surface-card);
  overflow: hidden;
}
.thread-comment.reply {
  margin-left: 24px;
}
.thread-comment > header {
  margin: 0 -12px 12px;
  padding: 10px 12px;
  background: var(--comment-header);
  border-bottom: 1px solid var(--border);
  align-items: center;
}
</style>
