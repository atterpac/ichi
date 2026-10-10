<script setup lang="ts">
import { computed, ref } from 'vue'
import MarkdownBody from '../pr/MarkdownBody.vue'
import UiButton from '../common/UiButton.vue'
import { readDraft, writeDraft } from './conversationDrafts'
const props = defineProps<{
  draftKey: string
  initialBody?: string
  label?: string
  title?: string
  submit: (body: string) => Promise<void>
  disabled?: boolean
  repoUrl?: string
  cancelable?: boolean
}>()
const emit = defineEmits<{ cancel: []; saved: []; open: [url: string] }>()
const text = computed({
  get: () => readDraft(props.draftKey, props.initialBody),
  set: (value) => writeDraft(props.draftKey, value),
})
const preview = ref(false),
  pending = ref(false),
  error = ref(''),
  status = ref('')
async function send() {
  if (pending.value || props.disabled || !text.value.trim()) return
  const key = props.draftKey,
    body = text.value
  pending.value = true
  error.value = ''
  status.value = ''
  try {
    await props.submit(body)
    if (readDraft(key) === body) writeDraft(key, '')
    status.value = 'Saved.'
    emit('saved')
  } catch (e) {
    error.value = String(e && typeof e === 'object' && 'message' in e ? e.message : e)
  } finally {
    pending.value = false
  }
}
</script>
<template>
  <form
    class="comment-composer"
    @submit.prevent="send"
    @keydown.ctrl.enter.prevent="send"
    @keydown.meta.enter.prevent="send"
  >
    <header>
      <strong>{{ title || label || 'Comment' }}</strong
      ><button type="button" :aria-pressed="preview" @click="preview = !preview">
        {{ preview ? 'Write' : 'Preview' }}
      </button>
    </header>
    <MarkdownBody
      v-if="preview"
      :body="text || 'Nothing to preview yet.'"
      :repo-url="repoUrl"
      @open="emit('open', $event)"
    />
    <textarea
      v-else
      v-model="text"
      :aria-label="label || 'Comment'"
      placeholder="Write Markdown…"
      :disabled="pending"
      maxlength="65536"
      rows="4"
    />
    <p v-if="error" class="composer-error" role="alert">
      {{ error }} Your draft is preserved. If the connection failed, refresh the conversation before
      retrying to avoid posting twice.
    </p>
    <footer>
      <small role="status">{{
        pending ? 'Submitting…' : status || 'Draft kept on this device · ⌘/Ctrl Enter to submit'
      }}</small
      ><UiButton v-if="cancelable" size="sm" :disabled="pending" @click="emit('cancel')"
        >Cancel</UiButton
      ><UiButton type="submit" size="sm" :disabled="pending || disabled || !text.trim()">{{
        pending ? 'Submitting…' : label || 'Comment'
      }}</UiButton>
    </footer>
  </form>
</template>
<style scoped>
.comment-composer {
  margin: 16px 0;
  padding: 12px;
  border: 1px solid var(--comment-border);
  border-radius: 8px;
  background: var(--surface-card);
}
header,
footer {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
header {
  flex-wrap: wrap;
  overflow-wrap: anywhere;
  margin-bottom: 10px;
}
header button {
  margin-left: auto;
}
footer {
  margin-top: 10px;
  flex-wrap: wrap;
}
small {
  color: var(--text-mut);
  flex: 1;
}
textarea {
  display: block;
  box-sizing: border-box;
  width: 100%;
  resize: vertical;
  min-height: 90px;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 10px;
  font: 13px/1.6 var(--font-mono);
  color: var(--text);
  background: var(--surface-input);
}
button {
  font: inherit;
  color: var(--text);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 4px 8px;
  cursor: pointer;
}
.composer-error {
  color: var(--negative-text);
  font-size: 12px;
}
</style>
